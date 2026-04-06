/*
 * game_core.c - FruitBox WebAssembly 게임 코어
 *
 * Emscripten으로 컴파일되어 브라우저에서 실행됩니다.
 * ncurses / pthread 의존성 없이 순수 게임 로직만 포함합니다.
 * JS에서 ccall/cwrap으로 아래 EMSCRIPTEN_KEEPALIVE 함수를 호출합니다.
 */

#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <time.h>
#include <emscripten.h>

/* ─────────────────────────────────────
 * 게임 상수
 * ───────────────────────────────────── */
#define BOARD_ROWS      10
#define BOARD_COLS      17
#define TARGET_SUM      10
#define GAME_TIME       120
#define SCORE_PER_APPLE 1

/* 아이템 타입 */
#define ITYPE_NONE   0
#define ITYPE_BOMB   1
#define ITYPE_CLOCK  2
#define ITYPE_DOUBLE 3

/* 인벤토리 슬롯 */
#define ITEM_HINT       0
#define ITEM_CHANGE     1
#define ITEM_HINT_INIT   2
#define ITEM_CHANGE_INIT 2

/* ─────────────────────────────────────
 * 자료구조
 * ───────────────────────────────────── */
typedef struct {
    int  value;
    int  item_type;   /* ITYPE_* */
    bool is_item;
    bool removed;
} Cell;

/* ─────────────────────────────────────
 * 전역 게임 상태
 * ───────────────────────────────────── */
static Cell board[BOARD_ROWS][BOARD_COLS];
static int  score          = 0;
static int  time_remaining = GAME_TIME;
static bool game_over      = false;
static bool paused         = false;
static int  item_counts[2] = {ITEM_HINT_INIT, ITEM_CHANGE_INIT};
static int  best_score     = 0;

/* 힌트 상태 */
static bool hint_active = false;
static int  hint_row    = -1;
static int  hint_col    = -1;
static int  hint_timer  = 0;   /* tick 단위 */

/* ─────────────────────────────────────
 * 내부 유틸
 * ───────────────────────────────────── */
static int  clamp_r(int r) { return r < 0 ? 0 : (r >= BOARD_ROWS ? BOARD_ROWS-1 : r); }
static int  clamp_c(int c) { return c < 0 ? 0 : (c >= BOARD_COLS ? BOARD_COLS-1 : c); }

/* ─────────────────────────────────────
 * 보드 초기화
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
void init_game(void)
{
    srand((unsigned)time(NULL));

    for (int r = 0; r < BOARD_ROWS; r++)
        for (int c = 0; c < BOARD_COLS; c++) {
            board[r][c].value     = (rand() % 9) + 1;
            board[r][c].item_type = ITYPE_NONE;
            board[r][c].is_item   = false;
            board[r][c].removed   = false;
        }

    score          = 0;
    time_remaining = GAME_TIME;
    game_over      = false;
    paused         = false;
    hint_active    = false;
    hint_timer     = 0;
    item_counts[ITEM_HINT]   = ITEM_HINT_INIT;
    item_counts[ITEM_CHANGE] = ITEM_CHANGE_INIT;
}

/* ─────────────────────────────────────
 * 셀 정보 조회 (JS → Canvas 렌더링용)
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE int  get_cell_value(int r, int c)     { return board[r][c].value; }
EMSCRIPTEN_KEEPALIVE int  get_cell_removed(int r, int c)   { return board[r][c].removed ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int  get_cell_is_item(int r, int c)   { return board[r][c].is_item ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int  get_cell_item_type(int r, int c) { return board[r][c].item_type; }

/* ─────────────────────────────────────
 * 게임 상태 조회
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE int  get_score(void)          { return score; }
EMSCRIPTEN_KEEPALIVE int  get_best_score(void)     { return best_score; }
EMSCRIPTEN_KEEPALIVE int  get_time(void)           { return time_remaining; }
EMSCRIPTEN_KEEPALIVE int  is_game_over(void)       { return game_over ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int  is_paused(void)          { return paused ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int  get_item_count(int type) { return item_counts[type]; }

/* 힌트 상태 */
EMSCRIPTEN_KEEPALIVE int  get_hint_active(void) { return hint_active ? 1 : 0; }
EMSCRIPTEN_KEEPALIVE int  get_hint_row(void)    { return hint_row; }
EMSCRIPTEN_KEEPALIVE int  get_hint_col(void)    { return hint_col; }

/* ─────────────────────────────────────
 * 합산 판정
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
int sum_region(int r1, int c1, int r2, int c2)
{
    int rmin = clamp_r(r1 < r2 ? r1 : r2);
    int rmax = clamp_r(r1 > r2 ? r1 : r2);
    int cmin = clamp_c(c1 < c2 ? c1 : c2);
    int cmax = clamp_c(c1 > c2 ? c1 : c2);

    int sum = 0;
    for (int r = rmin; r <= rmax; r++)
        for (int c = cmin; c <= cmax; c++)
            if (!board[r][c].removed && !board[r][c].is_item)
                sum += board[r][c].value;
    return sum;
}

/* ─────────────────────────────────────
 * 인접 4칸 파괴 (폭탄 효과)
 * ───────────────────────────────────── */
static void explode_adjacent(int row, int col)
{
    int dr[] = {-1, 1, 0, 0};
    int dc[] = {0, 0, -1, 1};
    for (int d = 0; d < 4; d++) {
        int nr = row + dr[d];
        int nc = col + dc[d];
        if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS)
            board[nr][nc].removed = true;
    }
}

/* ─────────────────────────────────────
 * 아이템 스폰 (제거된 칸 목록 중 랜덤 1칸, 10% 확률)
 * ───────────────────────────────────── */
static void spawn_item_in(int cells[][2], int cnt)
{
    if (cnt == 0) return;

    int idx = rand() % cnt;
    int r = cells[idx][0];
    int c = cells[idx][1];

    /* ITYPE_DOUBLE 비활성화 → BOMB/CLOCK만 스폰 */
    int chosen = (rand() % 2 == 0) ? ITYPE_BOMB : ITYPE_CLOCK;

    board[r][c].removed   = false;
    board[r][c].value     = 0;
    board[r][c].is_item   = true;
    board[r][c].item_type = chosen;
}

/* ─────────────────────────────────────
 * 영역 제거 및 점수 반영
 *   반환값: 획득 점수 (0 = 제거 안 됨)
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
int remove_region(int r1, int c1, int r2, int c2)
{
    int s = sum_region(r1, c1, r2, c2);
    if (s <= 0 || s % TARGET_SUM != 0) return 0;

    int rmin = clamp_r(r1 < r2 ? r1 : r2);
    int rmax = clamp_r(r1 > r2 ? r1 : r2);
    int cmin = clamp_c(c1 < c2 ? c1 : c2);
    int cmax = clamp_c(c1 > c2 ? c1 : c2);

    /* 제거된 칸 목록 수집 후 일괄 제거 */
    int removed_cells[BOARD_ROWS * BOARD_COLS][2];
    int count = 0;
    for (int r = rmin; r <= rmax; r++)
        for (int c = cmin; c <= cmax; c++) {
            if (board[r][c].removed) continue;
            removed_cells[count][0] = r;
            removed_cells[count][1] = c;
            board[r][c].removed = true;
            count++;
        }

    int gained = count * SCORE_PER_APPLE;
    score += gained;

    /* 10% 확률로 방금 제거된 칸 중 한 곳에 아이템 스폰 */
    if (rand() % 100 < 10) spawn_item_in(removed_cells, count);

    return gained;
}

/* ─────────────────────────────────────
 * 타이머 틱 (JS에서 1초마다 호출)
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
void tick(void)
{
    if (game_over || paused) return;

    if (time_remaining > 0) time_remaining--;
    if (time_remaining == 0) {
        game_over = true;
        if (score > best_score) best_score = score;
    }

    if (hint_active && hint_timer > 0) {
        hint_timer--;
        if (hint_timer == 0) hint_active = false;
    }
}

/* ─────────────────────────────────────
 * 일시정지 토글
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
void toggle_pause(void) { if (!game_over) paused = !paused; }

/* ─────────────────────────────────────
 * 돋보기 아이템 사용 (합 10인 위치 강조)
 *   반환값: 1 = 찾음, 0 = 없음 또는 아이템 없음
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
int use_hint(void)
{
    if (item_counts[ITEM_HINT] <= 0) return 0;

    /* 수평 탐색 */
    for (int r = 0; r < BOARD_ROWS; r++)
        for (int c = 0; c < BOARD_COLS - 1; c++) {
            if (board[r][c].removed || board[r][c].is_item) continue;
            if (board[r][c+1].removed || board[r][c+1].is_item) continue;
            if (board[r][c].value + board[r][c+1].value == TARGET_SUM) {
                item_counts[ITEM_HINT]--;
                hint_active = true;
                hint_row    = r;
                hint_col    = c;
                hint_timer  = 3;
                return 1;
            }
        }
    /* 수직 탐색 */
    for (int r = 0; r < BOARD_ROWS - 1; r++)
        for (int c = 0; c < BOARD_COLS; c++) {
            if (board[r][c].removed   || board[r][c].is_item) continue;
            if (board[r+1][c].removed || board[r+1][c].is_item) continue;
            if (board[r][c].value + board[r+1][c].value == TARGET_SUM) {
                item_counts[ITEM_HINT]--;
                hint_active = true;
                hint_row    = r;
                hint_col    = c;
                hint_timer  = 3;
                return 1;
            }
        }
    return 0;
}

/* ─────────────────────────────────────
 * 숫자 변환 아이템 사용 (지정 칸 → 1)
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
int use_change(int r, int c)
{
    if (item_counts[ITEM_CHANGE] <= 0) return 0;
    if (r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS) return 0;
    if (board[r][c].removed || board[r][c].is_item) return 0;

    board[r][c].value = 1;
    item_counts[ITEM_CHANGE]--;
    return 1;
}

/* ─────────────────────────────────────
 * 아이템 클릭 사용 (폭탄 / 시계)
 *   반환값: 1 = 사용됨, 0 = 해당 없음
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
int click_item(int r, int c)
{
    if (r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS) return 0;
    if (board[r][c].removed || !board[r][c].is_item) return 0;

    int type = board[r][c].item_type;
    board[r][c].removed = true;

    if (type == ITYPE_BOMB) {
        explode_adjacent(r, c);
        score += 5;   /* 폭탄 보너스 */
    } else if (type == ITYPE_CLOCK) {
        time_remaining += 5;
    }

    return 1;
}

/* ─────────────────────────────────────
 * 재시작
 * ───────────────────────────────────── */
EMSCRIPTEN_KEEPALIVE
void restart_game(void) { init_game(); }
