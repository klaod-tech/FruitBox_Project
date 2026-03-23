/*
 * main.c  –  전역 변수 정의 및 게임 진입점
 * 담당: 이동욱 (총괄)
 *
 * [전역 변수 문서 규칙]
 *   헤더에서는 extern 선언만, 정의(메모리 할당)는 여기서만 합니다.
 *   board, score, time_remaining → board_mutex 로 보호
 */

#include "apple.h"
#include "board.h"
#include "ui.h"

#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>

/* ═══════════════════════════════════════
 * 전역 변수 정의 (문서: 정의 위치 = src/main.c)
 * ═══════════════════════════════════════ */
Apple           board[BOARD_ROWS][BOARD_COLS];
int             score          = 0;
int             time_remaining = GAME_TIME;
pthread_mutex_t board_mutex    = PTHREAD_MUTEX_INITIALIZER;
pthread_t       tid_timer;
pthread_t       tid_render;

/* 문서 외 추가 전역 */
DragRegion      drag           = {0, 0, 0, 0, false};
GameFlags       flags          = {false, false, false, false, false, -1, -1, 0};
ItemType        item_types[BOARD_ROWS][BOARD_COLS];
int             item_counts[ITEM_MAX_TYPES] = {ITEM_HINT_INIT, ITEM_CHANGE_INIT};
int             best_score     = 0;

/* ═══════════════════════════════════════
 * [스레드 1] 타이머 스레드  (REQ-005 FNC-005)
 *
 *   - 1초마다 time_remaining 감소
 *   - 0초 도달 시 game_over 플래그 설정
 *   - board_mutex 로 time_remaining 보호
 *   ※ 입력 대기와 완전 분리 → 기존 단일스레드의
 *     "입력 대기 중 타이머 정지" 문제 해결
 * ═══════════════════════════════════════ */
static void *timer_func(void *arg)
{
    (void)arg;

    while (1) {
        sleep(1);

        pthread_mutex_lock(&board_mutex);

        if (flags.game_over) {
            pthread_mutex_unlock(&board_mutex);
            break;
        }

        if (!flags.paused) {
            if (time_remaining > 0) {
                time_remaining--;
            }
            if (time_remaining == 0) {
                flags.game_over = true;
                pthread_mutex_unlock(&board_mutex);
                break;
            }
        }

        /* 돋보기 강조 타이머 감소 */
        if (flags.hint_active && flags.hint_timer > 0) {
            flags.hint_timer--;
            if (flags.hint_timer == 0)
                flags.hint_active = false;
        }

        pthread_mutex_unlock(&board_mutex);
    }

    return NULL;
}

/* ═══════════════════════════════════════
 * 입력 처리 루프 (메인 스레드)
 *   마우스 / 키보드 이벤트 수신
 *   getch() 는 nodelay(TRUE) 로 논블로킹
 * ═══════════════════════════════════════ */
static void input_loop(void)
{
    MEVENT ev;
    int    ch;

    while (1) {
        ch = getch();

        /* 게임 오버 상태: R(재시작) / Q(종료) 만 허용 */
        if (flags.game_over) {
            if (ch == 'r' || ch == 'R') {
                pthread_mutex_lock(&board_mutex);
                score          = 0;
                time_remaining = GAME_TIME;
                flags.game_over     = false;
                flags.paused        = false;
                flags.hint_active   = false;
                flags.change_mode   = false;
                item_counts[ITEM_HINT]   = ITEM_HINT_INIT;
                item_counts[ITEM_CHANGE] = ITEM_CHANGE_INIT;
                init_board();
                pthread_mutex_unlock(&board_mutex);

                /* 타이머 스레드 재시작 */
                pthread_create(&tid_timer, NULL, timer_func, NULL);
            } else if (ch == 'q' || ch == 'Q') {
                break;
            }
            usleep(16000);
            continue;
        }

        if (ch == KEY_MOUSE && getmouse(&ev) == OK) {
            handle_mouse(&ev);   /* ui.c */
        } else if (ch == 'q' || ch == 'Q') {
            pthread_mutex_lock(&board_mutex);
            flags.game_over = true;
            pthread_mutex_unlock(&board_mutex);
            break;
        } else if (ch == 'p' || ch == 'P') {
            pthread_mutex_lock(&board_mutex);
            flags.paused = !flags.paused;
            pthread_mutex_unlock(&board_mutex);
        }

        /* REQ-007: 리셋 요청 처리 */
        if (flags.reset_request) {
            pthread_mutex_lock(&board_mutex);
            score          = 0;
            time_remaining = GAME_TIME;
            flags.reset_request = false;
            flags.hint_active   = false;
            flags.change_mode   = false;
            init_board();
            pthread_mutex_unlock(&board_mutex);
        }

        usleep(5000);   /* 5ms: CPU 과부하 방지 */
    }
}

/* ═══════════════════════════════════════
 * main
 * ═══════════════════════════════════════ */
int main(void)
{
    system("mkdir -p data");

    best_score = load_best_score();

    /* UI(ncurses) 초기화 */
    ui_init();

    /* 보드 초기화 (REQ-001) */
    init_board();

    /* 스레드 생성 */
    pthread_create(&tid_timer,  NULL, timer_func,    NULL);  /* 타이머  */
    pthread_create(&tid_render, NULL, render_thread, NULL);  /* 렌더링 (REQ-006) */

    /* 메인 스레드: 입력 루프 */
    input_loop();

    /* 종료 대기 */
    pthread_mutex_lock(&board_mutex);
    flags.game_over = true;
    pthread_mutex_unlock(&board_mutex);

    pthread_join(tid_timer,  NULL);
    pthread_join(tid_render, NULL);

    /* 최고 점수 저장 */
    if (score > best_score) best_score = score;
    save_score(score);

    ui_cleanup();

    printf("게임 종료! 최종 점수: %d  최고 점수: %d\n", score, best_score);
    pthread_mutex_destroy(&board_mutex);
    return 0;
}
