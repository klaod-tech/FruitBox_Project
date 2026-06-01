# FruitBox 주요 함수 및 변수 설명

다이어그램에 등장하는 함수와 변수가 어떤 역할을 하는지 정리합니다.

---

## C 객체 (게임 로직 호출부)

`C`는 게임 로직(Mock 또는 WASM)을 호출하는 래퍼 객체입니다.
실제 연산은 내부 Mock 함수에서 처리되며, `C.함수명()` 형태로 호출합니다.

| 함수 | 반환값 | 설명 |
|------|--------|------|
| `C.over()` | 0 또는 1 | 게임오버 여부. 1이면 게임 종료 상태 |
| `C.paused()` | 0 또는 1 | 일시정지 여부. 1이면 정지 상태 |
| `C.score()` | 정수 | 현재 점수 |
| `C.best()` | 정수 | 현재 세션의 최고 기록 |
| `C.time()` | 정수 | 남은 시간(초) |
| `C.tick()` | - | 1초마다 호출. 시간 감소 및 게임오버 판정 처리 |
| `C.restart()` | - | 보드 재생성 및 모든 게임 상태 초기화 |
| `C.pause()` | - | 일시정지 상태 토글 (켜기/끄기) |
| `C.sumRegion(r1,c1,r2,c2)` | 정수 | 지정 영역 내 숫자 합산 결과 반환 |
| `C.removeRegion(r1,c1,r2,c2)` | 정수 | 합=10이면 해당 영역 제거. 제거된 셀 수 반환 |
| `C.useHint()` | 0 또는 1 | 힌트 아이템 사용. 성공 시 1 반환 |
| `C.useChange(r,c)` | 0 또는 1 | 숫자 변환 아이템 사용. 해당 셀을 1로 변경 |
| `C.itemCount(t)` | 정수 | 인벤토리 아이템 잔여 개수. t=0: 힌트, t=1: 변환 |

---

## Store 객체 (로컬 저장소)

`Store`는 브라우저 localStorage를 통해 기록을 저장하고 불러오는 객체입니다.

| 함수 | 설명 |
|------|------|
| `Store.getDeviceId()` | 기기 고유 ID 반환. 없으면 UUID 생성 후 저장 |
| `Store.getBest(diff)` | 해당 난이도의 최고 기록 반환. 없으면 0 |
| `Store.saveBest(diff, score)` | 현재 점수가 저장값 이상이면 localStorage에 덮어쓰기 |
| `Store.getTier(score)` | 점수에 해당하는 티어 이름과 색상 반환 |

---

## 주요 함수

| 함수 | 설명 |
|------|------|
| `gameLoop()` | `requestAnimationFrame`으로 반복 호출되는 메인 렌더링 루프. 매 프레임 화면을 갱신하고 게임오버를 감지 |
| `render()` | 보드 전체를 다시 그리는 함수. `drawCell()`을 170번(10×17) 호출 |
| `updateHud()` | 점수, 시간, 합계 표시를 최신 상태로 갱신 |
| `showGameOver()` | 타이머와 렌더링 루프를 정지하고 게임오버 화면 표시 |
| `startTimer()` | `setInterval`로 1초마다 `C.tick()`을 호출하는 타이머 시작 |
| `resumeGame()` | 일시정지 타이머를 해제하고 게임 재개 |
| `updateStartTier()` | 시작 화면의 티어 표시를 현재 난이도 최고 기록 기준으로 갱신 |
| `canvasPos(e)` | 마우스 이벤트 좌표를 보드의 행/열 인덱스로 변환 |

---

## 주요 변수

| 변수 | 타입 | 설명 |
|------|------|------|
| `drag` | 객체 | 드래그 상태. `{ active, r1, c1, r2, c2 }` 형태로 선택 영역 저장 |
| `difficulty` | 문자열 | 현재 난이도. `'easy'` / `'normal'` / `'hard'` 중 하나 |
| `pauseCount` | 정수 | 보통 난이도에서 일시정지를 사용한 횟수 (최대 5회) |
| `changeMode` | boolean | 숫자 변환 모드 활성 여부. `true`이면 다음 셀 클릭 시 값을 1로 변경 |
| `rafId` | 정수 | `requestAnimationFrame`의 반환 ID. 루프 중단 시 `cancelAnimationFrame(rafId)`에 사용 |
| `timerInterval` | 정수 | `setInterval`의 반환 ID. 타이머 중단 시 `clearInterval(timerInterval)`에 사용 |
| `board[r][c]` | 객체 배열 | 10×17 보드 상태. 각 셀은 `{ value, isItem, removed }` 구조 |
| `itemType[r][c]` | 정수 배열 | 보드 각 셀의 아이템 종류. 0: 없음, 1: 폭탄, 2: 시계 |
| `itemCounts[t]` | 정수 배열 | 인벤토리 잔여 개수. `[힌트 개수, 변환 개수]` |
