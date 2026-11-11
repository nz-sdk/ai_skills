# Jira 자동화 규칙 5개 — 템플릿 + 렌더 스크립트

새 상품마다 규칙 5개를 처음부터 만들지 않고, **값 파일 하나**로 가져오기용 JSON 5개를 만든다.

| 파일 | 용도 |
|---|---|
| `templates/*.template.json` (5개) | 규칙 5개의 공통 템플릿. 상품 값은 `<<값이름>>` 자리표시자(Jira 스마트 값 `{{ }}` 와 겹치지 않게 `<< >>`). 비밀값 없음 |
| `render-rules.mjs` | 값 파일을 검사하고 템플릿을 채워 JSON 5개를 만든다(Node 18+, 의존성 없음) |
| `values.example.json` | 값 파일 예시 — 복사해서 **저장소 밖**에서 채운다 |
| `maintainers/make-templates.mjs` | 유지보수용 — 규칙 구조가 바뀌었을 때 기준 상품의 내보내기에서 템플릿을 다시 만든다 |

## 쓰는 법
```
node render-rules.mjs --selftest                              # 스크립트·템플릿 자체 확인
node render-rules.mjs --values my-values.json --out ./out     # 5개 JSON 생성(모두 꺼짐)
```
그다음은 [adopt/02-설치-순서.md](../../adopt/02-설치-순서.md) 단계 1~2 — Jira 에 가져오고, PAT · Slack 주소를 화면에서 채운다.

## 원칙
- 렌더 결과에는 **PAT · Slack 주소 · 웹후크 암호가 없다**. 값 파일 · 출력 폴더도 저장소에 올리지 않는다.
- 결과는 항상 **꺼짐** 상태이고 범위는 `PROJECT_ID` 하나다.
- 값 이름 · 형식 · 얻는 방법은 [adopt/01-바꿀-값.md](../../adopt/01-바꿀-값.md) 2-0절.
