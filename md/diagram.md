# FruitBox 다이어그램 분류

알고리즘 19개를 흐름(Flow) 기준으로 5개 다이어그램으로 분류합니다.
각 노드에 핵심 코드(연산식 / 조건식)를 포함합니다.

---

## 다이어그램 1 — 게임 시작 흐름

```
앱 실행
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ [알고리즘 18] 기기 ID 생성                            │
│ localStorage에 ID 없으면 UUID 신규 생성 후 저장       │
│                                                     │
│ let id = localStorage.getItem('fruitbox_device_id') │
│ if (!id) { id = generateUUID(); setItem(..., id); } │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│ [알고리즘 17] localStorage 기록 불러오기                   │
│ 난이도별 키로 최고 기록 조회, 없으면 0 반환               │
│                                                          │
│ parseInt(localStorage.getItem(`fruitbox_best_${diff}`)   │
│          || '0', 10)                                     │
└──────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ [알고리즘 19] 티어 판정                                        │
│ 점수 구간을 높은 쪽부터 비교, 첫 번째 만족 구간 반환          │
│                                                              │
│ if (score >= 90) return { name: '챌린저', color: '#ff4444' } │
│ ...                                                          │
│ return { name: '브론즈', color: '#cd7f32' }                  │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
난이도 선택 → 버튼 클릭 시 difficulty 변경 + 티어 즉시 갱신
  │
  ▼
게임 시작 버튼 클릭 → [다이어그램 2]로 이동
```

---

## 다이어그램 2 — 게임 진행 루프

```
게임 시작  ◄─────────────────────────────────────────────┐
  │                                                      │
  ▼                                                      │
보드 초기화                                               │
170개 셀에 1~9 난수 배정                                  │
board[r][c] = {value: Math.ceil(Math.random()*9)}        │
  │                                                      │
  ▼                                                      │
게임 오버 여부                                            │
if(C.over()){ showGameOver(); Return                     │
  │                                                      │
  ├─ True ──► 다시하기 버튼 클릭 ────────────────────────┘
  │           restart-btn.onClick
  │           C.restart()
  │
  └─ False
       │
       ▼
  게임 진행
  rafId = requestAnimationFrame(gameLoop)
       │
       ▼
  드래그 선택
  drag = { active = true, r1: r, c1: c, r2: r, c2: c }
       │
       ▼
  합계 10 여부
  sumEl.classList.toggle('match', s === 10)
  ('invalid', s > 0 && s !== 10)
       │
       ├─ 합계 != 10 ──► 합계칸 빨간색 변환
       │                 sum-display.invalid
       │                 {color: #e94560; font-weight: bold}
       │
       └─ 합계 = 10
            │
            ▼
        합계칸 초록색 변환
        sum-display.match
        {color: #69f0ae; font-weight: bold}
            │
            ▼
        사과 제거 여부
        if(!board[r][c].removed && !board[r][c].isItem)
        s += value
            │
            ├─ 합계 != 10 ──► 제거 거부
            │                 if(s !== 10) return 0
            │
            └─ 합계 = 10
                 │
                 ▼
             사과 제거
             s === 10
             board[r][c].removed = true
                 │
                 ▼
             점수 반영
             score += removedCells.length
                 │
                 ▼
             사과 제거 시 아이템 10% 생성
             Math.random() < 0.1
             spawnItemIn(removedCells)
                 │
                 ├─ 아이템 생성 X ──► 제거된 칸 검은색 렌더링
                 │                   if(removed)
                 │                   {ctx.fillStyle = COLOR.removed}
                 │
                 └─ 아이템 생성 O
                      │
                      ▼
                  폭탄 / 시계
                  Math.random() < 0.5  → 폭탄
                  Math.random() >= 0.5 → 시계
                      │
                      ▼ (클릭 시)
                  제거된 칸 검은색 렌더링
                  if(removed)
                  {ctx.fillStyle = COLOR.removed}
```

---

## 다이어그램 3 — 아이템 흐름

```
사과 제거 완료 (다이어그램 2에서 진입)
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│ [알고리즘 7] 아이템 스폰 판정                              │
│ 10% 확률 → 제거 셀 중 랜덤 1칸 선택 → BOMB/CLOCK 결정    │
│                                                          │
│ if (Math.random() < 0.1) spawnItemIn(removedCells)       │
│ const type = Math.random() < 0.5 ? 1 : 2                │
└──────────────────────────────────────────────────────────┘
  │
  ├─ 아이템 생성 X (90%) → 종료
  │
  └─ 아이템 생성 O (10%)
       │
       ▼
  isClicked = 보드 위 아이템 클릭
  isUsed    = HUD 버튼(힌트/변환) 클릭
       │
       ▼
  switch (type)
       │
       ├─ case 1 : 폭탄 💣
       │   [알고리즘 5] 상하좌우 4칸 추가 제거
       │   [[-1,0],[1,0],[0,-1],[0,1]].forEach
       │   → board[r+dr][c+dc].removed = true
       │   → score += 5
       │
       ├─ case 2 : 시계 ⏱️
       │   [알고리즘 6] 남은 시간 5초 추가
       │   → timeLeft += 5
       │
       ├─ case 힌트 : 돋보기 🔍
       │   [알고리즘 8] 합 10인 인접 쌍 탐색 → 3초간 강조
       │   board[r][c].value + board[r][c+1].value === 10
       │   → hintActive = true; hintTimer = 3; itemCounts[0]--
       │
       └─ case 변환 : 숫자 변환 🔢
           [알고리즘 9] 선택 셀 값을 1로 변경
           isClicked = C.useChange(r, c)
           → board[r][c].value = 1; itemCounts[1]--
```

---

## 다이어그램 4 — 타이머 흐름

```
게임 시작 버튼 클릭
startTimer()
  │
  ▼
시간 설정
setInterval(C.tick, 1000)
  │
  ▼ (매 1초마다 실행)
틱 실행 확인  ◄─────────────────────────────────┐
if(gameOver || paused)                          │
  │                                             │
  ├─ True ──► 게임오버/일시정지 상태 시간 정지    │
  │           return ───────────────────────────┘
  │
  └─ False
       │
       ▼
  시간 감소
  timeLeft--
       │
       ▼
  15초 미만시 시간 경고 확인
  t = C.time()
  timerEl.classList.toggle('warn', t <= 15)
       │
       ├─ False ──► 15초 이상
       │            timerEl.classList.remove('warn')
       │
       └─ True
            │
            ▼
        15초 미만 경고
        timerEl.classList.add('warn')
            │
            ▼
        남은 시간 확인
        timeLeft === 0 ?
            │
            ├─ True ──► 게임오버
            │           gameOver = true
            │           → [다이어그램 5]로 이동
            │
            └─ False
                 │
                 ▼
              return ──────────────────────────────┘
              (1초 후 틱 반복)
```

---

## 다이어그램 5 — 게임 종료 흐름

```
제한 시간 완료
timeLeft === 0
gameOver = true
  │
  ▼
루프 정지
clearInterval(timerInterval)
cancelAnimationFrame(rafId)
  │
  ▼
최종 점수 및 최고 점수 표시
document.getElementById('final-score'), ('final-best')
  .textContent = C.score(), C.best()
  │
  ▼
저장 여부
if(score >= this.getBest(diff)) ?
  │
  ├─ False ──► 저장 X
  │
  └─ True
       │
       ▼
  최고 점수 저장
  localStorage.setItem(`fruitbox_best_${diff}`, score)
  │
  ▼
점수로 티어 판정
switch(true)
case score >= n : return {name: 'tier', color: 'color'}
  │
  ├─ score < 16  → 브론즈
  │                default: return {name: '브론즈', color: '#cd7f32'}
  │
  ├─ score >= 31 → 골드
  │                return {name: '골드', color: '#ffd700'}
  │
  └─ score >= 90 → 챌린저
                   return {name: '챌린저', color: '#ff4444'}
  │ (전체 case 수렴)
  ▼
티어 갱신
document.getElementById('final-tier').textContent = tier.name
  │
  ▼
게임 오버 화면 표시
document.getElementById('gameover-screen').classList.remove('hidden')
  │
  ▼
버튼 선택
document.getElementById('restart-btn'), ('home-btn')
  │
  ├─ 다시 시작 클릭 (restart-brn.onClick)
  │   게임 진행 다이어그램 이동
  │   C.restart()
  │   → [다이어그램 2]로 이동
  │
  └─ 처음으로 클릭 (home-btn.onClick)
      게임 시작 다이어그램 이동
      start-screen.classList.remove('hidden')
      → [다이어그램 1]로 이동
```

---

## 전체 흐름 요약

```
[다이어그램 1] 게임 시작 흐름
        │
        ▼
[다이어그램 2] 게임 진행 루프  ◄──────────────────┐
        │                                         │
        ├──► [다이어그램 3] 아이템 흐름            │
        │                                         │
        │    [다이어그램 4] 타이머 흐름 (병렬)      │
        │                                         │
        ▼                                         │
[다이어그램 5] 게임 종료 흐름                       │
        │                                         │
        └──────── 재시작 ──────────────────────────┘

        [다이어그램 6] 일시정지 흐름 (독립 이벤트)
```

---

## 다이어그램 6 — 일시정지 흐름

pause 버튼 클릭 시 독립적으로 실행되는 이벤트 리스너입니다.

```
일시정지 버튼 클릭
pause-btn.addEventListener('click', ...)
  │
  ▼
현재 정지 상태 확인
isPaused = C.paused()
  │
  ├─ True ──► 정지 상태 해제
  │           clearInterval(pauseTimer)
  │           C.pause()
  │               │
  │               ▼
  │           정지 버튼 추가
  │           pause-btn.textContent = '일시정지'
  │
  └─ False
       │
       ▼
  난이도 확인
  switch(difficulty)
       │
       ├─ easy
       │   쉬움 단계 무한 정지 가능
       │   C.pause()
       │       │
       │       ▼
       │   재개 버튼 추가
       │   pause-btn.textContent = '재개'
       │
       ├─ hard
       │   어려움 단계 정지 불가
       │   return
       │
       └─ normal
           중간 단계 5회 정지 가능 횟수 확인
           if(pauseCount >= 5) return
               │ false
               ▼
           정지 회수 및 카운트 추가
           pauseCount++
           pauseSeconds++
           const remain = 10 - pauseSeconds  ◄──────┐
               │                                    │
               ▼                                    │
           재개 화면 추가                             │
           pause-btn.textContent =                  │
             `재개 (${remain}s [${pauseCount}/5]`   │
               │                                    │
               ▼                                    │
           카운트 종료 또는 버튼 클릭                  │
           if(remain <= 0)                          │
           pause-btn.onClick                        │
               │                                    │
               ├─ False ────────────────────────────┘
               │
               └─ True
                     │
                     ▼
                 게임 재개
                 resumeGame()
```
