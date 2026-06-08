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
const ROWS       = 10;
const COLS       = 17;
const CELL       = 50;   /* 셀 크기 (px) */
const PAD        = 4;    /* 셀 내부 여백 */
const TARGET_SUM = 10;   /* 제거 조건 합계 */

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
 * 난이도 설정
 * ───────────────────────────────────── */
let difficulty   = 'easy';
let pauseCount   = 0;
let pauseTimer   = null;
let pauseSeconds = 0;

const DIFF_DESC = {
    easy:   '일시정지 제한 없음',
    normal: '일시정지 최대 5회 / 1회당 최대 10초',
    hard:   '일시정지 불가',
};

/* ─────────────────────────────────────
 * 로컬 저장소
 * ───────────────────────────────────── */
const Store = {
    getDeviceId() {
        let id = localStorage.getItem('fruitbox_device_id');
        if (!id) {
            id = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
            localStorage.setItem('fruitbox_device_id', id);
        }
        return id;
    },
    getBest(diff) {
        return parseInt(localStorage.getItem(`fruitbox_best_${diff}`) || '0', 10);
    },
    saveBest(diff, score) {
        if (score >= this.getBest(diff))
            localStorage.setItem(`fruitbox_best_${diff}`, score);
    },
    getTier(score) {
        switch (true) {
            case score >= 90: return { name: '챌린저', color: '#ff4444' };
            case score >= 76: return { name: '마스터',  color: '#e040fb' };
            case score >= 61: return { name: '다이아',  color: '#4fc3f7' };
            case score >= 46: return { name: '플레',    color: '#00e5ff' };
            case score >= 31: return { name: '골드',    color: '#ffd700' };
            case score >= 16: return { name: '실버',    color: '#c0c0c0' };
            default:          return { name: '브론즈',  color: '#cd7f32' };
        }
    },
};

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
 * 티어 엠블럼 생성 (Canvas API)
 * ───────────────────────────────────── */
const TIER_STYLE = {
    '브론즈': { main:'#cd7f32', dark:'#7a3f10', light:'#e8a060', rim:'#a0622a' },
    '실버':   { main:'#b0b8c8', dark:'#6a7280', light:'#dde4f0', rim:'#8a9aaa' },
    '골드':   { main:'#ffd700', dark:'#a07800', light:'#fff176', rim:'#c8a000' },
    '플레':   { main:'#00d4e8', dark:'#007a90', light:'#80eef8', rim:'#00a8bc' },
    '다이아': { main:'#58c8f8', dark:'#0260a8', light:'#b8e8fc', rim:'#2090d0' },
    '마스터': { main:'#d050f0', dark:'#7010a0', light:'#f0a0ff', rim:'#a030c8' },
    '챌린저': { main:'#ff3030', dark:'#a00000', light:'#ff8888', rim:'#cc2020' },
};

function createTierEmblem(tierName, size) {
    size = size || 80;
    const oc = document.createElement('canvas');
    oc.width = oc.height = size;
    const c = oc.getContext('2d');
    const h = size / 2;
    const s = size / 80;
    const st = TIER_STYLE[tierName];
    if (!st) return oc;

    c.save();
    c.translate(h, h);

    /* ── 날개 (공통) ── */
    const wingCount = { '브론즈':1, '실버':2, '골드':2, '플레':3, '다이아':3, '마스터':4, '챌린저':4 };
    const wc = wingCount[tierName] || 2;

    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < wc; i++) {
            const wy = -8*s + i * 6 * s;
            const wx = (18 + i * 7) * s * side;
            const wa = (1.2 + i * 0.3) * s;
            const wb = (4 + i * 1.5) * s;
            c.save();
            c.translate(wx, wy);
            c.rotate(side * (0.25 + i * 0.15));
            c.beginPath();
            c.ellipse(0, 0, wa, wb, 0, 0, Math.PI * 2);
            const wg = c.createLinearGradient(-wa, 0, wa, 0);
            wg.addColorStop(0, side < 0 ? st.light : st.dark);
            wg.addColorStop(1, side < 0 ? st.dark  : st.light);
            c.fillStyle = wg;
            c.fill();
            c.strokeStyle = st.rim;
            c.lineWidth = 0.8 * s;
            c.stroke();
            c.restore();
        }
    }

    /* ── 방패 몸체 ── */
    const sw = 22 * s, sh = 26 * s;
    c.beginPath();
    c.moveTo(0, -sh);
    c.bezierCurveTo( sw, -sh,  sw,  0,  sw,  4*s);
    c.bezierCurveTo( sw,  14*s, 0,  sh,  0,  sh);
    c.bezierCurveTo(-sw,  sh, -sw,  14*s, -sw, 4*s);
    c.bezierCurveTo(-sw,  0, -sw, -sh,  0, -sh);
    c.closePath();

    /* 방패 그라디언트 */
    const sg = c.createRadialGradient(-6*s, -10*s, 2*s, 0, 0, sw * 1.4);
    sg.addColorStop(0, st.light);
    sg.addColorStop(0.5, st.main);
    sg.addColorStop(1, st.dark);
    c.fillStyle = sg;
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = 6 * s;
    c.fill();
    c.shadowBlur = 0;

    /* 방패 테두리 */
    c.strokeStyle = st.rim;
    c.lineWidth = 1.8 * s;
    c.stroke();

    /* ── 상단 장식 (티어별) ── */
    if (tierName === '마스터' || tierName === '챌린저') {
        /* 왕관 */
        const crownH = 10 * s;
        const crownW = 14 * s;
        const pts = tierName === '챌린저' ? 5 : 3;
        c.beginPath();
        c.moveTo(-crownW, -sh + 4*s);
        for (let i = 0; i <= pts; i++) {
            const px = -crownW + (crownW * 2 / pts) * i;
            const py = i % 2 === 0 ? -sh - crownH + 4*s : -sh + 2*s;
            c.lineTo(px, py);
        }
        c.lineTo(crownW, -sh + 4*s);
        c.closePath();
        c.fillStyle = tierName === '챌린저' ? '#ffd700' : '#d050f0';
        c.fill();
        c.strokeStyle = tierName === '챌린저' ? '#c8a000' : '#a030c8';
        c.lineWidth = 1.2 * s;
        c.stroke();
    } else {
        /* 윗 뾰족 장식 */
        c.beginPath();
        c.moveTo(-8*s, -sh);
        c.lineTo(0, -(sh + 10*s));
        c.lineTo(8*s, -sh);
        c.closePath();
        c.fillStyle = st.main;
        c.strokeStyle = st.rim;
        c.lineWidth = 1.2 * s;
        c.fill();
        c.stroke();
    }

    /* ── 중앙 보석 ── */
    const gemShapes = { '브론즈':'circle', '실버':'star4', '골드':'star6',
                        '플레':'diamond', '다이아':'crystal', '마스터':'oval', '챌린저':'star5' };
    const gemShape = gemShapes[tierName] || 'circle';
    const gr = 8 * s;

    c.save();
    c.translate(0, -2 * s);

    if (gemShape === 'circle') {
        c.beginPath(); c.arc(0, 0, gr, 0, Math.PI * 2);
    } else if (gemShape === 'oval') {
        c.beginPath(); c.ellipse(0, 0, gr, gr * 0.7, 0, 0, Math.PI * 2);
    } else if (gemShape === 'diamond' || gemShape === 'crystal') {
        const gw = gemShape === 'crystal' ? gr * 0.8 : gr * 0.7;
        c.beginPath();
        c.moveTo(0, -gr); c.lineTo(gw, 0);
        c.lineTo(0, gr);  c.lineTo(-gw, 0);
        c.closePath();
    } else if (gemShape === 'star4' || gemShape === 'star5' || gemShape === 'star6') {
        const pts2 = gemShape === 'star4' ? 4 : gemShape === 'star5' ? 5 : 6;
        c.beginPath();
        for (let i = 0; i < pts2 * 2; i++) {
            const ang = (Math.PI * 2 / (pts2 * 2)) * i - Math.PI / 2;
            const r2 = i % 2 === 0 ? gr : gr * 0.45;
            i === 0 ? c.moveTo(Math.cos(ang)*r2, Math.sin(ang)*r2)
                    : c.lineTo(Math.cos(ang)*r2, Math.sin(ang)*r2);
        }
        c.closePath();
    }

    const gg = c.createRadialGradient(-gr*0.3, -gr*0.3, gr*0.1, 0, 0, gr);
    gg.addColorStop(0, 'rgba(255,255,255,0.9)');
    gg.addColorStop(0.4, st.light);
    gg.addColorStop(1, st.main);
    c.fillStyle = gg;
    c.shadowColor = st.main;
    c.shadowBlur = 5 * s;
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = st.rim;
    c.lineWidth = 1.2 * s;
    c.stroke();

    /* 보석 광택 */
    c.beginPath();
    c.ellipse(-gr*0.25, -gr*0.3, gr*0.25, gr*0.15, -Math.PI/4, 0, Math.PI*2);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fill();
    c.restore();

    c.restore();
    return oc;
}

/* 모든 티어 엠블럼 사전 생성 */
const TIER_EMBLEMS = {};
function preloadTierEmblems() {
    ['브론즈','실버','골드','플레','다이아','마스터','챌린저'].forEach(name => {
        TIER_EMBLEMS[name] = createTierEmblem(name, 80);
    });
}

/* ─────────────────────────────────────
 * 사과 그리기
 * ───────────────────────────────────── */
function drawApple(x, y, size, number) {
    const cx = x + size / 2;
    const cy = y + size / 2 + size * 0.03;
    const r  = size * 0.38;

    ctx.save();

    /* 사과 몸통 */
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e8281e';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur  = 4;
    ctx.fill();
    ctx.shadowBlur  = 0;

    /* 광택 */
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy - r * 0.3, r * 0.22, r * 0.14, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    /* 줄기 */
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.3, cy - r - size * 0.14, cx + r * 0.15, cy - r - size * 0.18);
    ctx.strokeStyle = '#5c3317';
    ctx.lineWidth   = size * 0.05;
    ctx.lineCap     = 'round';
    ctx.stroke();

    /* 잎 */
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.2, cy - r - size * 0.1, r * 0.22, r * 0.1, -Math.PI / 5, 0, Math.PI * 2);
    ctx.fillStyle = '#4caf50';
    ctx.fill();

    /* 숫자 */
    ctx.fillStyle    = 'white';
    ctx.font         = `bold ${size * 0.42}px Segoe UI Mono`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur   = 3;
    ctx.fillText(number, cx, cy + r * 0.05);

    ctx.restore();
}

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
        if (isSelected) {
            ctx.fillStyle = COLOR.select;
            ctx.fillRect(x, y, CELL, CELL);
            ctx.strokeStyle = COLOR.selectBorder;
            ctx.lineWidth = 2;
        } else {
            ctx.strokeStyle = COLOR.cellBorder;
            ctx.lineWidth = 0.5;
        }
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

    /* 아이템 또는 사과 */
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    if (isItem) {
        const labels = {1:'💣', 2:'⏱️', 3:'✖️'};
        const colors = {1:COLOR.bomb, 2:COLOR.clock, 3:COLOR.double};
        ctx.fillStyle = colors[iType] || '#fff';
        ctx.font = `bold ${CELL*0.38}px Segoe UI`;
        ctx.fillText(labels[iType] || '?', x + CELL/2, y + CELL/2);
    } else {
        drawApple(x, y, CELL, val);
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

    const score = C.score();
    Store.saveBest(difficulty, score);

    const best = Store.getBest(difficulty);
    const tier = Store.getTier(score);

    document.getElementById('final-score').textContent = score;
    document.getElementById('final-best').textContent  = best;

    const tierEl = document.getElementById('final-tier');
    const emblem = TIER_EMBLEMS[tier.name];
    const imgSrc = emblem ? emblem.toDataURL() : '';
    tierEl.innerHTML = `
        <img src="${imgSrc}" style="width:64px;height:64px;vertical-align:middle;margin-bottom:4px;"><br>
        <span style="color:${tier.color}">${tier.name}</span>`;

    document.getElementById('gameover-screen').classList.remove('hidden');
}

/* ─────────────────────────────────────
 * 버튼 이벤트
 * ───────────────────────────────────── */
/* 난이도 버튼 */
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        difficulty = btn.dataset.diff;
        document.getElementById('diff-desc').textContent = DIFF_DESC[difficulty];
        updateStartTier();
    });
});

function updateStartTier() {
    const best = Store.getBest(difficulty);
    const tier = Store.getTier(best);
    const el   = document.getElementById('start-tier');
    if (best > 0) {
        const emblem = TIER_EMBLEMS[tier.name];
        const imgSrc = emblem ? emblem.toDataURL() : '';
        el.innerHTML = `
            <img src="${imgSrc}" style="width:52px;height:52px;vertical-align:middle;margin-right:8px;">
            <span style="color:${tier.color};font-weight:bold;font-size:1.3rem;">${tier.name}</span>
            <span style="font-size:0.85rem;color:#aaa;margin-left:6px;">(최고: ${best}점)</span>`;
    } else {
        el.innerHTML = '<span style="color:#555;font-size:0.9rem;">기록 없음</span>';
    }
}

document.getElementById('start-btn').addEventListener('click', () => {
    pauseCount = 0; pauseSeconds = 0;
    clearInterval(pauseTimer);
    const pauseBtn = document.getElementById('pause-btn');
    pauseBtn.disabled = (difficulty === 'hard');
    pauseBtn.textContent = '⏸ 일시정지';
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
    pauseCount = 0; pauseSeconds = 0;
    clearInterval(pauseTimer);
    const pauseBtn = document.getElementById('pause-btn');
    pauseBtn.disabled = (difficulty === 'hard');
    pauseBtn.textContent = '⏸ 일시정지';
    startTimer();
    gameLoop();
});

document.getElementById('home-btn').addEventListener('click', () => {
    clearInterval(timerInterval);
    cancelAnimationFrame(rafId);
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    updateStartTier();
});

function resumeGame() {
    clearInterval(pauseTimer);
    pauseSeconds = 0;
    C.pause();
    document.getElementById('pause-btn').textContent = '⏸ 일시정지';
}

document.getElementById('pause-btn').addEventListener('click', () => {
    const isPaused = C.paused();
    if (!isPaused) {
        switch (difficulty) {
            case 'hard': return;
            case 'normal':
                if (pauseCount >= 5) return;
                pauseCount++; pauseSeconds = 0;
                pauseTimer = setInterval(() => {
                    pauseSeconds++;
                    const remain = 10 - pauseSeconds;
                    document.getElementById('pause-btn').textContent =
                        `▶ 재개 (${remain}s) [${pauseCount}/5]`;
                    if (remain <= 0) resumeGame();
                }, 1000);
                document.getElementById('pause-btn').textContent =
                    `▶ 재개 (10s) [${pauseCount}/5]`;
                break;
            case 'easy':
                document.getElementById('pause-btn').textContent = '▶ 재개';
                break;
        }
        C.pause();
    } else {
        resumeGame();
    }
});

document.getElementById('resume-btn').addEventListener('click', () => {
    resumeGame();
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
 * 키보드 단축키
 *   P : 일시정지 / 재개
 *   Q : 첫 화면으로 복귀
 *   W : 숫자 변환 아이템 사용
 *   E : 돋보기 아이템 사용
 *   R : 보드 재시작
 * ───────────────────────────────────── */
document.addEventListener('keydown', (e) => {
    if (document.getElementById('game-screen').classList.contains('hidden')) return;

    switch (e.key.toUpperCase()) {
        case 'P':
            document.getElementById('pause-btn').click();
            break;

        case 'E':
            if (!C.over() && !C.paused()) C.useHint();
            break;

        case 'W':
            if (!C.over() && !C.paused() && C.itemCount(1) > 0) {
                changeMode = !changeMode;
                document.getElementById('change-mode-banner').classList.toggle('hidden', !changeMode);
            }
            break;

        case 'Q':
            clearInterval(timerInterval);
            clearInterval(pauseTimer);
            cancelAnimationFrame(rafId);
            drag = { active: false, r1:0, c1:0, r2:0, c2:0 };
            changeMode = false;
            document.getElementById('change-mode-banner').classList.add('hidden');
            document.getElementById('game-screen').classList.add('hidden');
            document.getElementById('gameover-screen').classList.add('hidden');
            document.getElementById('start-screen').classList.remove('hidden');
            updateStartTier();
            break;

        case 'R':
            C.restart();
            drag = { active: false, r1:0, c1:0, r2:0, c2:0 };
            changeMode = false;
            pauseCount = 0; pauseSeconds = 0;
            clearInterval(pauseTimer);
            clearInterval(timerInterval);
            cancelAnimationFrame(rafId);
            document.getElementById('change-mode-banner').classList.add('hidden');
            document.getElementById('gameover-screen').classList.add('hidden');
            document.getElementById('pause-btn').disabled = (difficulty === 'hard');
            document.getElementById('pause-btn').textContent = '⏸ 일시정지';
            startTimer();
            gameLoop();
            break;
    }
});

/* ─────────────────────────────────────
 * 초기화: WASM 로드
 * ───────────────────────────────────── */
loadWasm().then((isWasm) => {
    console.log(isWasm ? 'WASM 모드로 실행' : 'Mock 모드로 실행 (WASM 없음)');
    preloadTierEmblems();
    updateStartTier();
});
