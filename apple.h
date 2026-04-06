#ifndef APPLE_H
#define APPLE_H

/*
 * apple.h  –  Apple 구조체 및 전역 변수 extern 선언
 *
 * [전역 변수 문서 기준]
 *   - board      : Apple[10][17]   정의: src/main.c  동기화: board_mutex
 *   - score      : int             정의: src/main.c  동기화: board_mutex
 *   - time_remaining : int         정의: src/main.c  동기화: board_mutex
 *   - board_mutex: pthread_mutex_t 정의: src/main.c
 *   - tid_timer  : pthread_t       정의: src/main.c
 *   - tid_render : pthread_t       정의: src/main.c
 */

#include <pthread.h>
#include <stdbool.h>

/* ─────────────────────────────────────
 * 게임 상수
 * ───────────────────────────────────── */
#define BOARD_ROWS      10
#define BOARD_COLS      17
#define GAME_TIME       120      /* 제한 시간 (초) */
#define TARGET_SUM      10       /* 제거 조건 합계 */
#define SCORE_PER_APPLE 1        /* 사과 1개 제거 시 점수 */
#define RENDER_FPS      30       /* 목표 렌더링 FPS */
#define SCORE_FILE      "data/score.dat"

/* 아이템 인벤토리 슬롯 인덱스 */
#define ITEM_HINT       0        /* 돋보기: 합 10 쌍 3초 강조 */
#define ITEM_CHANGE     1        /* 숫자 변환: 선택 사과 → 1 */
#define ITEM_MAX_TYPES  2

/* 아이템 초기 보유 개수 */
#define ITEM_HINT_INIT   2
#define ITEM_CHANGE_INIT 2

/* ─────────────────────────────────────
 * Apple 구조체
 *   문서 명세 필드를 그대로 사용
 * ───────────────────────────────────── */
typedef struct {
    int  value;       /* 사과에 표시될 숫자 (1~9) */
    int  color_pair;  /* ncurses 색상 조합 번호   */
    bool is_item;     /* 특수 아이템(폭탄, 시계 등) 여부 */
    bool removed;     /* 사과가 지워졌는지 (true면 화면에 안 그림) */
} Apple;

/* ─────────────────────────────────────
 * ItemType – 특수 아이템 종류 식별
 *   is_item == true 인 Apple 에 부여
 * ───────────────────────────────────── */
typedef enum {
    ITYPE_NONE   = 0,
    ITYPE_BOMB   = 1,   /* 폭탄: 인접 4칸 제거          */
    ITYPE_CLOCK  = 2,   /* 시계: 타이머 +5초            */
    ITYPE_DOUBLE = 3    /* 더블: 해당 턴 점수 2배       */
} ItemType;

/* ─────────────────────────────────────
 * 드래그 선택 영역
 * ───────────────────────────────────── */
typedef struct {
    int  startX, startY;   /* 드래그 시작 열/행 */
    int  endX,   endY;     /* 드래그 끝   열/행 */
    bool active;           /* 드래그 진행 중 여부 */
} DragRegion;

/* ─────────────────────────────────────
 * 게임 제어 플래그
 * ───────────────────────────────────── */
typedef struct {
    bool game_over;      /* 타이머 0 또는 Q키로 종료 */
    bool paused;         /* P키 일시정지 */
    bool reset_request;  /* 리셋 버튼 클릭 */
    /* 아이템 사용 모드 */
    bool hint_active;       /* 돋보기 효과 표시 중 */
    bool change_mode;       /* 숫자 변환 아이템 대기 중 */
    int  hint_row, hint_col;  /* 강조할 사과 위치 */
    int  hint_timer;          /* 강조 남은 틱 수     */
} GameFlags;

/* ─────────────────────────────────────
 * 전역 변수 extern 선언
 *   정의(메모리 할당)는 src/main.c 에서만
 * ───────────────────────────────────── */
extern Apple          board[BOARD_ROWS][BOARD_COLS];
extern int            score;
extern int            time_remaining;
extern pthread_mutex_t board_mutex;
extern pthread_t      tid_timer;
extern pthread_t      tid_render;

/* 문서 외 추가 전역 (팀 합의 후 등록 필요) */
extern DragRegion     drag;
extern GameFlags      flags;
extern ItemType       item_types[BOARD_ROWS][BOARD_COLS]; /* is_item 세부 종류 */
extern int            item_counts[ITEM_MAX_TYPES];        /* 인벤토리 개수 */
extern int            best_score;

#endif /* APPLE_H */
