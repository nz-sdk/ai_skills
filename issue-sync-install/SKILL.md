---
name: issue-sync-install
description: GitHub ↔ Jira 양방향 동기화(+Claude 스킬 · Slack)를 새 상품에 설치한다. 키트의 설치 문서(adopt/02)를 단계 1~7 순서대로 진행하며, Claude 가 할 수 있는 일(값 수집 · 값 파일 · 규칙 JSON 렌더 · 파일 복사·치환 · PR · 점검 시험)은 직접 하고, 못 하는 일(Jira 규칙 가져오기 · 켜기 · PAT 발급 · Secret 값 · Slack 앱)은 사용자에게 한 번에 하나씩 요청한다. 값은 도구 결과 · 사용자 답 · 파일에서만 얻고 추측하지 않는다. 「이슈 동기화 설치」 「GitHub Jira 연동 설치」 「issue-sync 설치」 「새 상품에 Jira 연동 붙여줘」 「issue-sync-install」 에 쓴다.
license: AGPL-3.0-only
compatibility: Claude Code — AskUserQuestion · Atlassian MCP · gh · Node 18+ 사용
argument-hint: "[상품 저장소 폴더 경로] (생략하면 묻는다)"
metadata:
  version: 0.0.0
  copyright: Copyright (c) 2026 Newzen
  author:
    name: "yangyang12103@newzen.kr"
  compatibility:
    agents: [claude]
  requirements:
    tools: [gh, node, npx, git]
    runtime: [node]
    mcp: [atlassian]
  tags: [jira, github, issue-sync, install]
---

# 이슈 동기화 설치 — 새 상품에 GitHub ↔ Jira 붙이기

키트(이 스킬 폴더 — `SKILL.md` 옆의 `README.md` · `adopt/` · `files/`)의 설치 문서 **`adopt/02-설치-순서.md` 단계 1~7**을 대신 진행한다.
이 스킬은 문서를 복사한 것이 아니라 **진행 규칙**이다. 값 · 명령 · 칸 이름의 정본은 키트 문서(`adopt/00~04`)와 스크립트(`files/`)다.

> 지금 판은 기준 상품 한 쌍(GitHub 저장소 1 ↔ Jira 스페이스 1)에서만 확인했다. **범용 스킬로 바꿀 예정**이다 — 남은 일은 [README 「범용 스킬 예정」](README.md#범용-스킬-예정). 그 전까지 다른 구성은 1-5 대로 「미검증」을 알리고 사용자 결정을 받는다.

---

## 0. 원칙 — 하나라도 어기면 멈춘다

**정본**: 이 스킬과 키트 문서가 어긋나면 **문서가 정본**이다. 어긋난 곳을 사용자에게 알리고 멈춘다(어느 쪽이 맞는지 짐작하지 않는다).

| # | 규칙 |
|---|---|
| R1 | **값은 도구 결과 · 사용자 답 · 파일에서만** 얻는다. 얻을 수 없으면 **사용자에게 묻는다.** |
| R2 | 아래는 **절대 짐작하지 않는다**: 스페이스 · 프로젝트 id · 업무 유형 이름과 id · 필드 id · 전환(상태) 이름 · accountId · cloudId · 저장소 이름 · 규칙 접두사 · 화면 폴더 묶음. 「보통 이럴 것이다」로 채우지 않는다. |
| R3 | 도구 결과가 **둘 이상이거나 하나도 없으면** 고르지 않고 사용자에게 묻는다(`AskUserQuestion`, 한국어, 선택지마다 무엇이 바뀌는지 한 줄). |
| R4 | 오류는 **원문 그대로** 보고한다. `adopt/04-문제해결.md` 표에 같은 증상이 있으면 그 조치만 하고, 없으면 **멈추고 묻는다**(원인을 추정해 고치지 않는다). |
| R5 | **비밀값**(PAT · Slack 웹후크 주소 · 웹후크 암호)은 요구하지 않고, 출력하지 않고, 파일에 쓰지 않고, 커밋하지 않는다. 사용자가 채팅에 붙여 넣었다면 쓰지 말고 「화면에 직접 넣으세요」라고 안내한다. |
| R6 | **확인하지 못한 것은 확인하지 못했다고 말한다.** 완료 표시는 **직접 확인한 뒤에만** 한다. 사용자의 「했어요」만으로는 확인할 수 있는 것을 확인 없이 넘기지 않는다. |
| R7 | **승인 게이트**(5절)는 하기 **전에** 묻는다. 승인 없이 하지 않는다. |
| R8 | 사용자에게 요청은 **한 번에 하나**. 답이 올 때까지 다음 단계로 가지 않는다. |
| R9 | 키트 파일은 **고치지 않는다**(복사본 · 값 파일만 만든다). 값 파일 · 렌더 출력은 **상품 저장소 밖** 임시 폴더에 둔다. |
| R10 | 진행 안내와 보고는 **한국어**. 단계마다 한 줄 안내. |
| R11 | **운영과 분리된 환경**(복사본 저장소 · 별도 스페이스)에서 먼저 한다. 사용자가 운영 저장소 · 운영 스페이스를 대상이라고 하면 이유를 묻고 `adopt/00-결정-체크.md` 4절을 읽어 준 뒤 사용자 결정을 받는다. |

**Claude 가 못 하는 것**(요청으로 넘긴다): Jira 자동화 규칙의 가져오기 · 켜기 · 편집(Atlassian 도구에 기능이 없다) · 규칙 감사 로그 조회 · 이슈 삭제 · PAT 발급 · Slack 앱 추가 · GitHub Secret 값 입력.

---

## 1. 시작 — 사전 점검

### 1-1. 키트 위치
**키트 폴더 = 이 `SKILL.md` 가 있는 폴더**다(스킬을 부를 때 알려 주는 기본 폴더 경로). 그 경로를 사용자에게 보이기만 하고, 경로를 알 수 없을 때만 묻는다. **상품 저장소 폴더 경로**는 묻는다(인자로 받았으면 확인만).
다음이 **모두 있어야** 한다 — 하나라도 없으면 멈추고 알린다:
`<키트>/adopt/02-설치-순서.md` · `<키트>/files/tools/install-files.mjs` · `<키트>/files/jira-rules/render-rules.mjs` · `<키트>/files/jira-rules/templates/`(템플릿 5개)

### 1-2. 문서 읽기
`<키트>/adopt/00-결정-체크.md` · `01-바꿀-값.md` · `02-설치-순서.md` · `03-점검표.md` · `04-문제해결.md` 를 **전부 읽는다**(Read). 읽지 않은 문서의 내용으로 진행하지 않는다.

### 1-3. 환경 점검 (명령 · 도구 그대로)
| 점검 | 방법 | 실패하면 |
|---|---|---|
| Node 18+ | `node -v` | 멈추고 설치 요청 |
| GitHub 로그인 | `gh auth status` | 사용자에게 `gh auth login` 요청 |
| Atlassian 연결 | `atlassianUserInfo` 호출 | 사용자에게 claude.ai ▸ Connectors ▸ Atlassian 재연결 요청(`write:jira-work` 범위) |
| 상품 저장소 | `git -C <상품 저장소> rev-parse --show-toplevel` · `git -C <상품 저장소> status --short` | 작업 트리가 깨끗하지 않으면 **멈추고 사용자에게 알린다**(섞지 않는다) |
| 원격 | `git -C <상품 저장소> remote -v` | 결과를 사용자에게 보이고 **어느 원격이 설치 대상인지** 묻는다(짐작 금지) |

### 1-4. 사용자에게 묻는 값 (한 번에 모아 `AskUserQuestion`)
- `REPO`(`소유자/이름`) — 답을 받으면 `gh repo view <REPO> --json viewerPermission,visibility,defaultBranchRef` 로 **존재 · 권한(ADMIN 또는 WRITE 이상) · 기본 브랜치**를 확인한다. 못 찾거나 권한이 없으면 멈춘다.
- 이 저장소가 **운영과 분리된 환경**인가(R11).
- `SPACE`(Jira 스페이스 키) · `SITE`(Jira 사이트, `https://` 없이) · `PREFIX`(규칙 이름 접두사, 예 `[AB]`) · `PRODUCT_NAME`(스킬 별칭 폴더 이름).
- Slack 알림을 쓰는가(쓰면 단계 2 에서 사용자가 화면에 직접 넣는다).
- **팀원**(`PEOPLE`): GitHub 아이디 · Jira 이름(또는 이메일 — 파일에는 쓰지 않는다) · 역할(`designer` · `developer` · `planner` · `product-designer`). GitHub 계정이 없는 사람은 `JIRA_ONLY`.
- **화면 영역**(`AREAS`): `ls <상품 저장소>/src/screens`(있으면)의 폴더 목록을 보여 주고 **영역 이름 · 폴더 묶음 · 영역별 designers/developers 는 사용자가 정한다.** 폴더가 없으면 사용자에게 「영역 1개, 화면 없음」으로 할지 묻는다.

### 1-5. 설치 전제 판정 (`00-결정-체크.md` 2절 · 5절)
- 에픽 수: `searchJiraIssuesUsingJql(jql="project = <SPACE> AND hierarchyLevel = 1", maxResults=1)`. **0건이면 멈추고** `01-바꿀-값.md` 0-3절의 선택지(ⓐ 기본 에픽 1개를 만든다 · ⓑ 에픽을 선택 사항으로 고친다)를 사용자에게 묻는다. ⓐ 를 고르면 에픽 생성은 5절 승인 대상이다(이름은 사용자가 정한다).
- 요금제 자동화 한도 · 같은 Jira 사이트가 아닌 구성 · 저장소/스페이스 N 구성은 **미검증**이다 — 해당하면 사용자에게 그대로 알리고 계속할지 묻는다.

---

## 2. 값 수집 — 도구 · 인자 · 막힐 때

모든 호출의 `cloudId` 는 아래 CLOUD_ID 로 얻은 값이다. 결과를 **그대로** 값 파일에 옮긴다.
결과 칸 이름(실제 응답 기준): `getVisibleJiraProjects` → `values[].key · id` / `getJiraProjectIssueTypesMetadata` → `issueTypes[].id · name · untranslatedName · hierarchyLevel` / `getTransitionsForJiraIssue` → `transitions[].to.name · to.statusCategory.key` / `searchJiraIssuesUsingJql` → `issues.nodes[].key` / `getJiraIssueTypeMetaWithFields` → `fields[].name · fieldId` / `atlassianUserInfo` → `account_id · name` / `lookupJiraAccountId` → `data.users.users[].accountId · displayName`. 응답에 이 칸이 없으면 **짐작하지 말고** 응답을 사용자에게 보이고 멈춘다.

| 값 | 얻는 방법 | 못 얻거나 둘 이상이면 |
|---|---|---|
| `CLOUD_ID` | `getAccessibleAtlassianResources`(인자 없음) → 배열 항목 중 `url`(`https://<호스트>`)의 호스트가 `SITE` 와 같은 것의 `id` | 일치가 0 · 2건 이상이면 사용자에게 묻는다 |
| `PROJECT_ID` | `getVisibleJiraProjects(cloudId, action="view", searchString=<SPACE>)` → `key == SPACE` 인 항목의 `id` | `key` 가 정확히 같은 항목이 1건이 아니면 묻는다 |
| 업무 유형 id · 이름 | `getJiraProjectIssueTypesMetadata(cloudId, projectIdOrKey=<SPACE>)` → `issueTypes[]` 의 `id` · `name` · `untranslatedName` · `hierarchyLevel` | 아래 두 줄 |
| ↳ Bug · Task | `untranslatedName` 이 `Bug` · `Task` 이고 `hierarchyLevel == 0` 인 유형의 `id` · `name` (→ `ISSUE_TYPE_ID_BUG` · `JIRA_TYPE_BUG` · `ISSUE_TYPE_ID_TASK`, `ISSUE_TYPES.Bug/Task`) | 없거나 여럿이면 목록(레벨 0)을 보이고 사용자가 고른다 |
| ↳ Feature | **짐작하지 않는다.** 레벨 0 유형 목록과 「작업으로 대체」를 선택지로 사용자가 고른다. 대체하면 `ISSUE_TYPE_ID_FEATURE` · `JIRA_TYPE_FEATURE` · `ISSUE_TYPES.Feature` 는 **작업과 같은 id · 이름**(`adopt/01` 0-2절) | — |
| `DEFAULT_TYPE` | 사용자가 고른 기본 유형(보통 작업과 같은 이름) — 선택지로 묻는다 | — |
| `START_DATE_FIELD` | `getJiraIssueTypeMetaWithFields(cloudId, projectIdOrKey=<SPACE>, issueTypeId=<작업 id>, **requiredFieldsOnly=false**, maxResults=100)` → `fields[]` 중 `name` 이 「시작 날짜」 또는 「Start date」 인 것의 `fieldId`. 🔴 **`requiredFieldsOnly=false` 를 빼면 필수 필드만 와서 시작 날짜가 나오지 않는다**(기본값이 true) — 빠뜨리고 「없다」고 판정하지 않는다 | **없으면 빈 글자**로 두고 사용자에게 알린다(렌더가 그 줄을 뺀다). 둘 이상이면 묻는다 |
| `TRANSITION_DONE` · `TRANSITION_REOPEN` | 그 스페이스의 일반 업무 1건(`searchJiraIssuesUsingJql("project = <SPACE> AND hierarchyLevel = 0 ORDER BY created ASC", maxResults=1)`)에 `getTransitionsForJiraIssue` → `to.statusCategory.key == "done"` 인 전환의 `to.name` = DONE, `== "new"` 인 전환의 `to.name` = REOPEN | **업무가 없거나 해당 전환이 1개가 아니면 사용자에게 상태 이름을 묻는다.** 이름을 지어내지 않는다. 시험용 업무를 만들려면 5절 승인 |
| `OWNER_ACCOUNT_ID` | `atlassianUserInfo` 결과의 **`account_id`** 칸 — 그리고 사용자에게 결과의 `name` 을 보이며 「이 계정이 규칙을 가져오는 본인입니까」 확인. `email` 등 다른 칸은 파일에 쓰지 않는다 | 확인 못 받으면 쓰지 않는다 |
| `ACTOR_ACCOUNT_ID` | 사용자가 알려 준 **기존 규칙 내보내기 파일**에서 한 칸만: `node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(j.rules[0].actor.value)" "<파일 경로>"` — **파일 전체를 출력하지 않는다**(Slack 주소가 들어 있다) | 파일이 없으면 사용자에게 「같은 사이트의 규칙을 하나 내보내 경로를 알려 달라」고 요청 |
| `PEOPLE[].accountId` | `lookupJiraAccountId(cloudId, searchString=<이름 또는 이메일>)` → 결과 `data.users.users[]` 의 `accountId` · `displayName`. `displayName` 을 사용자에게 보이고 **본인이 맞다는 확인**을 받은 뒤 `accountId` 를 쓴다 | `data.users.total` 이 1이 아니면 묻는다. 결과의 `html`(이메일 포함)과 이메일은 파일에 쓰지 않는다 |
| `SLACK_WEBHOOK_URL` | **받지 않는다.** 값 파일에서는 비운다(R5) | — |

---

## 3. 단계 — `adopt/02-설치-순서.md` 와 같은 번호

각 단계는 **A 한다 · B 요청한다 · C 확인한다 · D 넘어가는 조건** 순서다.

### 단계 1. Jira 규칙 5개 (켜지 않는다)
**A**
1. 임시 작업 폴더를 만든다(상품 저장소 **밖**, 예: OS 임시 폴더 아래 새 폴더). 경로를 사용자에게 알린다.
2. 2절 값으로 **`rules-values.json`** 을 쓴다 — 형식은 `<키트>/files/jira-rules/values.example.json`(`_설명` 칸은 빼도 된다). `SLACK_WEBHOOK_URL` 은 `""`.
3. 렌더: `node <키트>/files/jira-rules/render-rules.mjs --values <작업폴더>/rules-values.json --out <작업폴더>/rules-out`
   - 성공 조건: 종료 코드 0 · 출력에 `규칙 5개를 만들었다` · `웹 요청 합계 7곳 (기대: 7)`. 아니면 **오류 원문**을 보이고, 스크립트가 적은 이유(값 이름 · 형식)대로 값 파일을 고쳐 다시 실행한다(값 형식은 `adopt/01` 2-0절 · 1-0절). 이유가 값 파일 오류로 설명되지 않으면 멈추고 묻는다(R4).
4. `ls <작업폴더>/rules-out` 로 파일 5개를 확인한다.

**B**(한 번에 하나)
1. 「Jira ▸ `<SPACE>` 스페이스 설정 ▸ 자동화 ▸ 오른쪽 위 `…` ▸ 규칙(또는 흐름) 가져오기 에서 `<작업폴더>/rules-out` 의 5개 파일을 하나씩 가져와 주세요. 가져온 뒤 5개가 모두 **꺼짐**인지 보고 알려 주세요.」(메뉴가 없으면 「전역 관리」 화면 · 그래도 없으면 전역 자동화 관리자 권한이 필요하다고 알린다.)
2. 이어서 「`github-to-jira` 규칙(Jira 이름 `<PREFIX> Github -> Jira Issue`)의 맨 위 「수신 웹후크」에서 웹후크 URL 과 암호를 복사해 두세요. **이 대화에는 붙여 넣지 마세요.**」

**C** — Claude 는 규칙을 조회할 수 없다. `03-점검표.md` 의 「가져온 직후 점검」 항목(이름 · 꺼짐 · 범위 · 「허용」 끔)을 **하나씩 사용자에게 묻는다.** 사용자가 목록 캡처를 주면 이름 · 상태를 캡처로 확인하고, 캡처로 알 수 없는 것은 「확인하지 못했다」고 기록한다.
**D** — 5개 모두 꺼짐 · 접두사 일치 · 「허용」 끔이 확인될 때.

### 단계 2. 토큰 · Slack
**A** — PAT 설정값을 그대로 안내한다: Fine-grained · Resource owner = 저장소 소유 조직 · Repository access = **`<REPO>` 하나** · Permissions = **Actions: Read and write 하나만** · 만료 1년 안. 조직 승인이 필요할 수 있다(`adopt/02` 단계 2).
**B**(순서대로 하나씩)
1. 「위 설정으로 PAT 를 만드세요. 값은 한 번만 보입니다. **대화에 붙여 넣지 마세요.**」 (+ 조직 승인 대기면 Pending requests 승인)
2. Slack 을 쓰면 「Slack ▸ Incoming Webhooks 앱을 추가하고 알림 채널을 고른 뒤 웹후크 URL 을 복사해 두세요.」
3. 「Jira 에서 `github-to-jira` 규칙의 웹 요청 3곳 + 나머지 4개 규칙의 웹 요청 1곳씩, **모두 7곳의 `Authorization` 헤더** 값을 `Bearer <PAT>`(숨김)로 채우세요. URL 이 `https://api.github.com/repos/<REPO>/actions/workflows/issue-sync.yml/dispatches` 인지도 봐 주세요.」
   요청 문장을 보이기 **전에 그림을 화면에 띄운다**: PowerShell 로 `Invoke-Item "<키트>/adopt/images/authorization-header.png"` 를 실행해 사용자 PC 의 기본 이미지 뷰어로 연다(macOS 는 `open`, Linux 는 `xdg-open`). 이어서 같은 파일을 Read 도구로도 읽어 대화 화면에 그림이 보이게 한다. 둘 다 실패하면 파일 경로를 글로 알리고 사용자가 직접 열게 한다. 그림 설명: 「웹 요청 전송」 동작 → 오른쪽 설정 창 「머리글」의 `Authorization` 줄(빨간 상자) → 값 칸에 붙여 넣고 「숨김」 체크. 그림은 예시이며 저장소 · 스페이스 이름은 가려져 있다. 7곳이라 그림은 **처음 한 번만** 띄운다.
4. Slack 사용 시: 「`github-to-jira` 규칙의 슬랙 동작 2곳(등록 경로 If 블록 · edit 분기 B)에 같은 웹후크 URL 을 붙여 넣으세요. 동작 이름이 「웹후크를 통해 Slack 메시지 보내기」인지 확인해 주세요.」 미사용 시: 가짜 주소가 그대로 남고 틀린 상위 에픽 키 알림이 가지 않는다고 알린다.

**C** — Claude 가 **확인할 수 없다**(Jira 화면 · 비밀값). 사용자 답만 기록하고 `확인하지 못함(사용자 답)` 으로 표시한다.
**D** — 7곳 Authorization · Slack 처리가 사용자 답으로 끝났을 때.

### 단계 3. GitHub Secret
**A** — 이름을 안내한다: `JIRA_<SPACE>_WEBHOOK_URL` · `JIRA_<SPACE>_WEBHOOK_TOKEN` (대소문자 · 밑줄까지 그대로). 값은 단계 1 의 B-2 에서 복사해 둔 URL · 암호다(암호를 URL 에 붙이지 않는다).
**B** — 「본인 터미널에서 실행하세요(값은 프롬프트에 붙여 넣기 · 이 대화에는 쓰지 않기): `gh secret set JIRA_<SPACE>_WEBHOOK_URL -R <REPO>` 그리고 `gh secret set JIRA_<SPACE>_WEBHOOK_TOKEN -R <REPO>`」 — Repository secrets(Environment · Organization 아님).
**C** — `gh secret list -R <REPO>` 에 **두 이름이 있는지** 본다. 값은 볼 수 없다 — 「이름만 확인했다」고 보고한다.
**D** — 두 이름이 목록에 있을 때.

### 단계 4. GitHub 파일 → PR → 머지
**A**
1. 상품 저장소의 `CONTRIBUTING.md` · `CLAUDE.md` 를 읽어 **브랜치 · 커밋 · PR 규칙**을 확인한다. 없으면 사용자에게 묻는다(짐작 금지). 작업 브랜치는 기본 브랜치(1-4 에서 확인한 값)의 최신에서 만든다 — **만들기 전에 5절 승인**.
2. 2절 값 + 1-4 답으로 **`install-values.json`** 을 쓴다 — 형식은 `<키트>/files/tools/install-values.example.json`. `PREFIX` · `SPACE` 는 `rules-values.json` 과 같아야 한다(다르면 멈춘다). `AUTHOR`(스킬 머리말의 작성자 ID)는 `git -C <상품 저장소> config user.email` 결과를 사용자에게 보이고 **확인받은 뒤** 넣는다 — 값이 없거나 확인을 못 받으면 비워 둔다(스킬 머리말에 `<담당자 ID>` 가 남는다). `ISSUE_TYPES` · `DEFAULT_TYPE` · `START_DATE_FIELD` 는 2절 결과.
3. 미리보기: `node <키트>/files/tools/install-files.mjs --values <작업폴더>/install-values.json --target <상품 저장소> --dry` — 쓸 파일 목록과 `⚠ 이미 있음` 을 사용자에게 보인다. **이미 있는 파일이 있으면 멈추고** 덮어쓸지 사용자가 정한다(`--force` 는 사용자 승인 뒤에만).
4. 실행: 같은 명령에서 `--dry` 를 뺀다. 성공 조건: `파일 11개 작성`. 아니면 오류 원문 보고(R4).
5. **`ci.yml` 단계 추가**(스크립트가 하지 않는다): 원문은 `<키트>/files/github/ci-check-map.snippet.yml`. 상품 `ci.yml` 을 읽고 `actions/checkout` · `setup-node`(및 의존성 설치) **뒤**에 넣을 위치를 정해 **diff 로 사용자에게 보이고 확인**받는다. 그 단계들이 없으면 짐작하지 말고 묻는다.
6. 대조표 검사: `npx --yes yaml@2.6.1 --json --single < .github/github-jira-map.yml > <작업폴더>/map.json && npx --yes ajv-cli@5.0.0 validate --spec=draft7 -s .github/github-jira-map.schema.json -d <작업폴더>/map.json` → 출력에 `valid`. 아니면 오류 원문 보고.
   - **맞물림 검사**: `node <키트>/files/tools/verify-install.mjs --target <상품 저장소> --rules-out <작업폴더>/rules-out --repo <REPO> --deep` — 종료 코드 0 · 출력 마지막의 `실패 0`. 실패 항목(`✗ [C…]`)이 있으면 **원문 그대로** 사용자에게 보이고, 어긋난 파일(워크플로 · 대조표 · 규칙 값 파일)을 고쳐 다시 렌더·설치한다(R4). 참고(`ℹ`) 항목 중 「기능 블록 조건이 대조표와 다르다」는 「기능」 유형이 없는 스페이스에서는 의도한 구성이므로 그대로 두되 사용자에게 알린다. 이 검사가 **볼 수 없는 것**(스페이스의 실제 유형 id · 전환 이름 · 필드 id, PAT · Secret 값)은 통과로 쓰지 않고 「확인하지 못함」으로 기록한다.
7. 「화면 구현 멈춤」 흐름: 상품에 `CLAUDE.md 「Jira 티켓 작업」` · 적용 감사 · DS 요청 문서가 **있는지** 확인한다. 없으면 `adopt/01` 1-3 · 4절대로 `screen_blocked.yml` 삭제와 스킬 정리를 **사용자에게 제안하고 승인받은 뒤** 한다.
8. 누락 검사: `adopt/01-바꿀-값.md` 의 「기준 값」(파일에 남은 기준 상품 글자) 목록으로 `grep -rnE` 를 `.github` `.claude` 에서 돌린다. 남은 줄은 `adopt/02` 단계 4 의 「0건은 불가능하다 — 아래만 남아야 하고 …」 목록과 **하나씩 대조**하고, 목록에 없는 줄은 사용자에게 보인다.
9. 비밀값 검사: 변경 파일에서 `grep -rnE "github_pat_|ghp_|hooks\.slack\.com/services/"` 가 **0건**이어야 한다.
10. 커밋 · push · PR — **5절 승인** 후, 1 에서 확인한 상품 규칙대로. 커밋 · PR 에 Claude 서명 · 모델명 · 비밀값을 넣지 않는다(상품 규칙이 다르게 정하면 상품 규칙을 따른다).
11. CI: `gh pr checks <번호> -R <REPO>` 를 8~10초 간격으로 최대 30회 조회한다. 성공 전에는 머지를 제안하지 않는다.

**B** — 머지: 「CI 가 통과했습니다. `<PR 주소>` 를 머지해도 될까요?」(승인 게이트). 승인이 없으면 하지 않는다.
**C** — 머지 뒤: `gh api repos/<REPO>/contents/.github/workflows --jq '.[].name'` 에 `issue-sync.yml` 이 있다 · `gh api repos/<REPO>/hooks --jq 'length'` 가 `0` (0 이 아니면 `gh api repos/<REPO>/hooks --jq '.[] | {id, active, events}'` 를 보이고 멈춘다 — 사본이 2건 생길 수 있다).
**D** — 위 두 확인이 통과했을 때.

### 단계 5. Jira 규칙 켜기
**A** — `03-점검표.md` 「가져온 직후 점검」을 다시 한 번 읽어 준다.
**B** — 「Jira 에서 `<PREFIX>` 규칙 5개를 **모두** 켜세요(단계 4 가 끝난 뒤에만). `github-to-jira` 규칙의 수신 웹후크 설정이 바뀌지 않았는지 봐 주세요.」
**C** — 확인할 수 없다(Jira 화면). 사용자 답을 기록하고, 켠 뒤의 실제 확인은 단계 7 의 S1 로 한다.
**D** — 사용자가 켰다고 답했을 때.

### 단계 6. Claude 스킬
**A** — 상품 저장소에 `.claude/skills/report-issue/SKILL.md` 와 `.claude/commands/<PRODUCT_NAME>/이슈등록.md` 가 있는지 확인한다(단계 4 에서 들어간다). 파일 위치만 확인하고 **동작은 시험하지 않았다고 보고**한다.
**B** — 「각자 PC 에서 `gh auth login`(저장소 쓰기 권한) · claude.ai ▸ Connectors ▸ Atlassian 연결(`write:jira-work`) 을 하고, **저장소 폴더에서 Claude Code 를 새로 연 뒤** `/<PRODUCT_NAME>:이슈등록` 이 보이는지 확인하세요.」
**C** — 명령이 보이는지는 사용자 답으로 기록한다(Claude 는 다른 세션을 볼 수 없다).
**D** — 사용자 답.

### 단계 7. 점검 · 정리 (`03-점검표.md` S0~S9)
**먼저**: 시험 이슈를 만들어도 되는 **저장소 · 스페이스**가 맞는지 사용자 승인을 받는다(5절). 시험에 쓸 **실존 에픽 키**는 사용자에게 받거나 1-5 에서 만든 것이다.

**S0~S9 는 `03-점검표.md` 의 「기대 결과」를 판정 기준으로 한다.** 실행 방법(짐작 없이):
| # | 실행 | 확인 |
|---|---|---|
| S0 | 단계 4 의 결과(맞물림 검사 실패 0 · 치환 누락 · 스키마 `valid` · CI · `main` 에 파일 · 저장소 웹훅 0)를 표로 모은다 | 이미 확인한 값 |
| S1 | 상품의 `.github/ISSUE_TEMPLATE/task.yml` 을 **읽고** 그 `title` 접두사와 각 입력의 `label` 을 그대로 `### <label>` 제목으로 써서 본문 파일을 만든 뒤 `gh issue create -R <REPO> --title "<접두사> [시험] S1" --body-file <파일>` | `gh run list -R <REPO> --workflow issue-sync.yml` 가 success · Jira `searchJiraIssuesUsingJql("labels = \"gh-<저장소 이름>-<번호>\"")` 1건 · 상위 · 레이블 · GitHub 본문 끝 `<!-- jira:키 -->` |
| S2 | `createJiraIssue`(`projectKey=<SPACE>`, `issueTypeName=<작업 유형 이름>`, `parent=<에픽 키>`) | GitHub 에 `[JIRA <키>] …` 1건 · 라벨 `jira` |
| S3 | S1 의 GitHub 이슈 제목만 `gh issue edit` | 같은 레이블의 Jira 이슈가 여전히 1건 |
| S4 | GitHub 제목 · 본문 고침 / Jira `editJiraIssue` 로 요약 고침 | 양쪽 반영 · 새 `workflow_dispatch` 가 되돌아오지 않음 |
| S5 | `gh issue comment` / `addCommentToJiraIssue` | 반대쪽에 1건씩 · 반복 없음 |
| S6 | `gh issue close` → Jira 상태 · `gh issue reopen` → Jira 상태 · Jira `transitionJiraIssue`(2절에서 얻은 전환 id) → GitHub 상태 | 양방향 |
| S7 | `gh issue edit --add-assignee` / `editJiraIssue` 로 담당 해제 | 대조표에 있는 사람만 반영 |
| S8 | 없는 에픽 키(`<SPACE>-999999`)로 S1 과 같은 방식 | Jira 사본 없음. **Slack 전달은 확인할 수 없다** — 사용자에게 `github-to-jira` 규칙 감사 로그를 붙여 달라고 요청하고, Slack 을 안 썼다면 「미확인」으로 기록 |
| S9 | 에픽 1건 생성(승인) | GitHub 사본이 없음 |

- 기다림은 **조회를 8~10초 간격으로 최대 30회** 반복한다. 시간이 지나도 안 되면 `04` 의 A~C 표와 F 절차를 따른다(R4). 지연(`수행한 작업 없음` · `진행 중`)이면 규칙을 고치지 말고 알린다.
- 판정은 **합격 · 불합격 · 확인하지 못함**만 쓴다. 근거(조회 결과)를 한 줄씩 붙인다.
- **정리**: 시험 GitHub 이슈는 닫는다(삭제 아님). **Jira 이슈 삭제는 사용자 몫**이다(도구가 없다) — 사용자에게 「`<키 목록>` 을 삭제하거나 완료로 두세요」라고 요청한다. 시험용 에픽 · 규칙 · 토큰 · Secret 의 처분(끄기/삭제)은 사용자가 정한다.

---

## 4. 막힐 때
1. 오류 · 증상 원문을 보인다(R4).
2. `adopt/04-문제해결.md` 의 A~F 표에서 **같은 증상**을 찾는다. 있으면 그 칸의 조치만 한다(조치가 사용자 화면 작업이면 요청으로 넘긴다).
3. 없으면 **멈추고** 사용자에게 알린다. 원인을 추정해 규칙 · 파일 · 값을 바꾸지 않는다.

---

## 5. 승인 게이트 — 하기 **전에** 묻는다
- 작업 브랜치 만들기 · 커밋 · push · PR 만들기 · **PR 머지**
- `install-files.mjs --force` (이미 있는 파일 덮어쓰기)
- 상품 저장소의 원격 주소 변경 · 다른 브랜치로 전환
- Jira 스페이스에 **쓰기**: 에픽 · 시험 업무 만들기 · 수정 · 전환 · 댓글 (대상 스페이스가 사용자가 정한 것인지 함께 확인)
- GitHub 저장소에 **시험 이슈** 만들기 · 닫기
- `screen_blocked.yml` 삭제 · 스킬 정리

## 6. 단계마다 보고 (한국어, 3줄)
1. **한 일** — 실행한 명령 · 도구 · 만든 파일(경로).
2. **확인한 것** — 직접 확인한 결과(조회 값 · 종료 코드).
3. **확인하지 못한 것 · 사용자 할 일** — 없으면 「없음」.

## 7. 하지 않는 것
- 값 · 이름 · 유형 · 전환 · 필드 · 계정 id 를 **짐작해 채우기**
- 사용자 답 없이 단계 건너뛰기, 「했어요」 확인 없이 다음 단계 진행
- 비밀값을 받거나 쓰거나 출력하기 — 규칙 내보내기 파일 **전체 출력**도 포함
- Jira 자동화 규칙 · 이슈 삭제를 도구 우회로 시도하기
- 키트 파일 수정, 운영 환경에서의 시험(사용자 결정 없이)
