---
name: dev-pc-setup
description: 'AX 개발자 PC 초기 설정을 점검하고 빠진 것만 채운다 — bridge-web · bridge-backoffice 를 Claude Code 로 개발할 수 있는 Windows PC 를 만든다. 도구(Git · gh · Node 22 · VS Code), GitHub 로그인과 토큰(gh 브라우저 로그인 · DS 패키지용 classic PAT NODE_AUTH_TOKEN), 저장소 clone · 작성자 · npm ci · 백오피스 .env, Claude Code 로그인, 커넥터(bridge-auth 가입 · BridgeX · Atlassian · claude_design), 첫 세션 확인, Jira 대조표 등록, 옛 POC 설정 정리까지 다룬다. "개발자 PC 세팅", "PC 초기 설정", "신규 입사자 개발 환경", "온보딩", "새 노트북 세팅", "개발 환경 점검해줘" 같은 요청뿐 아니라, npm ci 가 @nz-sdk/ds-bridge 에서 E401 · E403 일 때, /mcp 에 BridgeX 나 Atlassian 이 안 보일 때, gh 로그인 · GitHub 토큰 · NODE_AUTH_TOKEN 설정을 물을 때도 이 스킬을 쓴다. 점검 스크립트는 읽기만 하고 비밀값을 출력하지 않는다.'
license: AGPL-3.0-only
compatibility:
  agents:
    - claude
metadata:
  version: 0.1.1
---

# dev-pc-setup — 개발자 PC 초기 설정

AX 개발 프로세스에서 개발자는 bridge-web · bridge-backoffice 화면을 Claude Code 로 만들고, 서버 모듈은 BridgeX MCP
로 배포한다. 이 스킬은 그 일을 할 수 있는 PC 를 만든다.

1. 점검한다.
2. 빠진 것만 순서대로 채운다.
3. 끝난 것과 남은 일(사람 몫)을 보고한다.

- 사람이 읽는 같은 절차서는 아티팩트 「개발자 PC 초기 설정」(https://claude.ai/artifact/1tDQtkD5Pn6rKYn5XcbL6n)이다. 공유받은 사람만 열린다.
- 단계별 명령 · 화면 경로 · 문제 해결은 [references/procedure.md](references/procedure.md) 에 있다. 채우는 단계에서 해당 번호 절을 읽는다.

## 범위

- **대상:** AX 개발자(화면 개발). JDK 와 bridge-api · bridge-auth 로컬 실행은 범위 밖이다. 서버 호스트를 고치는 사람만 필요하다.
- **환경:** Windows 10 · 11, Windows PowerShell 5.1. 다른 OS 면 `scripts/check.ps1` 을 돌리지 않고, procedure.md 의 순서와 확인 기준을 손으로 따른다.
- **전제:** 이 스킬이 돌고 있다면 Claude Code 는 이미 설치 · 로그인돼 있다. 스킬을 처음 받는 방법은 procedure.md 「부트스트랩」이다.

## 지킬 것과 그 이유

1. **비밀값을 보지도 옮기지도 않는다.** 대화 · 로그 · 셸 기록에 한 번 남은 토큰은 회수할 수 없다.
   - 토큰은 사용자가 GitHub 화면에서 만들고 Windows 「환경 변수」 창에 직접 넣는다.
   - Claude 는 토큰 값을 묻지 않는다. 출력하는 명령(`echo $env:NODE_AUTH_TOKEN` 등)도 쓰지 않는다.
   - 사용자가 대화에 토큰을 붙여 넣었으면 쓰지 않고, 그 토큰을 GitHub 에서 삭제하고 새로 만들라고 안내한다.
   - 확인은 존재 여부, 접두사로 본 종류, `npm view` 결과로만 한다.
2. **브라우저 · 대화형 로그인은 사람이 한다.**
   - `gh auth login --web` 은 기기 코드 입력을 기다리며 멈춘다. Claude 의 셸로 돌리지 말고, 사용자가 별도 PowerShell 창에서 실행하게 한다.
   - bridge-auth 가입, claude.ai 커넥터 연결, `/design-login` 도 사람 몫이다.
3. **PC 를 바꾸는 명령은 먼저 보여 주고 승인받는다.** winget 설치 · clone · `git config` · `npm ci` · `.env` 쓰기 · PATH 변경이 해당한다.
   - 같은 단계의 명령은 묶어서 한 번에 보여 줘도 된다.
4. **된 것은 다시 하지 않는다.** 점검이 `ok` 인 항목은 건너뛴다. 이 스킬은 여러 번 불러도 같은 상태로 수렴해야 한다.
   - 사람을 기다리는 일(계정 승인, 커넥터 연결 뒤 새 세션)이 생기면 거기서 멈추고 남은 일을 보고한다.
   - 다시 부르면 점검부터 이어 간다.
5. **전역을 바꾸지 않는다.**
   - 작성자는 저장소 local `git config` 에 넣는다. `--global` 은 다른 프로젝트까지 바꾼다.
   - DS 토큰은 사용자 환경변수에 넣는다. `~/.npmrc` 에 넣으면 프로젝트 `.npmrc` 가 같은 키를 덮어써 E401 이 난다.
6. **공유 서버에 쓰지 않는다.**
   - 연결 확인은 읽기 도구(`protean_list_modules`, `atlassianUserInfo`)로만 한다.
   - 배포 · SQL 조회 · 시험 행 쓰기는 이 스킬의 일이 아니다. 개발 DB 와 운영 DB 가 나뉘어 있지 않다.

## 모드

요청에 따라 둘 중 하나로 돈다.

- **점검만** — 「점검해줘」, 「확인만」, 「결과만 보여줘」처럼 바꾸지 말라는 요청이다.
  - 1) 점검과 보고만 하고 끝낸다. 아무것도 설치하거나 쓰지 않는다.
  - 검사 4종도 돌리지 않는다. `build` 는 `dist/` 를, `tsc -b` 는 빌드 정보 파일을 쓴다.
- **설정** — 「세팅해줘」, 「채워줘」, 또는 의도가 분명하지 않을 때다. 점검 → 보고 → 사용자 확인 → 2) 채우기 → 3) 마무리 보고 순서로 간다.

## 1) 점검

### 스크립트 (1 · 2 · 3 · 4 · 7단계와 옛 설정)

스크립트는 스킬이 로드될 때 알려 주는 base directory 아래 `scripts/check.ps1` 이다. 읽기만 한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<base directory>\scripts\check.ps1" -Root "<작업 폴더>"
```

- `-Root` 는 두 저장소를 clone 해 둔(또는 clone 할) 상위 폴더다.
  - 스크립트는 그 폴더와 모든 상위 폴더에서 저장소를 찾는다. 저장소 안 어디서 돌려도 된다.
  - 모르면 현재 폴더로 먼저 돌린다. `work folder` 가 missing 이면 어디에 clone 할지 AskUserQuestion 으로 묻는다(예시 기본값 `D:\work\bridge`).
- `-Offline` 은 네트워크 확인(`gh repo view` · `gh release view` · `npm view`)을 뺀다. `-Json` 은 JSON 으로 낸다.
- 출력 열: `Step`(1–4 · 7 · `old` = 옛 POC 설정 잔재), `Status`, `Item`, `Detail`.
  - `ok`: 됨.
  - `warn`: 동작은 하지만 고칠 것.
  - `missing`: 절차를 막는다.
  - `info`: 선택 사항이거나 참고.

### Claude 가 직접 보는 것

| 항목 | 보는 법 |
|---|---|
| 세션 루트 · claude_design | 먼저 현재 작업 폴더가 bridge-web 또는 bridge-backoffice 저장소 루트인지 본다.<br>아니면 claude_design 은 반드시 안 보인다. 저장소 `.mcp.json` 의 프로젝트 MCP 이기 때문이다. 이때는 「세션 루트」 한 행으로만 보고하고 claude_design 은 따로 세지 않는다.<br>루트가 맞을 때만 도구 목록(지연 로드 목록 포함)에 `mcp__claude_design__*` 가 있는지 따로 판정한다 |
| BridgeX | 도구 목록에 `mcp__claude_ai_BridgeX__*` 가 있는지 본다. 지연 도구면 ToolSearch 로 스키마를 먼저 불러온다.<br>있으면 `protean_list_modules` 를 불러 모듈 표가 오는지 본다.<br>다른 BridgeX 도구 중 `protean_list_runtimes` 는 늘 스키마 오류를 내므로 연결 판단에 쓰지 않는다 |
| Atlassian | `mcp__claude_ai_Atlassian__*` 가 있으면 `atlassianUserInfo` 로 본인 계정이 나오는지 본다 |
| 7단계 대조표 | 스크립트가 활성 gh 계정이 `people` 에 있는지 본다.<br>Claude 는 그 계정 줄의 `jiraAccountId` 가 `atlassianUserInfo` 의 accountId 와 같은지 본다.<br>gh 계정이 여럿이고 대조표에 다른 계정이 있으면, 어느 계정으로 일할지 사용자 결정 항목으로 올린다. PR 은 활성 gh 계정으로 열린다 |
| 0단계 계정 | 이미 확인된 것은 묻지 않는다.<br>· 조직 초대: 저장소 권한 ok 면 확인된 것이다.<br>· claude.ai 팀 좌석: BridgeX 팀 커넥터가 보이면 확인된 것이다.<br>· Jira: `atlassianUserInfo` 가 되면 확인된 것이다.<br>· bridge-auth 승인: `protean_list_modules` 가 되면 확인된 것이다.<br>남은 것(주로 Claude Design 공유)만 한 번에 묻는다 |
| 6단계 검사 | 점검 단계에서는 돌리지 않고 「안 돌림」으로 적는다. 설정 모드의 6단계에서 돌린다 |

### 보고 형식

모든 항목을 보여 준다. 사용자가 전체 상태를 봐야 무엇을 할지 고를 수 있다.

- 상태 기호는 `ok` ✓, `warn` ⚠, `missing` ✗, `info` –, 확인할 수 없음 ? 로 쓴다.
- ✓ 인 항목은 단계마다 한 행으로 묶어도 된다. ⚠ · ✗ · ? 는 한 항목에 한 행이다.
- 원인이 같은 항목은 한 행으로 합친다. 예를 들어 세션 루트가 틀려 claude_design 이 안 보이는 경우다.

```markdown
## 개발자 PC 점검 결과
(점검만 했다 / 아래를 채우려 한다 — 무엇을 바꿨는지 한 줄)

| 단계 | 항목 | 상태 | 다음 할 일 | 누가 |
|---|---|---|---|---|
| 1 | git · gh · node v22 · npm · winget · Git Bash | ✓ | — | — |
| 1 | VS Code 가 PATH 에 없음 | ⚠ | `…\bin` 을 사용자 PATH 에 추가 | Claude(승인 후) |
| 3 | bridge-web npm ci | ✗ 옛 설치 | `npm ci` | Claude(승인 후) |
| 6 | 세션 루트 | ⚠ | 저장소 루트로 새 창 열기 | 사람 |
| … | | | | |

남은 일 n개 · 사람 몫 m개 · 사용자 결정 k개
```

마지막 줄은 모드마다 다르다.

- **점검만:** 「채우려면 "빠진 것 채워줘"라고 하면 <첫 단계>부터 명령을 보여 드리고 승인받아 진행합니다.」
- **설정:** 「<첫 단계>부터 진행할까요?」라고 묻고, 사용자 결정 항목이 있으면 AskUserQuestion 으로 함께 묻는다.

## 2) 빠진 것만 순서대로 채우기 (설정 모드)

뒤 단계가 앞 단계에 기대므로 번호 순서대로 간다. `npm ci` 는 토큰이 있어야 하고, 커넥터는 bridge-auth 승인이 있어야 된다.
각 단계의 명령 · 화면 경로 · 실패 원인은 procedure.md 의 같은 번호 절을 읽고 따른다.

| 단계 | Claude 가 하는 일 | 사람이 하는 일 | 통과 기준 |
|---|---|---|---|
| 0 계정 · 권한 | 남은 것만 요청 문구로 정리 | 조직 관리자 · 설계자 · Jira 관리자에게 요청 | 사용자 확인 |
| 1 도구 | winget 설치, 필요하면 VS Code `bin` 을 사용자 PATH 에 추가(모두 승인 후) | — | node v22.x, VS Code 1.94 이상 · `code` 가 PATH 에 있음. 사용자 설치판은 권장(info) |
| 2 GitHub | `gh auth setup-git` 실행, 토큰 화면 경로 안내, 환경 변수 창 열기(`rundll32 sysdm.cpl,EditEnvironmentVariables`) | 별도 창에서 `gh auth login … --web`, classic PAT 만들기, `NODE_AUTH_TOKEN` 입력. gh 계정이 여럿이면 쓸 계정 고르기(`gh auth switch -u <계정>`) | 활성 gh 계정이 oauth, `npm view` 가 판 번호 |
| 3 저장소 | clone 또는 최신화(main 이면 `git pull --ff-only`), local `git config`, `npm ci`, 백오피스 `.env` 두 줄(모두 승인 후) | 이름 · 회사 메일 답하기(AskUserQuestion) | 3단계 모두 ok |
| 4 Claude Code | API 키 변수가 있는지 확인 | `/status` 로 팀 계정 확인 | API key variables ok |
| 5 커넥터 | 가입 → 승인 요청 → 연결 순서와 요청 문구 안내 | bridge-auth 가입, 관리자 승인 요청, claude.ai 에서 BridgeX · Atlassian 연결 | 새 세션에서 도구가 보임 |
| 6 첫 세션 | `/mcp` 안내, `protean_list_modules` · `atlassianUserInfo` 호출, 검사 4종 실행 | 저장소 루트로 새 창 열기, 프로젝트 MCP 승인, 필요하면 `/design-login` | 모두 통과 |
| 7 팀 등록 | `github-jira-map.yml` 의 `people` 추가 PR. 그 저장소의 브랜치 + PR 규칙을 따르고 승인 후 진행 | 쓸 GitHub 계정 결정 | 활성 gh 계정이 `people` 에 있고 accountId 가 맞음 |
| old 정리 | 지울 줄 · 명령 안내, 저장소 파일은 승인 후 수정 | hosts 수정(관리자 권한) | `old` 행 모두 ok |

검사 4종은 저장소 폴더 안에서 `npm run typecheck` · `npm run lint` · `npm run lint:eslint` · `npm run build` 다(CI 와 같다).

### 지금 세션에서 바뀐 환경 쓰기

winget 설치나 환경변수 등록은 **새로 시작한 프로세스에만** 보인다. 이 세션의 셸은 옛 값을 들고 있고, 셸 변수는 호출 사이에 이어지지 않는다.

이어서 확인하려면 명령마다 같은 줄에서 사용자 · 시스템 값을 다시 읽는다. 토큰 값은 이렇게 하면 출력 없이 넘어간다.

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$env:NODE_AUTH_TOKEN = [Environment]::GetEnvironmentVariable('NODE_AUTH_TOKEN','User')
npm ci
```

그래도 사용자가 쓸 터미널과 VS Code 는 다시 열어야 한다고 알린다.

커넥터 목록은 Claude Code 세션이 시작할 때 받는다. claude.ai 에서 커넥터를 연결한 뒤에는 VS Code 창을 다시 불러오거나(Developer: Reload Window) 새 세션을 열게 한다. 그 뒤 이 스킬을 다시 부르면 남은 단계부터 이어진다고 안내한다.

## 3) 마무리 보고 (설정 모드)

```markdown
## 개발자 PC 설정 결과
- 끝난 것: (단계 · 항목)
- 남은 일 — 사람 몫: (누구에게 · 무엇을 · 요청 문구)
- 다시 확인하려면: 이 스킬을 다시 부르면 점검부터 이어 간다
- 다음: 첫 화면 작업은 「적용해. 설계서의 API 는 bridge mcp 로 만들고 연결해. 디자인: <링크> 설계서: <링크>」
```

## 하지 않는 것

초기 POC 메모와 옛 문서에는 있지만 지금은 필요 없거나 막혀 있는 설정이다. 점검 스크립트의 `old` 행이 앞의 셋을 본다. 남아 있으면 정리를 안내한다(procedure.md 「옛 설정 정리」).

- hosts 파일의 `bridge*.newzen.biz|kr` 줄. 지금은 공개 주소 `*.newzen.kr` 을 DNS 로 쓴다.
- mcp-remote 로 bridge 에 직접 붙는 MCP 서버. 저장소 `.mcp.json` 이나 사용자 · 로컬 범위에 있을 수 있고, BridgeX 팀 커넥터가 대신한다.
- 백오피스 `.env` 의 `VITE_REDIRECT_URI`. 로그인이 `POST /bo/v1/login` 이라 쓰지 않는다.
- `claude mcp add --transport http` 로 BridgeX 추가. 그 방식의 콜백 주소가 bridge-auth 에 없어 400 이다.
- 로컬 스크립트(`deploy.mjs`)로 `/platform` 호출. 토큰은 claude.ai 가 갖고 있어 401 이다.
- gh 에 fine-grained PAT 로 로그인. `gh pr checks` 가 403 이고 패키지를 못 읽는다.
- bridge-web · bridge-backoffice 의 `.claude\skills` 에 ai_skills 를 junction 으로 걸기. 그 폴더에 이슈 등록 스킬이 있다.

## 참고 파일

- [references/procedure.md](references/procedure.md): 단계별 상세 절차, 토큰 표, 옛 설정 정리, 완료 확인표, 문제 해결, 부트스트랩.
- [scripts/check.ps1](scripts/check.ps1): 읽기 전용 점검. ASCII 로만 쓴다. PowerShell 5.1 은 BOM 없는 UTF-8 을 잘못 읽는다.
