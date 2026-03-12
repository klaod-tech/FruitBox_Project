# Compiler Setting
CC = gcc
# Compile Option(debugging, warning, header file)
CFLAGS = -Wall -g -I./include
# Link Option(ncurses library, phtread library)
LDFLAGS = -lncurses -lpthread

#Name Of Target Action
TARGET = fruitbox

#Source File & Object File List
SRCS = $(wildcard src/*.c)
OBJS = $(SRCS:.c=.o)

#Basic Rule Of Build
all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(OBJS) -o $(TARGET) $(LDFLAGS)

# Convert .c File To .o File
%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

# Clean File
clean:
	rm -f src/*.o $(TARGET)

.PHONY: all clean
