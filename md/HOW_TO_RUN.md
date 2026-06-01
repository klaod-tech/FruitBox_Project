# FruitBox 실행 주의사항

---

## 웹 버전

### 실행

```bash
python -m http.server 8080 --directory docs
```

브라우저에서 `http://localhost:8080` 접속 후 `Ctrl+Shift+R`로 강력 새로고침.

> **주의**: 코드 수정 후 일반 새로고침(`F5`)은 캐시된 파일을 불러올 수 있습니다.  
> 반드시 `Ctrl+Shift+R`로 새로고침하세요.

### 개발자 도구 확인

- **로컬 스토리지**: F12 → 애플리케이션 → 로컬 스토리지 → `http://localhost:8080`
- **콘솔 에러 확인**: F12 → 콘솔 탭 → 빨간 에러 여부 확인
- `game_core.js: 404` 에러는 정상입니다 (WASM 없이 Mock 모드로 동작).

---

## C 터미널 버전

### 사전 준비 (처음 한 번만)

```bash
# 저장소 클론
git clone https://github.com/klaod-tech/FruitBox_Project.git
cd FruitBox_Project

# ncurses 설치 (Ubuntu)
sudo apt-get update
sudo apt-get install libncurses5-dev libncursesw5-dev
```

### 빌드 및 실행

```bash
make          # 빌드 → fruitbox 실행 파일 생성
./fruitbox    # 실행
```

### 터미널 크기 설정

화면이 잘리는 경우 터미널을 **72열 × 27줄 이상**으로 확장하세요.

```bash
gnome-terminal --geometry=80x30 -- bash -c "cd ~/FruitBox_Project && ./fruitbox; exec bash"
```

### 최신 코드 받기 / 재빌드

```bash
git pull origin master   # 최신 코드 받기
make clean && make       # 재빌드
```

---

## 오류 대처

| 오류 메시지 | 원인 | 해결 방법 |
|-------------|------|-----------|
| `ncurses.h: No such file` | ncurses 미설치 | `sudo apt-get install libncurses5-dev` |
| `error: undefined reference to pthread_create` | pthread 링크 누락 | Makefile에 `-lpthread` 확인 |
| 화면이 깨지거나 잘림 | 터미널 크기 부족 | 터미널 창을 72×27 이상으로 확대 |
| 드래그가 안 됨 | 마우스 이벤트 미지원 터미널 | GNOME Terminal 또는 xterm 사용 |
| `./fruitbox: Permission denied` | 실행 권한 없음 | `chmod +x fruitbox` 후 재실행 |
| 웹 - 변경사항이 반영 안 됨 | 브라우저 캐시 | `Ctrl+Shift+R` 강력 새로고침 |

---

## Makefile 명령 요약

| 명령 | 동작 |
|------|------|
| `make` | 빌드 (fruitbox 생성) |
| `make clean` | 빌드 산출물 삭제 |
| `make clean && make` | 클린 재빌드 |
