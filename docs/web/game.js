/*
 * game.js - FruitBox 웹 프론트엔드
 *
 * 역할:
 *   - Emscripten으로 생성된 WASM 모듈(game_core) 로드
 *   - Canvas로 보드 렌더링 (requestAnimationFrame)
 *   - 마우스 드래그로 영역 선택
 *   - 1초마다 C의 tick() 호출 (타이머)
 *   - 아이템, 스타트/게임오버 화면 관리
 */

/* ─────────────────────────────────────
 * 캔버스 & 셀 크기 설정
 * ───────────────────────────────────── */
const ROWS = 10;
const COLS = 17;
const CELL = 50;   /* 셀 크기 (px) */
const PAD  = 4;    /* 셀 내부 여백 */

const canvas  = document.getElementById('game-canvas');
const ctx     = canvas.getContext('2d');
canvas.width  = COLS * CELL;
canvas.height = ROWS * CELL;

/* ─────────────────────────────────────
 * 색상 팔레트
 * ───────────────────────────────────── */
const COLOR = {
    cellBg:    '#0d1b2a',
    cellBorder:'#1a3a5c',
    text:      '#e0e0e0',
    select:    'rgba(255,214,0,0.35)',
    selectBorder: '#ffd600',
    removed:   '#0a141f',
    hint:      'rgba(105,240,174,0.4)',
    hintBorder:'#69f0ae',
    bomb:      '#e94560',
    clock:     '#4fc3f7',
    double:    '#69f0ae',
    numColors: ['#fff','#ff6b6b','#ffd166','#06d6a0',
                '#118ab2','#e040fb','#ff9800','#e91e63','#b2ff59'],
};

/* ─────────────────────────────────────
 * 드래그 상태
 * ───────────────────────────────────── */
let drag = { active: false, r1: 0, c1: 0, r2: 0, c2: 0 };

/* 숫자 변환 모드 */
let changeMode = false;

/* ─────────────────────────────────────
 * WASM 모듈 래퍼
 *   Emscripten 빌드 전에는 Mock으로 동작
 *   빌드 후 game_core.js 로드 시 자동으로 실제 WASM 사용
 * ───────────────────────────────────── */
let G = null;   /* Emscripten Module */

/* WASM 로드 시도 - 없으면 Mock 사용 */
function loadWasm() {
    return new Promise((resolve) => {
        /* game_core.js가 있으면 WASM 사용 */
        const script = document.createElement('script');
        script.src = 'game_core.js';
        script.onload = () => {
            GameModule().then(module => {
                G = module;
                resolve(true);
            });
        };
        script.onerror = () => {
            /* WASM 없음 → Mock으로 폴백 */
            G = buildMock();
            resolve(false);
        };
        document.head.appendChild(script);
    });
}

/* ─────────────────────────────────────
 * Mock 게임 로직 (WASM 없이 브라우저에서 바로 테스트 가능)
 * ───────────────────────────────────── */
function buildMock() {
    const board = [];
    const itemType = [];
    let score = 0, timeLeft = 120, gameOver = false, paused = false;
    let bestScore = 0;
    let itemCounts = [2, 2];
    let hintActive = false, hintRow = -1, hintCol = -1, hintTimer = 0;

    function initBoard() {
        score = 0; timeLeft = 120; gameOver = false; paused = false;
        hintActive = false; itemCounts = [2, 2];
        for (let r = 0; r < ROWS; r++) {
            board[r] = [];
            itemType[r] = [];
            for (let c = 0; c < COLS; c++) {
                board[r][c] = { value: Math.ceil(Math.random()*9), isItem: false, removed: false };
                itemType[r][c] = 0;
            }
        }
    }

    /* 제거된 칸 목록 중 랜덤 1칸에 아이템 스폰 */
    function spawnItemIn(cells) {
        if (!cells.length) return;
        const [r,c] = cells[Math.floor(Math.random()*cells.length)];
        const type = Math.random() < 0.5 ? 1 : 2;  /* BOMB(1) / CLOCK(2) */
        board[r][c] = { value: 0, isItem: true, removed: false };
        itemType[r][c] = type;
    }

    function sumRegion(r1,c1,r2,c2) {
        let s = 0;
        for (let r=Math.min(r1,r2); r<=Math.max(r1,r2); r++)
            for (let c=Math.min(c1,c2); c<=Math.max(c1,c2); c++)
                if (!board[r][c].removed && !board[r][c].isItem) s += board[r][c].value;
        return s;
    }

    initBoard();

    return {
        ccall: (fn, ret, types, args) => {
            if (fn === 'init_game')         { initBoard(); return; }
            if (fn === 'restart_game')      { initBoard(); return; }
            if (fn === 'get_score')         return score;
            if (fn === 'get_best_score')    return bestScore;
            if (fn === 'get_time')          return timeLeft;
            if (fn === 'is_game_over')      return gameOver ? 1 : 0;
            if (fn === 'is_paused')         return paused ? 1 : 0;
            if (fn === 'toggle_pause')      { if (!gameOver) paused = !paused; return; }
            if (fn === 'get_cell_value')    return board[args[0]][args[1]].value;
            if (fn === 'get_cell_removed')  return board[args[0]][args[1]].removed ? 1 : 0;
            if (fn === 'get_cell_is_item')  return board[args[0]][args[1]].isItem ? 1 : 0;
            if (fn === 'get_cell_item_type')return itemType[args[0]][args[1]];
            if (fn === 'get_item_count')    return itemCounts[args[0]];
            if (fn === 'get_hint_active')   return hintActive ? 1 : 0;
            if (fn === 'get_hint_row')      return hintRow;
            if (fn === 'get_hint_col')      return hintCol;
            if (fn === 'sum_region')        return sumRegion(...args);
            if (fn === 'click_item') {
                const [r,c] = args;
                if (board[r][c].removed || !board[r][c].isItem) return 0;
                const type = itemType[r][c];
                board[r][c].removed = true;
                if (type === 1) {  /* 폭탄 */
                    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
                        const nr=r+dr, nc=c+dc;
                        if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS) board[nr][nc].removed=true;
                    });
                    score += 5;
                } else if (type === 2) {  /* 시계 */
                    timeLeft += 5;
                }
                return 1;
            }
            if (fn === 'remove_region') {
                const [r1,c1,r2,c2] = args;
                const s = sumRegion(r1,c1,r2,c2);
                if (s != TARGET_SUM) return 0;
                const removedCells = [];
                for (let r=Math.min(r1,r2); r<=Math.max(r1,r2); r++)
                    for (let c=Math.min(c1,c2); c<=Math.max(c1,c2); c++) {
                        if (board[r][c].removed) continue;
                        removedCells.push([r,c]);
                        board[r][c].removed=true;
                    }
                score+=removedCells.length;
                /* 10% 확률로 방금 제거된 칸 중 한 곳에 스폰 */
                if (Math.random() < 0.1) spawnItemIn(removedCells);
                return removedCells.length;
            }
            if (fn === 'tick') {
                if (gameOver || paused) return;
                if (timeLeft > 0) timeLeft--;
                if (timeLeft === 0) { gameOver=true; if(score>bestScore) bestScore=score; }
                if (hintActive && hintTimer>0) { hintTimer--; if(hintTimer===0) hintActive=false; }
                return;
            }
            if (fn === 'use_hint') {
                if (itemCounts[0]<=0) return 0;
                for (let r=0;r<ROWS;r++) for (let c=0;c<COLS-1;c++) {
                    if (board[r][c].removed||board[r][c].isItem) continue;
                    if (board[r][c+1].removed||board[r][c+1].isItem) continue;
                    if (board[r][c].value+board[r][c+1].value===10) {
                        itemCounts[0]--; hintActive=true; hintRow=r; hintCol=c; hintTimer=3; return 1;
                    }
                }
                for (let r=0;r<ROWS-1;r++) for (let c=0;c<COLS;c++) {
                    if (board[r][c].removed||board[r][c].isItem) continue;
                    if (board[r+1][c].removed||board[r+1][c].isItem) continue;
                    if (board[r][c].value+board[r+1][c].value===10) {
                        itemCounts[0]--; hintActive=true; hintRow=r; hintCol=c; hintTimer=3; return 1;
                    }
                }
                return 0;
            }
            if (fn === 'use_change') {
                const [r,c] = args;
                if (itemCounts[1]<=0) return 0;
                if (board[r][c].removed||board[r][c].isItem) return 0;
                board[r][c].value=1; itemCounts[1]--; return 1;
            }
        }
    };
}

/* ─────────────────────────────────────
 * C 함수 호출 단축 헬퍼
 * ───────────────────────────────────── */
const C = {
    call: (fn, types=[], args=[]) => G.ccall(fn, 'number', types, args),
    init:        ()    => G.ccall('init_game', null, [], []),
    restart:     ()    => G.ccall('restart_game', null, [], []),
    tick:        ()    => G.ccall('tick', null, [], []),
    pause:       ()    => G.ccall('toggle_pause', null, [], []),
    score:       ()    => C.call('get_score'),
    best:        ()    => C.call('get_best_score'),
    time:        ()    => C.call('get_time'),
    over:        ()    => C.call('is_game_over'),
    paused:      ()    => C.call('is_paused'),
    cellVal:     (r,c) => C.call('get_cell_value',    ['number','number'], [r,c]),
    cellRem:     (r,c) => C.call('get_cell_removed',  ['number','number'], [r,c]),
    cellItem:    (r,c) => C.call('get_cell_is_item',  ['number','number'], [r,c]),
    cellIType:   (r,c) => C.call('get_cell_item_type',['number','number'], [r,c]),
    itemCount:   (t)   => C.call('get_item_count', ['number'], [t]),
    hintActive:  ()    => C.call('get_hint_active'),
    hintRow:     ()    => C.call('get_hint_row'),
    hintCol:     ()    => C.call('get_hint_col'),
    sumRegion:   (r1,c1,r2,c2) => C.call('sum_region',  ['number','number','number','number'],[r1,c1,r2,c2]),
    removeRegion:(r1,c1,r2,c2) => C.call('remove_region',['number','number','number','number'],[r1,c1,r2,c2]),
    useHint:     ()    => C.call('use_hint'),
    useChange:   (r,c) => C.call('use_change', ['number','number'], [r,c]),
};

/* ─────────────────────────────────────
 * Canvas 렌더링
 * ───────────────────────────────────── */
function drawCell(r, c) {
    const x = c * CELL;
    const y = r * CELL;
    const removed  = C.cellRem(r, c);
    const isItem   = C.cellItem(r, c);
    const iType    = C.cellIType(r, c);
    const val      = C.cellVal(r, c);
    const hActive  = C.hintActive();
    const hRow     = C.hintRow();
    const hCol     = C.hintCol();

    /* 배경 */
    const isSelected = drag.active &&
        r >= Math.min(drag.r1,drag.r2) && r <= Math.max(drag.r1,drag.r2) &&
        c >= Math.min(drag.c1,drag.c2) && c <= Math.max(drag.c1,drag.c2);
    const isHint = hActive && r === hRow && (c === hCol || c === hCol+1);

    if (removed) {
        ctx.fillStyle = COLOR.removed;
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = COLOR.cellBorder;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x+0.5, y+0.5, CELL-1, CELL-1);
        return;
    }

    /* 셀 배경 */
    ctx.fillStyle = COLOR.cellBg;
    ctx.fillRect(x, y, CELL, CELL);

    /* 선택 하이라이트 */
    if (isHint) {
        ctx.fillStyle = COLOR.hint;
        ctx.fillRect(x, y, CELL, CELL);
    } else if (isSelected) {
        ctx.fillStyle = COLOR.select;
        ctx.fillRect(x, y, CELL, CELL);
    }

    /* 테두리 */
    ctx.strokeStyle = isSelected ? COLOR.selectBorder
                    : isHint     ? COLOR.hintBorder
                    : COLOR.cellBorder;
    ctx.lineWidth = isSelected || isHint ? 2 : 1;
    ctx.strokeRect(x+0.5, y+0.5, CELL-1, CELL-1);

    /* 아이템 또는 숫자 */
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    if (isItem) {
        const labels = {1:'💣', 2:'⏱️', 3:'✖️'};
        const colors = {1:COLOR.bomb, 2:COLOR.clock, 3:COLOR.double};
        ctx.fillStyle = colors[iType] || '#fff';
        ctx.font = `bold ${CELL*0.38}px Segoe UI`;
        ctx.fillText(labels[iType] || '?', x + CELL/2, y + CELL/2);
    } else {
        ctx.fillStyle = COLOR.numColors[(val-1) % COLOR.numColors.length];
        ctx.font = `bold ${CELL*0.44}px Segoe UI Mono`;
        ctx.fillText(val, x + CELL/2, y + CELL/2);
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            drawCell(r, c);
}

/* ─────────────────────────────────────
 * HUD 업데이트
 * ───────────────────────────────────── */
function updateHud() {
    const t = C.time();
    document.getElementById('score-display').textContent = `SCORE: ${C.score()}`;
    document.getElementById('best-display').textContent  = `BEST: ${C.best()}`;

    const timerEl = document.getElementById('timer-display');
    timerEl.textContent = `TIME: ${t}s`;
    timerEl.classList.toggle('warn', t <= 15);

    document.getElementById('hint-count').textContent   = `x${C.itemCount(0)}`;
    document.getElementById('change-count').textContent = `x${C.itemCount(1)}`;

    document.getElementById('hint-btn').disabled   = C.itemCount(0) <= 0;
    document.getElementById('change-btn').disabled = C.itemCount(1) <= 0;
    document.getElementById('change-btn').classList.toggle('active', changeMode);

    /* 드래그 중 합계 표시 */
    const sumEl = document.getElementById('sum-display');
    if (drag.active) {
        const s = C.sumRegion(drag.r1, drag.c1, drag.r2, drag.c2);
        const isValid = s === 10;
        sumEl.classList.remove('hidden');
        sumEl.classList.toggle('match', isValid);
        sumEl.classList.toggle('invalid', !isValid && s > 0);
        document.getElementById('sum-value').textContent = s;
    } else {
        sumEl.classList.add('hidden');
        sumEl.classList.remove('invalid');
    }
}

/* ─────────────────────────────────────
 * 게임 루프
 * ───────────────────────────────────── */
let rafId = null;

function gameLoop() {
    render();
    updateHud();

    if (C.over()) {
        showGameOver();
        return;
    }
    rafId = requestAnimationFrame(gameLoop);
}

/* ─────────────────────────────────────
 * 타이머 (1초마다 C tick() 호출)
 * ───────────────────────────────────── */
let timerInterval = null;

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        C.tick();
    }, 1000);
}

/* ─────────────────────────────────────
 * 마우스 → 보드 좌표 변환
 * ───────────────────────────────────── */
function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;
    return {
        r: Math.max(0, Math.min(ROWS-1, Math.floor(y / CELL))),
        c: Math.max(0, Math.min(COLS-1, Math.floor(x / CELL))),
    };
}

/* ─────────────────────────────────────
 * 마우스 이벤트
 * ───────────────────────────────────── */
canvas.addEventListener('mousedown', (e) => {
    if (C.over() || C.paused()) return;
    const {r, c} = canvasPos(e);

    /* 숫자 변환 모드: 클릭한 칸을 1로 변경 */
    if (changeMode) {
        C.useChange(r, c);
        changeMode = false;
        document.getElementById('change-mode-banner').classList.add('hidden');
        return;
    }

    /* 아이템 셀 클릭: 폭탄/시계 즉시 사용 */
    if (C.cellItem(r, c)) {
        C.call('click_item', ['number','number'], [r, c]);
        return;
    }

    drag = { active: true, r1: r, c1: c, r2: r, c2: c };
});

canvas.addEventListener('mousemove', (e) => {
    if (!drag.active) return;
    const {r, c} = canvasPos(e);
    drag.r2 = r;
    drag.c2 = c;
});

canvas.addEventListener('mouseup', (e) => {
    if (!drag.active) return;
    const {r, c} = canvasPos(e);
    drag.r2 = r;
    drag.c2 = c;
    drag.active = false;

    C.removeRegion(drag.r1, drag.c1, drag.r2, drag.c2);
});

canvas.addEventListener('mouseleave', () => {
    if (drag.active) {
        drag.active = false;
        C.removeRegion(drag.r1, drag.c1, drag.r2, drag.c2);
    }
});

/* ─────────────────────────────────────
 * 화면 전환 함수
 * ───────────────────────────────────── */
function showGame() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
}

function showGameOver() {
    clearInterval(timerInterval);
    cancelAnimationFrame(rafId);
    document.getElementById('final-score').textContent = C.score();
    document.getElementById('final-best').textContent  = C.best();
    document.getElementById('gameover-screen').classList.remove('hidden');
}

/* ─────────────────────────────────────
 * 버튼 이벤트
 * ───────────────────────────────────── */
document.getElementById('start-btn').addEventListener('click', () => {
    C.init();
    showGame();
    startTimer();
    gameLoop();
});

document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('gameover-screen').classList.add('hidden');
    C.restart();
    drag = { active: false, r1:0, c1:0, r2:0, c2:0 };
    changeMode = false;
    startTimer();
    gameLoop();
});

document.getElementById('home-btn').addEventListener('click', () => {
    clearInterval(timerInterval);
    cancelAnimationFrame(rafId);
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
});

document.getElementById('pause-btn').addEventListener('click', () => {
    C.pause();
    const isPaused = C.paused();
    document.getElementById('pause-overlay').classList.toggle('hidden', !isPaused);
    document.getElementById('pause-btn').textContent = isPaused ? '▶ 재개' : '⏸ 일시정지';
});

document.getElementById('resume-btn').addEventListener('click', () => {
    C.pause();
    document.getElementById('pause-overlay').classList.add('hidden');
    document.getElementById('pause-btn').textContent = '⏸ 일시정지';
});

document.getElementById('reset-btn').addEventListener('click', () => {
    C.restart();
    drag = { active: false, r1:0, c1:0, r2:0, c2:0 };
    changeMode = false;
    document.getElementById('change-mode-banner').classList.add('hidden');
    clearInterval(timerInterval);
    startTimer();
});

document.getElementById('hint-btn').addEventListener('click', () => {
    C.useHint();
});

document.getElementById('change-btn').addEventListener('click', () => {
    if (C.itemCount(1) <= 0) return;
    changeMode = !changeMode;
    document.getElementById('change-mode-banner').classList.toggle('hidden', !changeMode);
});

/* ─────────────────────────────────────
 * 초기화: WASM 로드
 * ───────────────────────────────────── */
loadWasm().then((isWasm) => {
    console.log(isWasm ? 'WASM 모드로 실행' : 'Mock 모드로 실행 (WASM 없음)');
});
