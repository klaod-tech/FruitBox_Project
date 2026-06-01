/*
 * ui.c  –  ncurses 기반 렌더링 스레드 및 마우스 이벤트 처리
 * 담당: 김현진
 *
 * REQ-006 FNC-006 : render_thread()  – 30FPS 실시간 렌더링
 * REQ-002 FNC-002 : handle_mouse()   – 드래그 영역 선택
 * REQ-007 FNC-007 : 리셋 버튼 클릭
 * REQ-008 FNC-008 : draw_gameover()
 * REQ-010 FNC-010 : 돋보기 아이콘 클릭
 * REQ-011 FNC-011 : 숫자 변환 아이콘 클릭
 *
 * 렌더링 최적화:
 *   wnoutrefresh(stdscr) 후 doupdate() 한 번으로 flush
 *   → 더블 버퍼링으로 깜빡임 방지
 */

#include "ui.h"
#include "board.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <ncurses.h>

/* ─────────────────────────────────────
 * 인벤토리 아이콘 화면 위치 (하단 HUD)
 *   클릭 영역 판정에 사용 (REQ-010, REQ-011)
 * ───────────────────────────────────── */
#define HUD_ROW        (BOARD_OFF_Y + BOARD_ROWS * CELL_H + 1)
#define ICON_HINT_COL  4
#define ICON_CHANGE_COL 12
#define RESET_ROW      (HUD_ROW + 2)
#define RESET_COL      4
#define RESET_WIDTH    9

/* ─────────────────────────────────────
 * ncurses 초기화
 * ───────────────────────────────────── */
void ui_init(void)
{
    initscr();
    cbreak();
    noecho();
    keypad(stdscr, TRUE);
    nodelay(stdscr, TRUE);   /* 논블로킹 getch() */
    curs_set(0);

    /*
     * 마우스 이벤트 등록
     *   REPORT_MOUSE_POSITION: 드래그 중간 좌표 수신
     *   → printf("\033[?1003h") 필요할 수 있음 (터미널 의존)
     */
    mousemask(BUTTON1_PRESSED | BUTTON1_RELEASED |
              REPORT_MOUSE_POSITION, NULL);
    mouseinterval(0);

    /* 터미널에 마우스 모션 이벤트 활성화 (xterm 1003 모드)
     * → 이 시퀀스 없이는 드래그 중 좌표가 수신되지 않음 */
    printf("\033[?1003h");
    fflush(stdout);

    /* 컬러 초기화 */
    start_color();
    use_default_colors();
    init_pair(COL_NORMAL,      COLOR_WHITE,  -1);
    init_pair(COL_SELECT,      COLOR_BLACK,  COLOR_YELLOW);
    init_pair(COL_REMOVED,     COLOR_BLACK,  -1);
    init_pair(COL_ITEM_BOMB,   COLOR_RED,    -1);
    init_pair(COL_ITEM_CLOCK,  COLOR_CYAN,   -1);
    init_pair(COL_GREEN, COLOR_GREEN,  -1);
    init_pair(COL_TIMER_WARN,  COLOR_RED,    -1);
    init_pair(COL_HINT,        COLOR_BLACK,  COLOR_GREEN);
    init_pair(COL_UI_BG,       COLOR_WHITE,  COLOR_BLUE);
}

void ui_cleanup(void)
{
    /* 마우스 모션 이벤트 모드 복구 */
    printf("\033[?1003l");
    fflush(stdout);
    endwin();
}

/* ─────────────────────────────────────
 * 좌표 변환: 터미널 → 보드 셀
 * ───────────────────────────────────── */
int scr_to_row(int y) { return (y - BOARD_OFF_Y) / CELL_H; }
int scr_to_col(int x) { return (x - BOARD_OFF_X) / CELL_W; }

/* ─────────────────────────────────────
 * 드래그 영역 내 포함 여부
 * ───────────────────────────────────── */
static bool in_selection(int r, int c)
{
    if (!drag.active) return false;
    int rmin = (drag.startY < drag.endY) ? drag.startY : drag.endY;
    int rmax = (drag.startY > drag.endY) ? drag.startY : drag.endY;
    int cmin = (drag.startX < drag.endX) ? drag.startX : drag.endX;
    int cmax = (drag.startX > drag.endX) ? drag.startX : drag.endX;
    return (r >= rmin && r <= rmax && c >= cmin && c <= cmax);
}

/* ─────────────────────────────────────
 * draw_board  –  보드 전체 그리기
 *   removed=true  → 빈 칸
 *   is_item=true  → 아이템 표시
 *   선택 영역     → 노란 하이라이트
 *   돋보기 강조   → 초록 하이라이트
 * ───────────────────────────────────── */
void draw_board(void)
{
    for (int r = 0; r < BOARD_ROWS; r++) {
        for (int c = 0; c < BOARD_COLS; c++) {
            int sy = BOARD_OFF_Y + r * CELL_H;
            int sx = BOARD_OFF_X + c * CELL_W;
            Apple *a = &board[r][c];

            move(sy, sx);

            if (a->removed) {
                attron(COLOR_PAIR(COL_REMOVED));
                addstr("    ");
                attroff(COLOR_PAIR(COL_REMOVED));
                continue;
            }

            /* 색상 페어 결정 */
            int pair = a->color_pair;  /* 기본값: COL_NORMAL */
            if (flags.hint_active && r == flags.hint_row &&
                (c == flags.hint_col || c == flags.hint_col + 1))
                pair = COL_HINT;
            else if (in_selection(r, c))
                pair = COL_SELECT;

            attron(COLOR_PAIR(pair));

            if (a->is_item) {
                switch (item_types[r][c]) {
                    case ITYPE_BOMB:  addstr("[B] "); break;
                    case ITYPE_CLOCK: addstr("[C] "); break;
                    default:          addstr("[?] "); break;
                }
            } else {
                printw(" %d  ", a->value);
            }

            attroff(COLOR_PAIR(pair));
        }
    }
}

/* ─────────────────────────────────────
 * draw_hud  –  점수 / 시간 / 인벤토리
 * ───────────────────────────────────── */
void draw_hud(void)
{
    /* 상단 헤더 */
    pthread_mutex_lock(&board_mutex);
    int sc = score;
    int tl = time_remaining;
    int ic_hint   = item_counts[ITEM_HINT];
    int ic_change = item_counts[ITEM_CHANGE];
    pthread_mutex_unlock(&board_mutex);

    mvprintw(0, 2, "FruitBox   SCORE: %5d   BEST: %5d", sc, best_score);
    mvprintw(1, 2, "─────────────────────────────────────────");

    /* 타이머 (15초 이하 빨간색 경고) */
    if (tl <= 15) attron(COLOR_PAIR(COL_TIMER_WARN) | A_BOLD);
    mvprintw(2, 2, "TIME: %3d s", tl);
    if (tl <= 15) attroff(COLOR_PAIR(COL_TIMER_WARN) | A_BOLD);

    /* 인벤토리 아이콘 (하단) */
    int hud = HUD_ROW;
    mvprintw(hud, 2, "ITEMS:");

    /* 돋보기 아이콘 */
    if (flags.change_mode == false)
        attron(COLOR_PAIR(ic_hint > 0 ? COL_GREEN : COL_REMOVED));
    mvprintw(hud, ICON_HINT_COL, "[E:%d]", ic_hint);
    attroff(COLOR_PAIR(COL_GREEN));
    attroff(COLOR_PAIR(COL_REMOVED));

    /* 숫자 변환 아이콘 */
    attron(COLOR_PAIR(ic_change > 0 ? COL_ITEM_CLOCK : COL_REMOVED));
    mvprintw(hud, ICON_CHANGE_COL, "[W:%d]", ic_change);
    attroff(COLOR_PAIR(COL_ITEM_CLOCK));
    attroff(COLOR_PAIR(COL_REMOVED));

    /* 선택 합계 실시간 표시 */
    if (drag.active) {
        pthread_mutex_lock(&board_mutex);
        int s = sum_region(drag.startY, drag.startX,
                           drag.endY,   drag.endX);
        pthread_mutex_unlock(&board_mutex);

        int pair = (s == TARGET_SUM) ? COL_GREEN : COL_TIMER_WARN;
        attron(COLOR_PAIR(pair) | A_BOLD);
        mvprintw(hud, 22, "합계: %2d/%2d  %s",
                 s, TARGET_SUM,
                 (s == TARGET_SUM) ? "<< 손 떼세요! >>" : "              ");
        attroff(COLOR_PAIR(pair) | A_BOLD);
    } else {
        mvprintw(hud, 22, "                              ");
    }

    /* 조작 안내 */
    mvprintw(RESET_ROW + 1, 2,
        "[q]종료 [p]일시정지 [e]돋보기 [w]숫자변환 | 드래그=합10선택");

    /* 리셋 버튼 (REQ-007) */
    attron(COLOR_PAIR(COL_UI_BG));
    mvprintw(RESET_ROW, RESET_COL, " RESET ");
    attroff(COLOR_PAIR(COL_UI_BG));

    /* 일시정지 오버레이 */
    if (flags.paused) {
        int mid_y = BOARD_OFF_Y + (BOARD_ROWS * CELL_H) / 2;
        attron(A_BOLD | COLOR_PAIR(COL_UI_BG));
        mvprintw(mid_y, BOARD_OFF_X + 20, "  PAUSED  ");
        attroff(A_BOLD | COLOR_PAIR(COL_UI_BG));
    }
}

/* ─────────────────────────────────────
 * REQ-008 FNC-008: 게임 오버 화면
 * ───────────────────────────────────── */
void draw_gameover(void)
{
    int cy = BOARD_OFF_Y + BOARD_ROWS * CELL_H / 2 - 2;
    int cx = BOARD_OFF_X + 18;

    attron(A_BOLD | COLOR_PAIR(COL_TIMER_WARN));
    mvprintw(cy,     cx, "  GAME OVER  ");
    mvprintw(cy + 1, cx, " SCORE: %5d", score);
    mvprintw(cy + 2, cx, " BEST:  %5d", best_score);
    attroff(A_BOLD | COLOR_PAIR(COL_TIMER_WARN));

    attron(COLOR_PAIR(COL_UI_BG));
    mvprintw(cy + 4, cx, " [R] 재시작  [Q] 종료 ");
    attroff(COLOR_PAIR(COL_UI_BG));
}

/* ─────────────────────────────────────
 * REQ-006 FNC-006: 렌더링 스레드 (tid_render)
 *   30FPS 목표: 33ms 마다 화면 갱신
 *   wnoutrefresh() + doupdate() 패턴으로 깜빡임 방지
 * ───────────────────────────────────── */
void *render_thread(void *arg)
{
    (void)arg;

    while (1) {
        pthread_mutex_lock(&board_mutex);
        bool over = flags.game_over;
        pthread_mutex_unlock(&board_mutex);

        /* board 읽기는 짧은 락으로 처리 */
        pthread_mutex_lock(&board_mutex);

        erase();  /* 전체 화면 지우기 (clear() 보다 빠름) */

        if (over) {
            draw_board();
            draw_hud();
            draw_gameover();
        } else {
            draw_board();
            draw_hud();
        }

        pthread_mutex_unlock(&board_mutex);

        /* 핵심: wnoutrefresh → doupdate 더블버퍼 패턴 */
        wnoutrefresh(stdscr);
        doupdate();

        /* 30FPS = 약 33ms */
        usleep(33000);

        if (over) break;
    }

    return NULL;
}

/* ─────────────────────────────────────
 * REQ-002 FNC-002 / REQ-007 / REQ-010 / REQ-011
 * handle_mouse  –  마우스 이벤트 통합 처리
 *
 *   BUTTON1_PRESSED  → 드래그 시작 / 아이콘 클릭 판정
 *   REPORT_MOUSE_POS → 드래그 끝점 갱신
 *   BUTTON1_RELEASED → 드래그 끝 → 합산 → 제거
 * ───────────────────────────────────── */
void handle_mouse(MEVENT *ev)
{
    int my = ev->y;
    int mx = ev->x;
    int r  = scr_to_row(my);
    int c  = scr_to_col(mx);

    /* ── BUTTON1_PRESSED ── */
    if (ev->bstate & BUTTON1_PRESSED) {

        /* 리셋 버튼 클릭 (REQ-007) */
        if (my == RESET_ROW &&
            mx >= RESET_COL && mx < RESET_COL + RESET_WIDTH) {
            flags.reset_request = true;
            return;
        }

        /* 돋보기 아이콘 클릭 (REQ-010, Q키 단축키도 input_loop 에서 처리) */
        if (my == HUD_ROW && mx >= ICON_HINT_COL && mx < ICON_HINT_COL + 6) {
            pthread_mutex_lock(&board_mutex);
            if (item_counts[ITEM_HINT] > 0) {
                int hr, hc;
                if (find_hint(&hr, &hc)) {
                    item_counts[ITEM_HINT]--;
                    flags.hint_active = true;
                    flags.hint_row    = hr;
                    flags.hint_col    = hc;
                    flags.hint_timer  = 3;   /* 3초 강조 */
                }
            }
            pthread_mutex_unlock(&board_mutex);
            return;
        }

        /* 숫자 변환 아이콘 클릭 (REQ-011) */
        if (my == HUD_ROW && mx >= ICON_CHANGE_COL && mx < ICON_CHANGE_COL + 6) {
            pthread_mutex_lock(&board_mutex);
            if (item_counts[ITEM_CHANGE] > 0 && !flags.change_mode) {
                flags.change_mode = true;   /* 다음 클릭에서 대상 지정 */
            }
            pthread_mutex_unlock(&board_mutex);
            return;
        }

        /* 숫자 변환 모드: 보드 클릭 → 해당 칸을 1로 변경 */
        if (flags.change_mode) {
            pthread_mutex_lock(&board_mutex);
            if (r >= 0 && r < BOARD_ROWS && c >= 0 && c < BOARD_COLS) {
                change_to_one(r, c);
                item_counts[ITEM_CHANGE]--;
                flags.change_mode = false;
            }
            pthread_mutex_unlock(&board_mutex);
            return;
        }

        /* 일반 드래그 시작 */
        if (r >= 0 && r < BOARD_ROWS && c >= 0 && c < BOARD_COLS) {
            drag.startY = drag.endY = r;
            drag.startX = drag.endX = c;
            drag.active = true;
        }

    /* ── REPORT_MOUSE_POSITION (드래그 중) ── */
    } else if (ev->bstate & REPORT_MOUSE_POSITION && drag.active) {
        if (r >= 0 && r < BOARD_ROWS) drag.endY = r;
        if (c >= 0 && c < BOARD_COLS) drag.endX = c;

    /* ── BUTTON1_RELEASED (드래그 끝) ── */
    } else if (ev->bstate & BUTTON1_RELEASED && drag.active) {
        if (r >= 0 && r < BOARD_ROWS) drag.endY = r;
        if (c >= 0 && c < BOARD_COLS) drag.endX = c;
        drag.active = false;

        /* 합산 판정 및 제거 (REQ-003, REQ-004) */
        pthread_mutex_lock(&board_mutex);
        remove_region(drag.startY, drag.startX,
                      drag.endY,   drag.endX);
        pthread_mutex_unlock(&board_mutex);
    }
}
