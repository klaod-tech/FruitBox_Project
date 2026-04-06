# ─────────────────────────────────────────────────────────────
# FruitBox Makefile
#   빌드: make
#   실행: make run
#   정리: make clean
# ─────────────────────────────────────────────────────────────

CC      = gcc
CFLAGS  = -Wall -Wextra -g
LDFLAGS = -lncurses -lpthread

TARGET  = fruitbox
SRC     = main.c board.c ui.c
OBJ     = $(SRC:.c=.o)

.PHONY: all clean run

all: $(TARGET)

$(TARGET): $(OBJ)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

run: all
	./$(TARGET)

clean:
	rm -f $(OBJ) $(TARGET)
