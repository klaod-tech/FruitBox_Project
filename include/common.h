#ifndef COMMON_H
#define COMMON_H
#include <ncurses.h>
#include <pthread.h>
#include <stdbool.h>
//Define Constant
#define MAP_ROWS 10
#define MAP_COLS 17
//Define Item Type
typedef enum{
	NONE = 0,
	BOMB, //Remove Surround
	CLOCK, //Continue Time
	GOLD //Bonus Score
} ItemType;
//Define Apple Structures
typedef struct {
	int value;
	int color_pair;
	ItemType item_type;
	bool removed;
} Apple;
//Define Global Variable
extern pthread_t tid_timer, tid_render;
extern Apple board[MAP_ROWS][MAP_COLS];
extern int score;
extern int time_remaining;
extern pthread_mutex_t board_mutex;
#endif
