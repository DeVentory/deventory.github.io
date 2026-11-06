# DeVentory의 책상

글을 쪽지처럼 책상 위에 올려 둔 개발 블로그입니다. 정적 사이트(HTML·CSS·JS)이고 GitHub Pages로 배포합니다.

## 글은 이렇게 올라옵니다

- **Velog 글**: [Velog](https://velog.io/@cahill20012002)에 쓰면 됩니다. 이 사이트는 빌드할 때 Velog RSS를 받아 마크다운으로 바꿔 쪽지로 보여 주고, 카드에 `Velog` 표시와 원문 링크를 붙입니다.
  - 매일 06:17(한국 시간)에 자동으로 다시 빌드합니다. 바로 반영하려면 GitHub의 Actions 탭에서 `Deploy Pages`를 수동 실행하세요.
  - Velog RSS에는 태그 정보가 없어서, 카테고리는 `site.json`의 `overrides`에 글 주소(퍼센트 인코딩을 푼 형태)와 카테고리·태그를 적어 정합니다. 적지 않은 글은 기본값(`study`)이 됩니다.
  - Velog를 받지 못하면 배포가 실패하고 이전 사이트가 그대로 유지됩니다.
- **사이트 전용 글**: `posts/이름.md`에 아래 머리말과 함께 씁니다. 같은 제목의 Velog 글이 있으면 Velog 쪽이 우선합니다.

  ```
  ---
  title: 글 제목
  date: 2026-11-06
  category: study        # study | project | security
  tags: java, socket
  pinned: true           # 맨 위에 고정 (생략 가능)
  ---
  ```
- **고정**: Velog 글은 `site.json`의 `pinned`에 글 주소 이름(`velog-…`)을 적습니다. 사이트 전용 글은 머리말의 `pinned: true`로도 됩니다.

## 로컬에서 보기

```bash
python3 build.py              # posts/*.md + Velog → posts.js
python3 build.py --no-velog   # 네트워크 없이
open index.html
```

## 사이트 안 글쓰기 (선택, 기본은 꺼짐)

`config.js`의 `enableOwner`를 `true`로 바꾸면 `🔑 관리`와 `✏️ 글쓰기`가 켜집니다. GitHub fine-grained 토큰(이 저장소 하나, Contents 읽기·쓰기, 만료 짧게)을 한 번 입력하면 저장소에 직접 커밋합니다. 토큰은 그 기기의 브라우저에만 저장되고 `api.github.com` 외에는 보내지 않습니다. 쓰지 않으면 꺼 두는 편이 안전합니다.

## 구조

- `lib.js` 마크다운 렌더러·테마, `app.js` 책상 화면, `terminal.js` 숨은 터미널(`` ` `` 키), `owner.js` 사이트 안 글쓰기, `config.js` 설정, `site.json` Velog 계정·기본 카테고리·고정 글
- `build.py`: md와 Velog RSS를 모아 `posts.js` 생성 (Velog HTML은 허용한 문법만 마크다운으로 변환하고, 스크립트와 `javascript:` 링크는 버립니다)
- `.github/workflows/pages.yml`: push·매일·수동 실행 때 빌드해서 Pages에 배포
