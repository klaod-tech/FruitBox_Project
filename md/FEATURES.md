# FruitBox 현재 기능

---

## 프로젝트 구조

### C 터미널 버전

```
FruitBox_Project/
├── main.c       전역 변수, 타이머 스레드, 입력 루프, main()
├── board.c      보드 생성, 합산 판정, 사과 제거, 아이템 스폰
├── board.h
├── ui.c         ncurses 렌더링 스레드, 마우스 이벤트 처리
├── ui.h
├── apple.h      Apple 구조체, 전역 변수 extern 선언, 게임 상수
├── Makefile
└── data/        점수 저장 파일 (score.dat)
```

| 파일 | 담당 |
|------|------|
| main.c | 이동욱 (총괄) |
| board.c / board.h | 우진 |
| ui.c / ui.h | 김현진 |

### 웹 버전

```
docs/
├── index.html      화면 구성 (시작 / 게임 / 게임오버)
├── style.css       스타일
├── game.js         게임 로직 (Mock + WASM 래퍼)
└── game_core.c     추후 Emscripten WASM 빌드용 C 소스
```

- WASM 빌드 없이 JS Mock 모드로 동작
- `game_core.js` 로드 실패 시 자동 Mock 폴백
- GitHub Pages 배포 (`docs/` 폴더 기준)

---

## 게임 규칙

- 10×17 보드에 1~9 숫자 사과가 무작위 배치됩니다.
- 마우스로 직사각형 영역을 드래그해 사과를 선택합니다.
- 선택 영역 내 숫자의 합이 **정확히 10**이면 해당 사과들이 제거됩니다.
- 제거된 사과 1개당 1점을 획득합니다.
- 제한 시간(120초) 안에 최대한 많은 점수를 획득하는 것이 목표입니다.

---

## 아이템

### 보드 스폰 아이템 (사과 제거 시 10% 확률, BOMB/CLOCK 각 50%)

| 표시 | 효과 |
|------|------|
| 💣 `[B]` 폭탄 | 클릭 시 인접 상하좌우 4칸 추가 제거 + 5점 |
| ⏱️ `[C]` 시계 | 클릭 시 남은 시간 +5초 |

### 인벤토리 아이템 (시작 시 각 2개 보유)

| 표시 | 웹 단축키 | C 단축키 | 효과 |
|------|-----------|----------|------|
| 🔍 힌트 | `E` 또는 버튼 | `e` 또는 HUD 클릭 | 합 10이 되는 인접 셀 쌍을 3초간 초록 강조 |
| 🔢 변환 | `W` 또는 버튼 | `w` 또는 HUD 클릭 | 선택한 사과의 숫자를 1로 변경 |

---

## 난이도 시스템 (웹 버전)

| 난이도 | 일시정지 |
|--------|---------|
| 쉬움 | 제한 없음 |
| 보통 | 최대 5회 / 1회당 10초 후 자동 재개 |
| 어려움 | 불가 |

---

## 키보드 단축키

### 웹 버전

| 키 | 동작 |
|----|------|
| `P` | 일시정지 / 재개 |
| `Q` | 첫 화면으로 복귀 |
| `W` | 숫자 변환 아이템 사용 |
| `E` | 돋보기 아이템 사용 |
| `R` | 보드 재시작 (게임 중 언제든) |

### C 터미널 버전

| 키 | 동작 |
|----|------|
| `p` | 일시정지 / 재개 |
| `q` | 게임 종료 |
| `w` | 숫자 변환 아이템 사용 |
| `e` | 돋보기 아이템 사용 |
| `r` | 재시작 (게임 오버 후) |
| RESET 클릭 | 보드 및 점수 초기화 |

---

## 기록 저장 / 티어 (웹 버전)

### localStorage 키

| 키 | 내용 |
|----|------|
| `fruitbox_device_id` | 기기 고유 UUID (최초 1회 자동 생성) |
| `fruitbox_best_easy` | 쉬움 최고 기록 |
| `fruitbox_best_normal` | 보통 최고 기록 |
| `fruitbox_best_hard` | 어려움 최고 기록 |

> 추후 Supabase 연동으로 전체 랭킹 공유 예정 (`Store.syncToServer()`)

### 티어 기준 (최고 기록 기준)

| 점수 | 티어 | 색상 |
|------|------|------|
| 0 ~ 15 | 브론즈 | `#cd7f32` |
| 16 ~ 30 | 실버 | `#c0c0c0` |
| 31 ~ 45 | 골드 | `#ffd700` |
| 46 ~ 60 | 플레 | `#00e5ff` |
| 61 ~ 75 | 다이아 | `#4fc3f7` |
| 76 ~ 89 | 마스터 | `#e040fb` |
| 90 ~ | 챌린저 | `#ff4444` |

---

## 기술 스택

| 항목 | C 터미널 | 웹 버전 |
|------|---------|---------|
| 언어 | C (C11) | JavaScript (ES6+) |
| UI | ncurses | Canvas API |
| 스레드 | POSIX pthread | requestAnimationFrame + setInterval |
| 마우스 입력 | xterm 1003 모드 | addEventListener |
| 렌더링 | 더블 버퍼링 30FPS | rAF 60FPS |

---

## 알고리즘

### 1. 보드 초기화

게임 시작·재시작 시 10×17 보드를 새로 채웁니다. 170개의 셀에 `Math.ceil(Math.random()*9)`로 1~9 난수를 배정하고 점수·타이머·플래그를 초기화합니다.

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

> `Math.ceil(Math.random()*9)` : 0~1 난수에 9를 곱하고 올림해 1~9 정수를 만듭니다.

---

### 2. 드래그 선택

마우스 이벤트 3개로 직사각형 선택 영역을 관리합니다. `mouseleave`도 처리해 캔버스 밖으로 나가도 드래그가 끊기지 않습니다.

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

> `canvasPos(e)` : `getBoundingClientRect()`로 CSS 표시 크기와 실제 픽셀 크기의 스케일 비율을 계산해 정확한 셀 좌표를 반환합니다.

---

### 3. 합산 판정

선택 영역 내 숫자를 모두 더해 정확히 10인지 확인합니다. `removed`된 셀과 `isItem` 셀은 합산에서 제외합니다.

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

> `Math.min / Math.max` : 드래그 방향(오른쪽→왼쪽, 아래→위)에 상관없이 올바른 범위를 잡기 위해 사용합니다.

---

### 4. 사과 제거

합 = 10 판정 통과 시 영역 내 셀을 `removed = true`로 바꾸고 점수를 반영합니다. 10% 확률로 아이템 스폰을 시도합니다.

```js
if (fn === 'remove_region') {
    const s = sumRegion(r1, c1, r2, c2);
    if (s !== 10) return 0;
    const removedCells = [];
    for (let r = Math.min(r1,r2); r <= Math.max(r1,r2); r++)
        for (let c = Math.min(c1,c2); c <= Math.max(c1,c2); c++) {
            if (board[r][c].removed) continue;
            removedCells.push([r,c]); board[r][c].removed = true;
        }
    score += removedCells.length;
    if (Math.random() < 0.1) spawnItemIn(removedCells);
}
```

> `spawnItemIn(removedCells)` : 방금 제거된 셀 목록 중 랜덤 1칸에 아이템을 배치하는 함수 (→ 알고리즘 7번).

---

### 5. 폭탄 효과

상·하·좌·우 4방향 오프셋을 순회하며 보드 범위 안의 셀을 추가 제거합니다. 모서리·가장자리에선 범위를 벗어나는 방향을 자동으로 무시합니다.

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

### 6. 시계 효과

```js
} else if (type === 2) {  // 시계
    timeLeft += 5;
}
```

상한선 없음 — 여러 번 써서 120초를 초과할 수 있습니다.

---

### 7. 아이템 스폰

사과 제거 시 10% 확률로 빈 칸에 아이템을 배치합니다.

```js
function spawnItemIn(cells) {
    if (!cells.length) return;
    const [r, c] = cells[Math.floor(Math.random() * cells.length)];
    const type = Math.random() < 0.5 ? 1 : 2;
    board[r][c] = { value: 0, isItem: true, removed: false };
    itemType[r][c] = type;
}
```

> `Math.floor(Math.random() * n)` : 0 이상 n 미만의 정수 인덱스를 만드는 표준 패턴입니다.

---

### 8. 힌트(돋보기)

가로 인접 쌍 → 세로 인접 쌍 순서로 합이 10이 되는 위치를 탐색합니다. 발견 시 `hintTimer = 3`을 설정하고 `tick()`이 1초마다 감소시켜 0이 되면 강조를 해제합니다.

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
    // 가로에서 못 찾으면 세로 탐색 (동일 구조)
}
```

---

### 9. 숫자 변환

변환 버튼 → `changeMode = true` → 다음 셀 클릭 → `value = 1`로 변경 후 모드 해제. 값을 1로 바꾸면 어떤 숫자(9)와도 합이 10이 돼 제거가 쉬워집니다.

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

---

### 10. 드래그 색깔 변경

매 프레임 `sumRegion`을 호출해 합계 표시창 색상 클래스를 결정합니다.

| 합 | 색상 | 클래스 |
|----|------|--------|
| 10 | 초록 | `match` |
| 0 < 합 ≠ 10 | 빨강 | `invalid` |
| 0 | 기본 | 없음 |

```js
const s = C.sumRegion(drag.r1, drag.c1, drag.r2, drag.c2);
sumEl.classList.toggle('match',   s === 10);
sumEl.classList.toggle('invalid', s > 0 && s !== 10);
document.getElementById('sum-value').textContent = s;
```

> `classList.toggle(class, condition)` : condition이 true면 클래스 추가, false면 제거. if/else 없이 한 줄로 처리합니다.

---

### 11. 렌더링 루프

`requestAnimationFrame`으로 브라우저 화면 갱신 주기(~60FPS)에 맞춰 보드를 다시 그립니다. 게임오버 감지 시 루프를 종료합니다.

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
        for (let c = 0; c < COLS; c++) drawCell(r, c);
}
```

> `requestAnimationFrame` : 탭이 숨겨지면 자동으로 멈춰 CPU를 절약합니다. `setInterval`보다 화면에 맞춰 부드럽게 동작합니다.

---

### 12. 타이머

렌더링 루프(~60FPS)와 독립적으로 1초마다 시간을 줄입니다. 0초 도달 시 `gameOver = true`로 설정하고 최고 기록을 저장합니다.

```js
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

### 13. 시간 경고

남은 시간 15초 이하 시 타이머를 빨간색으로 전환합니다.

```js
timerEl.textContent = `TIME: ${t}s`;
timerEl.classList.toggle('warn', t <= 15);
```

---

### 14. 난이도별 일시정지

보통 난이도에서 5회 제한, 1회당 10초 자동 재개를 구현합니다.

```js
case 'normal':
    if (pauseCount >= 5) return;
    pauseCount++;
    pauseTimer = setInterval(() => {
        pauseSeconds++;
        const remain = 10 - pauseSeconds;
        document.getElementById('pause-btn').textContent = `▶ 재개 (${remain}s) [${pauseCount}/5]`;
        if (remain <= 0) resumeGame();
    }, 1000);
```

> `setInterval(fn, 1000)` : 1초마다 fn을 반복 호출합니다. 재개 시 `clearInterval(pauseTimer)`로 중단합니다.

---

### 15. 게임오버 판정

`tick()`에서 `gameOver = true`가 설정되면 `gameLoop()`가 이를 감지하고 결과 화면을 표시합니다.

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

---

### 16. 재시작

기존 루프를 완전히 정지하고 상태를 초기화한 뒤 새 게임을 시작합니다. `pauseCount`도 함께 리셋해 일시정지 횟수가 이월되지 않습니다.

```js
C.restart();
drag = { active: false, r1:0, c1:0, r2:0, c2:0 };
pauseCount = 0; pauseSeconds = 0;
clearInterval(pauseTimer); clearInterval(timerInterval);
cancelAnimationFrame(rafId);
startTimer(); gameLoop();
```

> `cancelAnimationFrame(rafId)` : 예약된 다음 프레임을 취소합니다. 없으면 이전 루프와 새 루프가 동시에 돌아 속도가 두 배가 됩니다.

---

### 17. localStorage 기록 저장

난이도별로 독립된 키에 최고 기록을 저장합니다.

```js
saveBest(diff, score) {
    if (score >= this.getBest(diff))
        localStorage.setItem(`fruitbox_best_${diff}`, score);
},
getBest(diff) {
    return parseInt(localStorage.getItem(`fruitbox_best_${diff}`) || '0', 10);
},
```

> `localStorage.setItem` : 브라우저에 영구 저장합니다. 탭을 닫아도 사라지지 않습니다.

---

### 18. 기기 ID 생성

최초 실행 시 UUID v4를 자동 생성해 localStorage에 저장합니다. 추후 Supabase 랭킹 연동 시 로그인 없이 사용자를 구분하는 키로 사용됩니다.

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

> `crypto.getRandomValues()` : `Math.random()`보다 예측이 어려운 암호학적 난수 생성기로 ID 충돌 확률을 극히 낮춥니다.

---

### 19. 티어 판정

높은 구간부터 순서대로 비교해 처음 조건을 만족하는 티어를 반환합니다. 시작 화면·게임오버 화면 두 곳에서 사용됩니다.

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
