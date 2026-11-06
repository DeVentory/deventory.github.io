---
title: 공유 메모리와 named pipe로 세 프로그램 이어 붙이기
date: 2026-10-28
category: study
tags: c, ipc, shared-memory, named-pipe, system-programming
---

# 무엇을 만들었나

세 개의 프로그램을 따로 실행해서, 키보드 입력이 공유 메모리와 named pipe를 거쳐 화면에 나오게 했습니다.

- **Trigger**: 키보드로 `정수 정수 연산자`를 입력받아 공유 메모리에 씁니다. `$`를 입력하면 종료합니다.
- **Producer**: 공유 메모리에서 읽어 계산하고, 10초마다 결과를 named pipe로 보냅니다.
- **Consumer**: named pipe로 받은 결과를 화면에 출력합니다.

```
Trigger ──(System V shm)──> Producer ──(named pipe)──> Consumer
```

---

# 처음 만든 것을 버린 이유

처음에는 `fork()`로 한 프로그램 안에서 세 역할을 나눠 만들었습니다. 그런데 과제 명세는 세 프로그램을 터미널에서 따로 실행하는 형태였습니다. 한 프로그램 안의 `fork()` 버전은 명세와 다른 구조라서 버리고 다시 만들었습니다. 명세를 끝까지 읽고 구조부터 맞춰야 한다는 점을 배웠습니다.

---

# 공유 메모리 (Trigger → Producer)

System V 공유 메모리를 키 값으로 연결합니다. 두 프로그램이 같은 키(`1234`)로 `shmget()`을 부르면 같은 메모리를 얻습니다.

```c
shmid = shmget((key_t)1234, sizeof(struct data), 0666|IPC_CREAT);
shared_memory = shmat(shmid, NULL, 0);
```

- 어느 쪽이 먼저 실행돼도 되도록 두 프로그램 모두 `IPC_CREAT`를 붙였습니다.
- Producer는 시작할 때 공유 메모리를 0으로 비웁니다. 지난 실행에서 남은 `$`가 있으면 시작하자마자 끝나 버리기 때문입니다.
- 이 과제는 세마포어 같은 동기화를 쓰지 않는 조건이어서, Trigger가 쓰는 도중에 Producer가 읽을 수 있습니다. 그래서 이전 값과 바뀌었는지 비교해서 새 입력이 들어왔을 때만 출력하게 했습니다.

---

# named pipe (Producer → Consumer)

```c
mkfifo("/tmp/myfifo_w", S_IRUSR|S_IWUSR);
wfd = open("/tmp/myfifo_w", O_RDWR);
```

- FIFO를 읽기나 쓰기 전용으로 열면 반대편이 열릴 때까지 `open`이 멈춥니다. `O_RDWR`로 열어서 상대 프로그램이 아직 없어도 멈추지 않게 했습니다.
- Consumer도 `mkfifo()`를 불러서, Producer보다 먼저 실행해도 동작하게 했습니다.
- 문자열이 아니라 구조체 두 개(계산 결과, 시각 `struct tm`)를 그대로 `write`합니다. 구조체를 통째로 쓰면 패딩 바이트도 같이 전달되는데, 두 프로그램을 같은 환경에서 컴파일해서 문제가 없었습니다.

---

# 디버그 출력

데이터가 어떻게 오가는지 보려고 `FROM KEYBOARD`, `FROM TRIGGER`, `TO Consumer`, `FROM Producer` 단계마다 바이트를 16진수로 출력하는 코드를 넣었습니다. `#if DEBUG`로 감싸서 평소에는 꺼 두고, 컴파일할 때 `-DDEBUG`를 맨 뒤에 붙이면 켜집니다.

```
gcc -o producer producer.c -DDEBUG
```

보고서에는 디버그를 끈 화면과 켠 화면을 모두 넣었습니다. 공유 메모리와 FIFO가 실제로 만들어졌는지는 `ipcs`와 `ls -al /tmp`로 확인했습니다.

---

# 시험 방법

Producer의 전송 간격이 10초라서 확인에 시간이 걸립니다. `INTERVAL`을 `#ifndef`로 감싸 두고 `-DINTERVAL=1`로 컴파일해서, 맥에서 세 프로그램을 연동하는 시험을 빠르게 돌렸습니다. 최종 확인은 실습 서버에서 했습니다.

---

# 배운 점

- 공유 메모리는 빠르지만 동기화는 직접 해결해야 한다. 이 과제에서는 조건상 생략했지만 실제로는 세마포어가 필요하다.
- named pipe는 파일 시스템에 이름이 있는 통로라서 서로 관계없는 프로세스끼리 연결할 수 있다.
- 프로그램을 따로 실행하는 구조에서는 시작 순서와 이전 실행의 잔재(공유 메모리 값, FIFO 파일)를 신경 써야 한다.
