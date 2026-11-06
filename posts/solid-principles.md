---
title: SOLID 5원칙을 예시로 정리하기
date: 2026-10-15
category: study
tags: java, oop, software-engineering
---

# SOLID란

객체지향 설계에서 변경에 강한 코드를 만들기 위한 다섯 가지 원칙입니다. 각 원칙의 첫 글자를 모아 SOLID라고 부릅니다.

---

# S. 단일 책임 원칙 (SRP)

클래스는 변경할 이유가 하나여야 합니다. 보고서 내용을 만드는 일과 보고서를 파일로 저장하는 일은 바뀌는 이유가 다르므로 다른 클래스로 나눕니다.

---

# O. 개방-폐쇄 원칙 (OCP)

확장에는 열려 있고 수정에는 닫혀 있어야 합니다. 새 기능을 넣을 때 기존 코드를 고치지 않고 추가만 하면 되는 구조가 좋습니다.

```java
interface Discount { int apply(int price); }

class RateDiscount implements Discount {
    public int apply(int price) { return price * 9 / 10; }
}
// 새 할인 방식은 Discount 를 구현한 클래스를 하나 더 만들면 된다.
```

---

# L. 리스코프 치환 원칙 (LSP)

자식 클래스는 부모 클래스를 쓰는 곳 어디에 넣어도 문제없이 동작해야 합니다. 부모가 약속한 동작을 자식이 깨면 이 원칙을 어긴 것입니다.

---

# I. 인터페이스 분리 원칙 (ISP)

클라이언트가 쓰지 않는 메서드에 의존하지 않아야 합니다. 큰 인터페이스 하나보다 역할별로 나눈 작은 인터페이스가 낫습니다.

---

# D. 의존성 역전 원칙 (DIP)

상위 모듈이 하위 모듈의 구체 클래스에 의존하지 말고, 둘 다 추상(인터페이스)에 의존해야 합니다.

```java
class OrderService {
    private final Discount discount;           // 구체 클래스가 아니라 인터페이스
    OrderService(Discount discount) { this.discount = discount; }
}
```

---

# 한 줄 요약

- S: 바뀌는 이유가 하나인 클래스
- O: 추가로 확장하고 기존 코드는 안 고친다
- L: 자식은 부모 자리에 들어가도 된다
- I: 쓰지 않는 메서드를 강요하지 않는다
- D: 구체가 아니라 추상에 의존한다
