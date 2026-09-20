# STUDY

`content/` 폴더에 JSON 파일을 넣으면 그대로 사이트에 올라가는 개인 학습 사이트.
빌드 도구나 설치할 패키지가 없음. Node만 있으면 됨.

- **본문**: 문장을 탭하면 해석이 보임. `EN` → `EN·KO` → `KO`(해석만 보고 영어 떠올리기) 모드 전환
- **문제**: 객관식 · O/X · 단답 · 빈칸 · 순서/단어 배열 · 서술형(자가채점). 오답만 다시 풀기
- **단어**: 플래시카드. 탭하면 뒤집히고, 좌우로 스와이프하면 모름/앎
- 진행 상황은 기기별로 브라우저에 저장됨. 한 번 열어 본 자료는 오프라인에서도 열림

---

## 사용법

### 로컬에서 보기

```bash
node serve.mjs
```

`http://localhost:5173`. 같은 와이파이에 연결된 폰에서는 터미널에 찍히는 `http://192.168.x.x:5173` 주소로 접속.
파일을 추가하거나 고친 뒤 새로고침하면 바로 반영됨.

### 인터넷에 올리기 (GitHub Pages)

1. 이 폴더를 GitHub 저장소로 push (브랜치 `main`)
2. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 설정
3. 이후 `content/`에 파일을 넣고 push할 때마다 자동으로 배포됨 (`.github/workflows/pages.yml`)

> 무료 요금제에서 Pages를 쓰려면 저장소가 public이어야 함. 즉 자료도 공개됨.
> 비공개로 두고 싶으면 Cloudflare Pages나 Netlify에 저장소를 연결하고 빌드 명령을 `node build.mjs`, 출력 폴더를 `/`(루트)로 지정.

### 파일 검사

```bash
node build.mjs
```

`content/`를 훑어서 목록 파일(`content/index.json`)을 만들고, 형식이 잘못된 곳을 `⚠ 파일: 위치: 이유`로 알려 줌.
문제가 있는 문항만 빠지고 나머지는 정상적으로 게시됨. 배포할 때도 자동으로 실행되므로 평소에 직접 돌릴 필요는 없음.

---

## 폴더 규칙

```
content/
├─ 01_영어/                 ← 폴더 = 홈 화면의 묶음. `숫자_` 접두어로 순서 지정 (표시할 때는 "영어")
│  ├─ 2학기 중간/            ← 하위 폴더는 "영어 / 2학기 중간"으로 표시
│  │  ├─ L1 본문.json
│  │  └─ L1 변형문제.json
│  └─ 단어장.json
├─ 02_국어/ …
└─ _초안.json               ← _ 또는 . 으로 시작하는 파일·폴더는 무시됨
```

- 한 파일 = 홈 화면의 한 줄. 본문·문제·단어를 한 파일에 같이 넣어도, 따로 나눠도 됨
- 같은 폴더 안에서는 파일 이름순(숫자 인식: `L2` < `L10`). `order` 필드로 직접 정할 수도 있음
- 인코딩은 UTF-8

---

## 파일 형식

전체 예시: [`content/영어/예시.json`](content/영어/예시.json)

### 최상위

```jsonc
{
  "title": "Lesson 3. The Power of Habits",   // 없으면 파일 이름
  "subtitle": "2학기 중간",                    // 선택. 홈 목록에 작게 표시
  "order": 3,                                  // 선택. 같은 폴더 안 정렬 순서 (작을수록 위)
  "passages": [ … ],                           // 본문 목록
  "questions": [ … ],                          // 문제 목록
  "vocab": [ … ]                               // 단어 목록
}
```

세 목록 모두 선택이지만 최소 하나는 있어야 함. 본문이 하나뿐이면 `"passage": { … }`처럼 배열 없이 써도 됨.

### 본문 `passages[]`

```jsonc
{
  "id": "p1",                       // 선택. 문제에서 이 본문을 가리킬 때 씀 (기본값 p1, p2, …)
  "title": "The Power of Small Habits",
  "text": "문장 1\n문장 2\n\n다음 문단 문장 1\n…",
  "translation": "해석 1\n해석 2\n\n다음 문단 해석 1\n…",   // 선택
  "source": "교과서 p.52",          // 선택. 본문 아래 오른쪽에 작게 표시
  "layout": "lines",               // 선택. 대화문·시처럼 줄마다 끊어서 보여 줄 때
  "vocab": [ … ]                    // 선택. 이 본문의 단어 (단어 탭에 합쳐짐)
}
```

**`text`/`translation` 줄 규칙**

| 쓰는 법 | 의미 |
|---|---|
| 줄바꿈 1번 (`\n`) | 문장 구분. 화면에서는 이어서 한 문단으로 보임 |
| 빈 줄 (`\n\n`) | 문단 구분 |

- `text`와 `translation`의 **문단 수와 문단별 줄 수가 같으면** 문장 단위로 해석이 붙음 (문장 탭 → 그 문장 해석)
- 줄 수가 다른 문단은 문단 단위로 해석이 붙음. 어긋나도 오류는 아님
- 한 줄에 여러 문장을 써도 됨. 그러면 그 줄 전체가 탭 단위가 됨

### 서식 (모든 텍스트 필드 공통)

| 입력 | 결과 |
|---|---|
| `**굵게**` | **굵게** |
| `__밑줄__` | 밑줄 — 밑줄 친 부분 문제에 사용 |
| `==형광펜==` | 형광펜 |
| `*기울임*` | *기울임* |
| `\n` | 줄바꿈 (본문 `text`에서는 위 줄 규칙을 따름) |

빈칸 표시용 `_____`(밑줄 문자 여러 개)는 그대로 보임. ①②③ 같은 기호는 그냥 문자로 쓰면 됨. HTML은 쓸 수 없음.

### 단어 `vocab[]`

셋 중 편한 형식으로. 섞어 써도 됨.

```jsonc
["require", "필요로 하다"]
["require", "필요로 하다", "Big changes require big actions."]    // 세 번째 = 예문
{ "word": "require", "meaning": "필요로 하다", "example": "…" }
```

### 문제 `questions[]` — 공통 필드

```jsonc
{
  "id": "q1",              // 선택, 권장. 진행 기록의 기준. 없으면 순번이라 문제 순서를 바꾸면 기록이 섞임
  "type": "choice",        // 아래 6가지. 생략하면 필드 모양으로 추측
  "prompt": "다음 글의 요지로 가장 적절한 것은?",   // 발문
  "context": "문제에 딸린 지문/문장 (선택)",       // 회색 상자로 발문 아래 표시
  "passage": "p1",         // 선택. 📖 버튼으로 해당 본문을 띄워 봄. 파일에 본문이 하나뿐이면 자동 연결
  "explanation": "해설 (선택). 채점 후 표시"
}
```

### 문제 유형

#### `choice` — 객관식

```json
{
  "type": "choice",
  "prompt": "글의 요지로 가장 적절한 것은?",
  "choices": ["보기 1", "보기 2", "보기 3", "보기 4", "보기 5"],
  "answer": 3
}
```

- `answer`: **1부터 시작하는 번호**. `"③"`도 됨
- 정답이 여러 개면 `"answer": [1, 3]` → 자동으로 복수 선택, 전부 맞혀야 정답

#### `ox` — 참/거짓

```json
{ "type": "ox", "prompt": "The writer prefers intensity.", "answer": false }
```

`answer`: `true`/`false` (`"O"`, `"X"`도 됨)

#### `short` — 단답

```json
{
  "type": "short",
  "prompt": "밑줄 친 부분과 바꿔 쓸 수 있는 한 단어는?",
  "context": "… many people __give up__ too early.",
  "answer": ["quit", "stop"]
}
```

- `answer`: 문자열 하나 또는 인정 답안 배열
- 채점 시 대소문자, 앞뒤·중복 공백, 끝의 `.?!`, 곧은/굽은 따옴표 차이는 무시

#### `blank` — 빈칸 채우기

```json
{
  "type": "blank",
  "prompt": "빈칸을 채우시오.",
  "text": "The key is not {{intensity}} but {{consistency|consistence}}."
}
```

- `text` 안의 `{{정답}}`이 입력칸이 됨. 여러 개 가능, `|`로 복수 정답
- 입력칸 너비는 정답 길이에 맞춰짐
- 채점 규칙은 `short`와 같고, 모든 칸을 맞혀야 정답

#### `order` — 순서 배열 · 단어 배열

```json
{
  "type": "order",
  "prompt": "주어진 글 다음에 이어질 순서로 배열하시오.",
  "given": "Many people believe that big changes require big actions.",
  "items": ["(A) 첫 번째로 올 문단", "(B) 두 번째로 올 문단", "(C) 세 번째로 올 문단"]
}
```

```json
{
  "type": "order",
  "prompt": "우리말과 같은 뜻이 되도록 배열하시오.\n**핵심은 강도가 아니라 꾸준함이다.**",
  "items": ["The", "key", "is", "not", "intensity", "but", "consistency"]
}
```

- `items`는 **정답 순서대로** 적음. 화면에서는 섞여서 나옴
- `given`: 선택. 고정으로 먼저 보여 줄 글
- 항목이 모두 30자 이하면 단어 칩 모양, 아니면 문단 카드 모양으로 표시
- 시험지처럼 (A)(B)(C) 라벨을 붙여도 되지만 섞여서 나오므로 필요는 없음

#### `self` — 서술형 (자가채점)

```json
{
  "type": "self",
  "prompt": "글쓴이가 작은 습관이 중요하다고 말하는 이유를 우리말로 쓰시오.",
  "answer": "예시 답안",
  "explanation": "채점 기준 등 (선택)"
}
```

답을 쓰고 확인을 누르면 예시 답안이 나오고, ✕/✓로 직접 채점. `answer`는 배열로 여러 개 써도 됨.

### `type` 생략 시 추측 규칙

`choices` 있음 → `choice` · `answer`가 `true`/`false` → `ox` · `items` 있음 → `order` · `text`에 `{{ }}` 있음 → `blank` · 그 외 → `short`

---

## AI로 자료 만들 때

이 README의 **파일 형식** 부분과 `content/영어/예시.json`을 같이 주고 "이 형식의 JSON 파일 하나로 만들어 줘"라고 하면 됨.
받은 파일은 `content/` 아래에 두고 `node build.mjs`로 확인.

---

## 구조

| 파일 | 역할 |
|---|---|
| `index.html`, `assets/` | 사이트 본체 (`schema.js`는 형식 검사 규칙, 앱과 빌드가 같이 씀) |
| `build.mjs` | `content/` 검사 + 목록 파일 생성 |
| `serve.mjs` | 로컬 미리보기 서버 |
| `sw.js`, `manifest.webmanifest` | 오프라인 캐시, 홈 화면에 추가 |
| `.github/workflows/pages.yml` | push하면 자동 배포 |

사이트 이름은 `index.html`의 `<title>`과 `manifest.webmanifest`의 `name`에서 바꿈.

단축키 (PC): 문제 `1`–`9` 보기 선택, `O`/`X`, `Enter` 확인·다음 · 단어 `Space` 뒤집기, `←` 모름, `→` 앎 · 본문 창 `Esc` 닫기
