#ifndef UI_H
#define UI_H

/*
 * ui.h  –  ncurses UI 렌더링 및 마우스 이벤트 함수 선언
 * 담당: 김현진
 */

#include "apple.h"
#include <ncurses.h>

/* ncurses 색상 페어 번호 */
#define COL_NORMAL   1   /* 기본 사과  */
#define COL_SELECT   2   /* 드래그 선택 중 */
#define COL_REMOVED  3   /* 제거된 칸  */
#define COL_ITEM_BOMB   4
#define COL_ITEM_CLOCK  5
#define COL_ITEM_DOUBLE 6
#define COL_TIMER_WARN  7   /* 타이머 15초 이하 경고 */
#define COL_HINT        8   /* 돋보기 강조 */
#define COL_UI_BG       9   /* UI 패널 배경 */

/* 보드 화면 시작 오프셋 */
#define BOARD_OFF_Y  3
#define BOARD_OFF_X  2
#define CELL_W       4    /* 셀 가로 너비 (문자 수) */
#define CELL_H       2    /* 셀 세로 높이 (라인 수) */

/* ncurses 초기화 / 종료 */
void ui_init(void);
void ui_cleanup(void);

/* REQ-006 FNC-006: 실시간 화면 렌더링 (tid_render 스레드에서 호출) */
void *render_thread(void *arg);

/* 개별 화면 렌더링 함수 */
void draw_board(void);
void draw_hud(void);        /* 점수, 시간, 인벤토리 */
void draw_selection(void);  /* 드래그 선택 영역 하이라이트 */
void draw_hint(void);       /* 돋보기 강조 */

/* REQ-008 FNC-008: 게임 오버 화면 */
void draw_gameover(void);

/* REQ-007 FNC-007: 리셋 버튼 영역 */
void draw_menu_bar(void);

/* 마우스 이벤트 처리 (REQ-002, REQ-007, REQ-010, REQ-011) */
void handle_mouse(MEVENT *ev);

/* 좌표 변환 유틸 */
int scr_to_row(int y);
int scr_to_col(int x);

#endif /* UI_H */
