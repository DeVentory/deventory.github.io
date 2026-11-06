---
title: [CLASS:JAVA]03.Variables
date: 2023-07-25
category: study
tags: java, velog-import
---

# 자료형 변수

- 정수형: byte, short, int(-2,127,483,648~2,127,483,647), long
- 실수형: float(소수점7자리), double(소수점11자리)
- 문자형: char(문자 하나), String(문자열)
- 논리형: boolean
- 주의사항:
  - 문자열 담당하는 String 작성할 때 S 대문자로 작성할 것
  - 각 자료형 별 디폴트 값 존재함에 유의(int, double)해서 값뒤에 L, F붙여줄 것
  - boolean형의 값은 true 아니면 false만 가능

---

# Code

```java
package chap_01;
public class _02_DataType {
    public static void main(String[] args) {    // "psvm" 입력
        int a = 13;
        long b = 2200000000L;
        float c = 0.0000001F;
        double d = 0.00000000001;
        char e = 'L';
        String f = "Oreo";
        boolean g = true;

        System.out.println(a);
        System.out.println(b);
        System.out.println(c);
        System.out.println(d);
        System.out.println(e);
        System.out.println(f);
        System.out.println(g);
    }
}
```
