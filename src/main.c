#include "common.h"
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
//Define Global Variable
//Making Structure
//Having Information Of value, color, removed
Apple board[MAP_ROWS][MAP_COLS];
int score = 0;
int time_remaining = 100;
//Stability Of Multi Thread
//Thread1 : Timer, Thread2 : Rendering
pthread_mutex_t board_mutex = PTHREAD_MUTEX_INITIALIZER;
pthread_t tid_timer, tid_render;

void init_board() {
	pthread_mutex_lock(&board_mutex);
	srand(time(NULL));
	for(int i = 0; i < MAP_ROWS; i++){
		for(int j = 0; j < MAP_COLS; j++){
		board[i][j].value = (rand() % 9) + 1;
		board[i][j].removed = false;
		//Making Item Logic
		int item_chance = rand() % 100;
		if (item_chance < 10) {
			board[i][j].item_type = (rand() % 3) + 1;
			//Item Color
			board[i][j].color_pair = 2;
		} else {
			board[i][j].item_type = NONE;
			//Basic Color(Apple)
			board[i][j].color_pair = 1;
			}
		}
	}
	pthread_mutex_unlock(&board_mutex);
}

int main(){
	init_board();
	printf("FruitBox Project Build Successfully!\n");
	printf("Setting ncurses And pthread Successed.\n");
	return 0;
}
