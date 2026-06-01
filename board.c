/*
 * board.c  –  보드 생성 / 합산 판정 / 제거 / 아이템 / 파일 I/O
 * 담당: 우진
 *
 * REQ-001 FNC-001 : init_board()      – 보드 생성
 * REQ-003 FNC-003 : sum_region()      – 합산 판정
 * REQ-004 FNC-004 : remove_region()   – 사과 제거 및 점수 반영
 * REQ-010 FNC-010 : find_hint()       – 돋보기: 합 10 탐색
 * REQ-011 FNC-011 : change_to_one()   – 숫자 변환
 */

#include "board.h"
#include "ui.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <ncurses.h>

/* ─────────────────────────────────────
 * REQ-001 FNC-001: 보드 생성 로직
 *   board[10][17] 에 1~9 무작위 배치
 *   board_mutex 잠금 후 호출할 것
 * ───────────────────────────────────── */
void init_board(void)
{
    static bool seeded = false;
    if (!seeded) { srand((unsigned)time(NULL)); seeded = true; }

    memset(item_types, 0, sizeof(item_types));

    for (int r = 0; r < BOARD_ROWS; r++) {
        for (int c = 0; c < BOARD_COLS; c++) {
            board[r][c].value      = (rand() % 9) + 1;
            board[r][c].color_pair = COL_NORMAL;
            board[r][c].is_item    = false;
            board[r][c].removed    = false;
            item_types[r][c]       = ITYPE_NONE;
        }
    }
}

/* ─────────────────────────────────────
 * REQ-003 FNC-003: 숫자 합산 판정
 *   선택된 직사각형 범위 내 removed=false 사과 합산
 *   is_item=true 사과는 합산에서 제외 (특수 아이템)
 *   board_mutex 잠근 상태에서 호출
 * ───────────────────────────────────── */
int sum_region(int startY, int startX, int endY, int endX)
{
    /* 좌표 정렬 */
    int rmin = (startY < endY) ? startY : endY;
    int rmax = (startY > endY) ? startY : endY;
    int cmin = (startX < endX) ? startX : endX;
    int cmax = (startX > endX) ? startX : endX;

    /* 범위 클램핑 */
    if (rmin < 0) rmin = 0;  if (rmax >= BOARD_ROWS) rmax = BOARD_ROWS - 1;
    if (cmin < 0) cmin = 0;  if (cmax >= BOARD_COLS) cmax = BOARD_COLS - 1;

    int sum = 0;
    for (int r = rmin; r <= rmax; r++)
        for (int c = cmin; c <= cmax; c++)
            if (!board[r][c].removed && !board[r][c].is_item)
                sum += board[r][c].value;

    return sum;
}

/* ─────────────────────────────────────
 * REQ-004 FNC-004: 사과 제거 및 점수 반영
 *   합이 TARGET_SUM(10) 인 경우에만 제거
 *   점수 = 제거된 사과 개수 × SCORE_PER_APPLE (시간 보상 없음)
 *   ITYPE_BOMB 포함 시 인접 4칸 추가 파괴
 *   board_mutex 잠근 상태에서 호출
 *   반환값: 획득 점수 (0이면 제거 안 됨)
 * ───────────────────────────────────── */
int remove_region(int startY, int startX, int endY, int endX)
{
    if (sum_region(startY, startX, endY, endX) != TARGET_SUM)
        return 0;

    int rmin = (startY < endY) ? startY : endY;
    int rmax = (startY > endY) ? startY : endY;
    int cmin = (startX < endX) ? startX : endX;
    int cmax = (startX > endX) ? startX : endX;

    if (rmin < 0) rmin = 0;  if (rmax >= BOARD_ROWS) rmax = BOARD_ROWS - 1;
    if (cmin < 0) cmin = 0;  if (cmax >= BOARD_COLS) cmax = BOARD_COLS - 1;

    /* 1차 패스: 특수 효과 확인 */
    int bomb_r = -1, bomb_c = -1;

    for (int r = rmin; r <= rmax; r++)
        for (int c = cmin; c <= cmax; c++) {
            if (board[r][c].removed) continue;
            if (item_types[r][c] == ITYPE_BOMB) { bomb_r = r; bomb_c = c; }
        }

    /* 2차 패스: 일반 사과 제거 (removed = true) */
    int count = 0;
    for (int r = rmin; r <= rmax; r++)
        for (int c = cmin; c <= cmax; c++) {
            if (board[r][c].removed) continue;
            board[r][c].removed = true;
            count++;
        }

    /* BOMB 효과: 인접 4칸 추가 파괴 */
    if (bomb_r >= 0)
        explode_adjacent(bomb_r, bomb_c);

    /* 점수 계산 (시간 보상 없음 – 문서 명시) */
    int gained = count * SCORE_PER_APPLE;

    score += gained;

    /* 제거 발생 시 30% 확률로 아이템 스폰 */
    if (rand() % 100 < 30)
        spawn_item();

    return gained;
}

/* ─────────────────────────────────────
 * 인접 4칸 파괴 (BOMB 효과)
 * ───────────────────────────────────── */
void explode_adjacent(int row, int col)
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
 * 특수 아이템 스폰
 *   removed=true 인 빈 칸에 랜덤 배치
 *   item_types[][] 에 종류 기록
 *   board_mutex 잠근 상태에서 호출
 * ───────────────────────────────────── */
void spawn_item(void)
{
    int empties[BOARD_ROWS * BOARD_COLS][2];
    int cnt = 0;

    for (int r = 0; r < BOARD_ROWS; r++)
        for (int c = 0; c < BOARD_COLS; c++)
            if (board[r][c].removed) {
                empties[cnt][0] = r;
                empties[cnt][1] = c;
                cnt++;
            }

    if (cnt == 0) return;

    int idx = rand() % cnt;
    int r = empties[idx][0];
    int c = empties[idx][1];

    /* 타입 랜덤: BOMB 50% / CLOCK 50% */
    ItemType chosen = (rand() % 2 == 0) ? ITYPE_BOMB : ITYPE_CLOCK;

    board[r][c].removed    = false;
    board[r][c].value      = 0;
    board[r][c].is_item    = true;
    board[r][c].color_pair = (chosen == ITYPE_BOMB) ? COL_ITEM_BOMB : COL_ITEM_CLOCK;
    item_types[r][c] = chosen;
}

/* ─────────────────────────────────────
 * REQ-010 FNC-010: 돋보기 – 합 10 탐색
 *   보드 전체를 순회하여 합이 TARGET_SUM 인
 *   최소 2개 이상의 사과 위치 반환 (좌상단)
 *   반환: true = 찾음, false = 없음
 *   (문서 주석: "구현 힘들겠다" → 간단한 선형 탐색으로 구현)
 * ───────────────────────────────────── */
bool find_hint(int *out_r, int *out_c)
{
    /* 인접 2칸 수평 합산 탐색 (단순 버전) */
    for (int r = 0; r < BOARD_ROWS; r++) {
        for (int c = 0; c < BOARD_COLS - 1; c++) {
            if (board[r][c].removed || board[r][c].is_item) continue;
            if (board[r][c+1].removed || board[r][c+1].is_item) continue;
            if (board[r][c].value + board[r][c+1].value == TARGET_SUM) {
                *out_r = r; *out_c = c;
                return true;
            }
        }
    }
    /* 수직 2칸 */
    for (int r = 0; r < BOARD_ROWS - 1; r++) {
        for (int c = 0; c < BOARD_COLS; c++) {
            if (board[r][c].removed   || board[r][c].is_item) continue;
            if (board[r+1][c].removed || board[r+1][c].is_item) continue;
            if (board[r][c].value + board[r+1][c].value == TARGET_SUM) {
                *out_r = r; *out_c = c;
                return true;
            }
        }
    }
    return false;
}

/* ─────────────────────────────────────
 * REQ-011 FNC-011: 숫자 변환
 *   지정 칸의 value 를 1 로 강제 변경
 *   board_mutex 잠근 상태에서 호출
 * ───────────────────────────────────── */
void change_to_one(int row, int col)
{
    if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) return;
    if (board[row][col].removed || board[row][col].is_item) return;

    board[row][col].value = 1;
}

/* ─────────────────────────────────────
 * 파일 I/O: 점수 저장 / 불러오기
 * ───────────────────────────────────── */
void save_score(int sc)
{
    FILE *fp = fopen(SCORE_FILE, "a");
    if (!fp) return;
    time_t now = time(NULL);
    fprintf(fp, "%d %ld\n", sc, (long)now);
    fclose(fp);
}

int load_best_score(void)
{
    FILE *fp = fopen(SCORE_FILE, "r");
    if (!fp) return 0;
    int best = 0, s;
    long t;
    while (fscanf(fp, "%d %ld", &s, &t) == 2)
        if (s > best) best = s;
    fclose(fp);
    return best;
}
