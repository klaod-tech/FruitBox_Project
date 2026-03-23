#ifndef BOARD_H
#define BOARD_H

/*
 * board.h  –  보드 초기화 / 합산 / 제거 / 아이템 함수 선언
 * 담당: 우진
 */

#include "apple.h"

/* REQ-001 FNC-001: 보드 생성 로직 */
void init_board(void);

/* REQ-003 FNC-003: 숫자 합산 판정 */
int  sum_region(int startY, int startX, int endY, int endX);

/* REQ-004 FNC-004: 사과 제거 및 점수 반영 */
int  remove_region(int startY, int startX, int endY, int endX);

/* 특수 아이템 스폰 (랜덤 빈 칸에 배치) */
void spawn_item(void);

/* REQ-010 FNC-010: 돋보기 – 합 10인 위치 탐색 */
bool find_hint(int *out_r, int *out_c);

/* REQ-011 FNC-011: 숫자 변환 – 지정 칸을 1로 변경 */
void change_to_one(int row, int col);

/* 인접 파괴 (폭탄 효과) */
void explode_adjacent(int row, int col);

/* 파일 I/O */
void save_score(int sc);
int  load_best_score(void);

#endif /* BOARD_H */
