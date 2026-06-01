# ─────────────────────────────────────────────────────────────
# FruitBox Web - Emscripten 빌드 Makefile
#
#   빌드: make
#   정리: make clean
#
#   사전 조건: Emscripten SDK 설치 및 활성화
#     sudo apt-get install emscripten   또는
#     https://emscripten.org/docs/getting_started/downloads.html
# ─────────────────────────────────────────────────────────────

CC     = emcc
SRC    = game_core.c
OUTPUT = game_core.js

# 내보낼 C 함수 목록
EXPORTS = '_init_game,_restart_game,_tick,_toggle_pause,\
_get_score,_get_best_score,_get_time,_is_game_over,_is_paused,\
_get_cell_value,_get_cell_removed,_get_cell_is_item,_get_cell_item_type,\
_get_item_count,_get_hint_active,_get_hint_row,_get_hint_col,\
_sum_region,_remove_region,_use_hint,_use_change'

EMFLAGS = \
    -O2 \
    -s EXPORTED_FUNCTIONS=[$(EXPORTS)] \
    -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap'] \
    -s MODULARIZE=1 \
    -s EXPORT_NAME=GameModule \
    -s ENVIRONMENT=web \
    -s ALLOW_MEMORY_GROWTH=1

.PHONY: all clean

all: $(OUTPUT)

$(OUTPUT): $(SRC)
	$(CC) $(SRC) $(EMFLAGS) -o $(OUTPUT)
	@echo "빌드 완료: $(OUTPUT) + game_core.wasm"

clean:
	rm -f $(OUTPUT) game_core.wasm
