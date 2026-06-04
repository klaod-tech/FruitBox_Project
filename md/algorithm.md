# FruitBox 알고리즘 분류

알고리즘 19개를 흐름도(다이어그램) 순서에 맞게 정리했습니다.

---

## 다이어그램 1 — 게임 시작 흐름

### 1. 기기 ID 생성 알고리즘

로그인 없이 기기를 식별하기 위해 최초 실행 시 UUID를 자동 생성합니다.

저장된 ID가 없으면 `crypto.getRandomValues()`를 이용해 UUID v4 형식의 고유 문자열을 만들고 localStorage에 저장합니다. 이후에는 항상 같은 ID가 반환됩니다.

```js
getDeviceId() {
    let id = localStorage.getItem('fruitbox_device_id');
    if (!id) {
        id = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c/4).toString(16));
        localStorage.setItem('fruitbox_device_id', id);
    }
    return id;
},
```

> `crypto.getRandomValues()` : 브라우저 내장 암호학적 난수 생성기입니다. `Math.random()`보다 예측이 어려워 ID 충돌 확률이 극히 낮습니다.

> 기록 불러오기(`getBest`)는 알고리즘 17 참조

---

### 2. 티어 판정 알고리즘

최고 기록 점수를 구간별로 비교해 티어를 결정하고 이름·색상을 반환합니다.

높은 점수 구간부터 순서대로 비교해 처음 조건을 만족하는 티어를 반환합니다. 시작 화면과 게임오버 화면 두 곳에서 사용됩니다.

```js
getTier(score) {
    if (score >= 90) return { name: '챌린저', color: '#ff4444' };
    if (score >= 76) return { name: '마스터',  color: '#e040fb' };
    if (score >= 61) return { name: '다이아',  color: '#4fc3f7' };
    if (score >= 46) return { name: '플레',    color: '#00e5ff' };
    if (score >= 31) return { name: '골드',    color: '#ffd700' };
    if (score >= 16) return { name: '실버',    color: '#c0c0c0' };
    return                  { name: '브론즈',  color: '#cd7f32' };
},
```

난이도 버튼을 클릭할 때마다 `updateStartTier()`가 호출되어 선택된 난이도의 최고 기록 기준 티어로 즉시 갱신됩니다.

---

## 다이어그램 2 — 게임 진행 루프

### 3. 보드 초기화 알고리즘

게임을 시작하거나 재시작할 때 10×17 보드를 새로 채웁니다.

전체 170개의 셀을 행·열 순서로 순회하면서 각 셀에 1~9 사이의 난수를 배정합니다. 이와 함께 점수, 타이머, 아이템 개수, 게임 상태 플래그를 전부 초기값으로 리셋합니다.

```js
function initBoard() {
    score = 0; timeLeft = 120; gameOver = false; paused = false;
    hintActive = false; itemCounts = [2, 2];
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
            board[r][c] = { value: Math.ceil(Math.random()*9), isItem: false, removed: false };
            itemType[r][c] = 0;
        }
}
```

> `Math.ceil(Math.random()*9)` : 0~1 사이의 난수에 9를 곱하고 올림 처리하여 1~9 정수를 만듭니다.

---

### 4. 렌더링 루프 알고리즘

`requestAnimationFrame`을 사용해 브라우저 화면 갱신 주기(60FPS)에 맞춰 화면을 실시간으로 갱신합니다.

매 프레임 `render()`로 보드 전체를 다시 그리고, `updateHud()`로 점수·시간을 갱신합니다. 게임오버가 감지되면 루프를 종료합니다.

```js
function gameLoop() {
    render();
    updateHud();
    if (C.over()) { showGameOver(); return; }
    rafId = requestAnimationFrame(gameLoop);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
            drawCell(r, c);
}
```

> `requestAnimationFrame(gameLoop)` : 브라우저가 다음 화면을 그리기 직전에 gameLoop를 다시 호출합니다. `setInterval`보다 부드럽고 탭이 숨겨지면 자동으로 멈춰 CPU를 절약합니다.

---

### 5. 드래그 선택 알고리즘

마우스로 보드 위를 드래그하면 직사각형 영역이 선택됩니다.

- **mousedown**: 시작 좌표 (r1, c1)을 저장하고 `drag.active = true`로 설정합니다.
- **mousemove**: 현재 마우스 위치를 끝 좌표 (r2, c2)로 갱신합니다. 이 좌표로 매 프레임 선택 영역을 화면에 그립니다.
- **mouseup / mouseleave**: 드래그를 종료하고 `remove_region`을 호출합니다. 마우스가 캔버스 밖으로 나가도 동작이 끊기지 않도록 `mouseleave`도 처리합니다.

```js
canvas.addEventListener('mousedown', (e) => {
    const {r, c} = canvasPos(e);
    drag = { active: true, r1: r, c1: c, r2: r, c2: c };
});
canvas.addEventListener('mousemove', (e) => {
    const {r, c} = canvasPos(e);
    drag.r2 = r; drag.c2 = c;
});
canvas.addEventListener('mouseup', (e) => {
    drag.active = false;
    C.removeRegion(drag.r1, drag.c1, drag.r2, drag.c2);
});
```

> `canvasPos(e)` : `getBoundingClientRect()`로 캔버스 크기를 구해 CSS 표시 크기와 실제 픽셀 크기 사이의 스케일 비율을 계산합니다. 이를 통해 어떤 해상도에서도 정확한 셀 좌표를 반환합니다.

---

### 6. 드래그 색깔 변경 알고리즘

드래그 중 선택 영역의 합에 따라 즉각적인 시각 피드백을 줍니다.

매 프레임 `sumRegion`을 호출해 합을 계산하고 합계 표시창의 색상 클래스를 결정합니다.

| 합 값 | 색상 | CSS 클래스 |
|-------|------|------------|
| 합 == 10 | 초록색 | `match` |
| 0 < 합 ≠ 10 | 빨간색 | `invalid` |
| 합 == 0 | 기본색 | 없음 |

```js
if (drag.active) {
    const s = C.sumRegion(drag.r1, drag.c1, drag.r2, drag.c2);
    sumEl.classList.remove('hidden');
    sumEl.classList.toggle('match',   s === 10);
    sumEl.classList.toggle('invalid', s > 0 && s !== 10);
    document.getElementById('sum-value').textContent = s;
}
```

> `classList.toggle(class, condition)` : condition이 true면 클래스를 추가, false면 제거합니다. if/else 없이 한 줄로 클래스 상태를 동기화할 수 있습니다.

추가로, 제거된 셀도 드래그 범위에 포함되면 노란 하이라이트를 표시해 선택 범위를 명확히 보여줍니다.

---

### 7. 합산 판정 알고리즘

선택된 직사각형 영역 안의 숫자를 모두 더해서 합이 정확히 10인지 확인합니다.

이미 제거된 셀(`removed`)과 아이템 셀(`isItem`)은 합산에서 제외합니다. 합이 10이 아니면 즉시 0을 반환하고 제거를 진행하지 않습니다.

```js
function sumRegion(r1, c1, r2, c2) {
    let s = 0;
    for (let r = Math.min(r1,r2); r <= Math.max(r1,r2); r++)
        for (let c = Math.min(c1,c2); c <= Math.max(c1,c2); c++)
            if (!board[r][c].removed && !board[r][c].isItem)
                s += board[r][c].value;
    return s;
}
```

> `Math.min / Math.max` : 드래그 방향에 상관없이(오른쪽→왼쪽, 아래→위) 올바른 범위를 잡기 위해 사용합니다.

---

### 8. 사과 제거 알고리즘

합 = 10 판정이 통과되면 해당 영역의 사과들을 제거하고 점수를 반영합니다.

영역 내 셀을 순회하며 `removed = true`로 바꾸고 제거된 셀 수만큼 점수를 더합니다. 10% 확률로 아이템 스폰을 시도합니다.

```js
if (fn === 'remove_region') {
    const s = sumRegion(r1, c1, r2, c2);
    if (s !== 10) return 0;
    const removedCells = [];
    for (let r = Math.min(r1,r2); r <= Math.max(r1,r2); r++)
        for (let c = Math.min(c1,c2); c <= Math.max(c1,c2); c++) {
            if (board[r][c].removed) continue;
            removedCells.push([r,c]);
            board[r][c].removed = true;
        }
    score += removedCells.length;
    if (Math.random() < 0.1) spawnItemIn(removedCells);
}
```

> `spawnItemIn(removedCells)` : 방금 제거된 셀 목록을 받아 그 중 랜덤 1칸에 아이템을 배치하는 함수입니다(알고리즘 9 참조).

---

## 다이어그램 3 — 아이템 흐름

### 9. 아이템 스폰 알고리즘

사과를 제거할 때 10% 확률로 빈 칸에 아이템이 새로 생깁니다.

방금 제거된 셀 목록 중 랜덤 1칸을 선택한 뒤, `Math.random() < 0.5`로 BOMB(1) 또는 CLOCK(2) 중 하나를 결정합니다.

```js
function spawnItemIn(cells) {
    if (!cells.length) return;
    const [r, c] = cells[Math.floor(Math.random() * cells.length)];
    const type = Math.random() < 0.5 ? 1 : 2;
    board[r][c] = { value: 0, isItem: true, removed: false };
    itemType[r][c] = type;
}
```

> `Math.floor(Math.random() * cells.length)` : 0 이상 cells.length 미만의 정수 인덱스를 만들어 배열에서 랜덤 요소를 선택하는 일반적인 패턴입니다.

---

### 10. 폭탄 효과 알고리즘

폭탄 아이템(`💣`)을 클릭하면 인접 4칸이 추가로 제거됩니다.

상·하·좌·우 4방향 오프셋을 순회하며 보드 범위 안에 있는 셀을 `removed = true`로 처리합니다. 모서리·가장자리에 있으면 범위를 벗어나는 방향은 자동으로 무시됩니다.

```js
if (type === 1) {  // 폭탄
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => {
        const nr = r+dr, nc = c+dc;
        if (nr>=0 && nr<ROWS && nc>=0 && nc<COLS)
            board[nr][nc].removed = true;
    });
    score += 5;
}
```

---

### 11. 시계 효과 알고리즘

시계 아이템(`⏱️`)을 클릭하면 남은 시간이 5초 늘어납니다.

```js
} else if (type === 2) {  // 시계
    timeLeft += 5;
}
```

클릭한 셀의 `removed = true`는 폭탄/시계 공통으로 위쪽에서 처리됩니다. 상한선은 없으므로 여러 번 써서 120초를 넘길 수 있습니다.

---

### 12. 힌트(돋보기) 알고리즘

인벤토리의 힌트 아이템(`🔍`)을 사용하면 합이 10이 되는 인접 셀 쌍을 찾아 3초간 초록색으로 강조합니다.

가로 인접 쌍을 먼저 탐색하고, 없으면 세로 인접 쌍을 탐색합니다. 발견 시 `hintTimer = 3`을 설정하고 `tick()`이 1초마다 감소시켜 0이 되면 강조를 해제합니다.

```js
if (fn === 'use_hint') {
    if (itemCounts[0] <= 0) return 0;
    for (let r=0; r<ROWS; r++) for (let c=0; c<COLS-1; c++) {
        if (board[r][c].removed || board[r][c].isItem) continue;
        if (board[r][c+1].removed || board[r][c+1].isItem) continue;
        if (board[r][c].value + board[r][c+1].value === 10) {
            itemCounts[0]--; hintActive=true; hintRow=r; hintCol=c; hintTimer=3; return 1;
        }
    }
}
```

---

### 13. 숫자 변환(1로 바꾸기) 알고리즘

인벤토리의 변환 아이템(`🔢`)을 사용하면 선택한 셀의 숫자를 1로 바꿉니다.

2단계로 동작합니다. 변환 버튼 클릭 → `changeMode = true` (배너 표시) → 다음 셀 클릭 → 값 1로 변경 후 모드 해제.

```js
if (fn === 'use_change') {
    const [r, c] = args;
    if (itemCounts[1] <= 0) return 0;
    if (board[r][c].removed || board[r][c].isItem) return 0;
    board[r][c].value = 1;
    itemCounts[1]--;
    return 1;
}
```

값을 1로 바꾸는 이유: 어떤 숫자든 9와 합하면 10이 되므로, 처리 곤란한 큰 숫자를 쉽게 제거할 수 있게 해줍니다.

---

## 다이어그램 4 — 타이머 흐름

### 14. 타이머 알고리즘

렌더링 루프(60FPS)와 독립적으로 1초마다 시간을 줄입니다.

`setInterval`은 지정한 시간 간격(ms)마다 함수를 반복 실행하는 브라우저 내장 함수입니다. 게임 시작 시 `setInterval(C.tick, 1000)`을 호출하면 1000ms(1초)마다 `C.tick()`이 자동으로 실행됩니다. `tick()`은 일시정지 또는 게임오버 상태면 건너뜁니다. 0초에 도달하면 `gameOver = true`로 설정하고 최고 기록을 저장합니다.

```js
timerInterval = setInterval(C.tick, 1000);

if (fn === 'tick') {
    if (gameOver || paused) return;
    if (timeLeft > 0) timeLeft--;
    if (timeLeft === 0) {
        gameOver = true;
        if (score >= bestScore) { bestScore = score; Store.saveBest(difficulty, score); }
    }
}
```

---

### 15. 시간 경고 알고리즘

남은 시간 15초 이하 시 타이머 표시를 빨간색으로 바꿔 긴박감을 전달합니다.

```js
const timerEl = document.getElementById('timer-display');
timerEl.textContent = `TIME: ${t}s`;
timerEl.classList.toggle('warn', t <= 15);
```

> `classList.toggle('warn', t <= 15)` : 조건이 true/false로 바뀔 때마다 클래스를 자동으로 붙이고 떼어냅니다. CSS의 `.warn` 클래스에 빨간색과 점멸 애니메이션이 정의되어 있습니다.

---

## 다이어그램 5 — 게임 종료 흐름

### 16. 게임오버 판정 알고리즘

타이머가 0이 되면 게임을 종료하고 결과를 화면에 표시합니다.

`tick()`에서 `gameOver = true`가 설정되면 `gameLoop()`의 `C.over()` 호출이 이를 감지하고 `showGameOver()`를 실행합니다. 점수 저장은 `tick()` 안에서 먼저 완료된 상태입니다.

```js
function showGameOver() {
    clearInterval(timerInterval);
    cancelAnimationFrame(rafId);
    document.getElementById('final-score').textContent = C.score();
    document.getElementById('final-best').textContent  = C.best();
    const tier = Store.getTier(Store.getBest(difficulty));
    document.getElementById('final-tier').textContent = tier.name;
    document.getElementById('gameover-screen').classList.remove('hidden');
}
```

> 티어 표시는 알고리즘 2 참조

---

### 17. localStorage 기록 저장 알고리즘

브라우저를 닫아도 난이도별 최고 기록이 유지됩니다.

게임 종료 시 `Store.saveBest(difficulty, score)`를 호출합니다. 현재 저장된 값과 비교해 더 높으면 덮어씁니다. `getBest`는 다이어그램 1 시작 화면의 기록 불러오기에서도 호출됩니다.

```js
saveBest(diff, score) {
    if (score >= this.getBest(diff)) {
        localStorage.setItem(`fruitbox_best_${diff}`, score);
    }
},
getBest(diff) {
    return parseInt(localStorage.getItem(`fruitbox_best_${diff}`) || '0', 10);
},
```

> `localStorage.setItem(key, value)` : 브라우저에 key-value 쌍을 영구 저장합니다. 탭을 닫거나 재실행해도 사라지지 않습니다. `getItem`으로 다시 꺼낼 수 있습니다.

---

### 18. 재시작 알고리즘

게임오버 화면에서 다시 시작 버튼을 클릭하거나 리셋 버튼을 클릭하면 현재 게임을 초기화하고 같은 난이도로 새 게임을 시작합니다.

기존 타이머와 렌더링 루프를 완전히 정지시킨 뒤, 모든 상태 변수를 초기화하고 새로 시작합니다. `pauseCount`도 함께 리셋해 보통 난이도에서 일시정지 횟수가 이월되지 않도록 합니다.

```js
C.restart();
drag = { active: false, r1:0, c1:0, r2:0, c2:0 };
changeMode = false;
pauseCount = 0; pauseSeconds = 0;
clearInterval(pauseTimer); clearInterval(timerInterval);
cancelAnimationFrame(rafId);
startTimer();
gameLoop();
```

> `cancelAnimationFrame(rafId)` : `requestAnimationFrame`이 예약한 다음 프레임 호출을 취소합니다. 이걸 하지 않으면 이전 루프와 새 루프가 동시에 돌아 속도가 두 배가 됩니다.

---

### 19. 초기 화면 복귀 알고리즘

게임오버 화면에서 처음으로 버튼을 클릭하면 게임을 완전히 종료하고 초기 화면으로 돌아갑니다.

타이머와 렌더링 루프를 정지시키고 게임 관련 상태를 초기화한 뒤, 게임오버 화면과 게임 화면을 숨기고 시작 화면을 표시합니다.

```js
// home-btn.onClick
clearInterval(timerInterval);
cancelAnimationFrame(rafId);
document.getElementById('gameover-screen').classList.add('hidden');
document.getElementById('game-screen').classList.add('hidden');
document.getElementById('start-screen').classList.remove('hidden');
```

> 재시작(알고리즘 18)과의 차이: 재시작은 같은 난이도로 게임을 바로 다시 시작하지만, 초기 화면 복귀는 난이도 선택부터 다시 진행합니다.

---

## 다이어그램 6 — 일시정지 흐름

### 20. 난이도별 일시정지 알고리즘

난이도에 따라 일시정지 가능 여부와 제한 조건이 달라집니다.

| 난이도 | 처리 |
|--------|------|
| 쉬움 | 횟수·시간 제한 없이 자유롭게 일시정지 |
| 보통 | 최대 5회, 1회당 10초 후 자동 재개 |
| 어려움 | 버튼 비활성화(`disabled`) |

```js
case 'normal':
    if (pauseCount >= 5) return;
    pauseCount++;
    pauseTimer = setInterval(() => {
        pauseSeconds++;
        const remain = 10 - pauseSeconds;
        document.getElementById('pause-btn').textContent = `▶ 재개 (${remain}s)
        [${pauseCount}/5]`;
        if (remain <= 0) resumeGame();
    }, 1000);
```

> `setInterval(fn, 1000)` : 1000ms(1초)마다 fn을 반복 호출합니다. 재개 시 `clearInterval(pauseTimer)`로 중단합니다.
