---
title: DIVA 앱 정적 분석, Manifest부터 하드코딩까지
date: 2026-10-22
category: security
tags: android, apk, static-analysis, diva
---

# 무엇을 분석했나

DIVA(Damn Insecure and Vulnerable App)는 일부러 취약하게 만든 안드로이드 학습용 앱입니다. 모바일보안 수업 실습으로, APK를 jadx로 디컴파일해서 코드와 `AndroidManifest.xml`만 읽는 정적 분석을 했습니다. 앱을 실행해서 확인한 내용이 아니라 코드를 읽고 추론한 내용입니다.

- 패키지: `jakhar.aseem.diva`
- minSdk 15, targetSdk 23

---

# Manifest에서 찾은 문제

- `debuggable="true"`: 배포용 앱에 켜져 있으면 디버거가 붙을 수 있어서 가장 심각하게 봤습니다.
- `allowBackup="true"`: 백업을 통해 앱 데이터가 빠져나갈 수 있습니다.
- targetSdk가 23이라 평문(cleartext) 통신이 기본으로 허용되고, `networkSecurityConfig`도 없습니다.
- 콘텐츠 프로바이더(`NotesProvider`)가 `exported=true`인데 권한 설정이 없어서, 다른 앱이 접근할 수 있습니다.

---

# 코드에서 찾은 문제

- 하드코딩: 코드 안에 비밀 키와 계정 정보가 그대로 적혀 있습니다. 네이티브 라이브러리(`.so`)도 `strings`로 열어 보면 비교에 쓰는 문자열이 보입니다.
- SQL 인젝션: `rawQuery`에 입력값을 문자열로 이어 붙여서 `' OR '1'='1` 같은 입력이 통하는 구조입니다.
- 자격증명 평문 저장: 몇몇 화면이 아이디와 비밀번호를 암호화하지 않고 저장하고, 한 곳은 외부 저장소의 파일에 씁니다.
- 로그 노출: 신용카드 번호를 logcat에 출력합니다.
- 접근 통제: `exported`된 컴포넌트를 직접 호출해서 화면 우회가 가능합니다.
- 웹뷰: `setJavaScriptEnabled(true)` 상태에서 사용자가 입력한 값을 검증 없이 `loadUrl`에 넣습니다. `file://` 같은 주소도 그대로 들어갑니다.

---

# 수업 필기와 다르게 나온 점

수업에서 웹뷰의 대표 취약점으로 `addJavascriptInterface()`를 배웠는데, DIVA에서는 이 함수를 쓰지 않았습니다. 대신 위의 `loadUrl` 입력 검증 문제가 있었습니다. 같은 취약점 유형이라도 앱마다 코드에 나타나는 모양이 다르니, 코드를 직접 확인해야 합니다.

---

# 이번에 정리한 점검 순서

1. Manifest: 디버그 가능 여부, 백업 허용, 평문 통신, `exported` 컴포넌트
2. 웹뷰: JavaScript 허용 여부, 브릿지 사용 여부, 로드하는 주소 검증
3. 통신: 평문 `http://` 사용 여부
4. 하드코딩: 문자열 상수와 네이티브 라이브러리
5. 저장소: 평문 저장, 외부 저장소, 로그

정적 분석은 가설을 세우는 단계이고, 실제로 되는지는 동적 분석으로 확인해야 한다는 것도 정리해 두었습니다.
