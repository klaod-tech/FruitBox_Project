# FruitBox 실행 방법

---

## 사전 준비

### 1. Ubuntu 터미널 열기

- Ubuntu 앱 실행 또는 VS Code 터미널에서 Ubuntu 선택

### 2. 저장소 클론 (처음 한 번만)

```bash
git clone https://github.com/klaod-tech/FruitBox_Project.git
cd FruitBox_Project
```

> 이미 클론된 경우 생략하고 프로젝트 폴더로 이동하세요.

### 3. ncurses 라이브러리 설치 (처음 한 번만)

```bash
sudo apt-get update
sudo apt-get install libncurses5-dev libncursesw5-dev
```

---

## 빌드 및 실행

### 4. 프로젝트 폴더로 이동

```bash
cd ~/FruitBox_Project
```

### 5. 빌드

```bash
make
```

성공 시 `fruitbox` 실행 파일이 생성됩니다.

### 6. 실행

```bash
./fruitbox
```

---

## 터미널 크기 설정

화면이 잘리는 경우 터미널을 **72열 × 27줄 이상**으로 늘려주세요.

```bash
gnome-terminal --geometry=80x30 -- bash -c "cd ~/FruitBox_Project && ./fruitbox; exec bash"
```

---

## 최신 코드 받기

```bash
git pull origin master
```

## 재빌드

소스 수정 후 다시 빌드하려면:

```bash
make clean
make
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

---

## Makefile 명령 요약

| 명령 | 동작 |
|------|------|
| `make` | 빌드 (fruitbox 생성) |
| `make clean` | 빌드 산출물 삭제 |
