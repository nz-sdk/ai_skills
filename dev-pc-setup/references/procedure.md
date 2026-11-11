# 개발자 PC 초기 설정 — 상세 절차

`SKILL.md` 의 「빠진 것만 채우기」에서 해당 번호 절만 읽는다. 사람용 같은 내용은 아티팩트 「개발자 PC 초기 설정」이다.
주소는 공개 호스트명(`*.newzen.kr`)만 쓴다. IP · DB 계정 · 비밀번호 · 토큰 값은 이 문서와 대화 어디에도 적지 않는다.

- [부트스트랩 — 이 스킬을 처음 쓰기](#부트스트랩--이-스킬을-처음-쓰기)
- [0. 받아 둘 계정 · 권한](#0-받아-둘-계정--권한)
- [1. 기본 도구](#1-기본-도구)
- [2. GitHub 로그인과 토큰](#2-github-로그인과-토큰)
- [3. 저장소 · 작성자 · 의존성](#3-저장소--작성자--의존성)
- [4. Claude Code](#4-claude-code)
- [5. 커넥터](#5-커넥터)
- [6. 첫 세션 확인](#6-첫-세션-확인)
- [7. 팀 등록](#7-팀-등록)
- [옛 설정 정리](#옛-설정-정리)
- [완료 확인표](#완료-확인표)
- [문제 해결](#문제-해결)

---

## 부트스트랩 — 이 스킬을 처음 쓰기

스킬은 ai_skills 저장소(private)에 있으므로 GitHub 로그인이 먼저다. 새 PC 에서 이 스킬을 부르기 전에 사람이 아래를 한다.
1 · 2 · 4단계의 일부를 먼저 하는 셈이다. 스킬이 돌기 시작하면 그 항목은 점검에서 ok 로 나온다.

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
winget install --id Microsoft.VisualStudioCode -e --scope user
# 새 PowerShell 창에서
gh auth login --hostname github.com --git-protocol https --web
gh repo clone nz-sdk/ai_skills D:\work\ai_skills
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
New-Item -ItemType Junction -Path "$HOME\.claude\skills\dev-pc-setup" -Target "D:\work\ai_skills\dev-pc-setup"
code --install-extension anthropic.claude-code
```

- 스킬 하나만 junction 으로 건다. 이미 `~/.claude/skills` 에 다른 스킬이 있어도 건드리지 않는다. 관리자 권한은 필요 없다.
- VS Code 에서 Claude Code 에 팀 계정으로 로그인한 뒤 「개발자 PC 세팅 점검해줘」 또는 `/dev-pc-setup` 을 부른다.

---

## 0. 받아 둘 계정 · 권한

PC 에서 할 수 없는 일이다. 승인에 시간이 걸리니 먼저 요청하게 한다. 사용자에게 한 번에 묻는다.

| 무엇 | 누구에게 | 왜 |
|---|---|---|
| GitHub 계정 · `nz-sdk` 조직 초대 | 조직 관리자 | bridge-web · bridge-backoffice 쓰기와 DS-Bridge 패키지 읽기가 같이 필요하다. bridge-web 에만 초대되면 DS 패키지를 못 받는다 |
| claude.ai 팀 좌석 | 조직 관리자 | Claude Code · Claude Design · BridgeX 팀 커넥터가 이 계정에 묶인다 |
| Claude Design 프로젝트 공유 | 설계자 | 「브릿지X_프로덕트」(web) · 「브릿지X-백오피스」(backoffice) · 「DS-Bridge」 원천을 Claude 가 읽어야 한다 |
| Jira 계정 | Jira 관리자 | `newzensolution.atlassian.net` · EXP(bridge-web) · SNOG(bridge-backoffice) |
| bridge-auth 승인 · MCP 권한 | 백오피스 관리자 | 5단계에서 가입한 뒤 요청한다. 조회만 `mcp.read`, 배포까지 `mcp.write` |

---

## 1. 기본 도구

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
winget install --id OpenJS.NodeJS.22 -e
winget install --id Microsoft.VisualStudioCode -e --scope user
```

| 도구 | 이유 |
|---|---|
| Git for Windows | git 과 Git Bash. Claude Code 는 Git Bash 가 있으면 bash 로 명령을 돌린다(없으면 PowerShell). 팀 문서 · 스킬의 예시가 bash 기준이다 |
| GitHub CLI | 로그인 · PR · CI 확인 · DS Release 조회. Claude 도 이것으로 PR 을 연다 |
| Node.js 22 | 두 저장소의 CI(`node-version: 22`)와 lockfile 이 22 기준이다. bridge-web README 의 「Node 24」 문구보다 CI 를 따른다 |
| VS Code | 사용자 설치판(`--scope user`)은 자동 업데이트된다. zip 판은 업데이트되지 않는다. Claude Code 확장은 1.94 이상이 필요하다 |

확인은 **새 창**에서 한다: `git --version` · `gh --version` · `node -v`(v22.x) · `npm -v` · `code --version`.

- **`code` 가 PATH 에 없음:** 점검이 「at …\bin\code.cmd, but 'code' is not on PATH」로 낸다. zip 판이거나 설치 전에 연 셸이다.
  사용자 승인 뒤 그 `bin` 폴더를 사용자 PATH 에 더하거나, 사용자 설치판으로 다시 깔게 한다.
- **한글 깨짐:** 출력이 깨지면 `chcp 65001`.
- **python 스텁:** `python` 은 Windows 스토어 스텁이라 아무것도 하지 않고 성공처럼 끝난다. 이 작업에는 Python 이 필요 없다.

---

## 2. GitHub 로그인과 토큰

토큰은 용도별로 나눈다. DS 패키지는 GitHub Packages(npm)에 있고, 그 레지스트리는 fine-grained 토큰을 받지 않는다.

| 토큰 | 종류 | 권한 | 보관 | 쓰는 곳 |
|---|---|---|---|---|
| gh 로그인 | 브라우저 로그인(OAuth, `gho_`) | `repo` · `read:org` · `gist` | Windows 자격 증명 관리자(gh) | push · PR · CI · Release 조회 |
| DS 패키지 | classic PAT(`ghp_`) | `read:packages` 하나 | 사용자 환경변수 `NODE_AUTH_TOKEN` | `npm ci` 로 `@nz-sdk/ds-bridge` |

개발자가 만들 GitHub 토큰은 이 둘뿐이다. bridge-web 이슈와 Jira EXP 의 동기화(`issue-sync.yml`)는 저장소의 `GITHUB_TOKEN` 과
Owner 가 관리하는 Jira 규칙용 토큰 하나로 돈다. 예전 README 의 사람별 `ISSUE_TOKEN_<아이디>` 는 #116 이후 쓰지 않는다.

### 2-1. gh 브라우저 로그인 (사람)

사용자가 **별도 PowerShell 창**에서 실행한다. Claude 의 셸로 돌리면 기기 코드를 기다리며 멈춘다.

```powershell
gh auth login --hostname github.com --git-protocol https --web
```

1. 8자리 코드를 복사하고 Enter 로 브라우저를 연다.
2. 코드를 넣고 「GitHub CLI」 승인 화면에서 Authorize 한다.
   - 조직 목록에 `nz-sdk` 가 보이면 Grant 를 누른다. 권한이 없으면 Request 를 누른다.
3. 「Authenticate Git with your GitHub credentials?」에는 Y.

fine-grained PAT 를 붙여 넣는 로그인은 쓰지 않는다. `gh pr checks` 가 403 이고(`checks:read` 를 줄 수 없다) 패키지도 못 읽는다.

**gh 계정이 여럿일 때:** gh 는 호스트마다 계정을 여럿 들고, PR · push 는 **활성 계정**으로 한다.
- 7단계 대조표의 `people` 에 있는 계정, 그리고 본인으로 기록돼야 하는 계정을 활성으로 둔다: `gh auth switch -h github.com -u <계정>`.
- 쓰지 않는 fine-grained 계정은 지운다: `gh auth logout -h github.com -u <계정>`.
- 어느 계정으로 일할지는 사용자가 정한다. 회사 규칙(PR 작성자 표기 등)이 계정에 걸려 있을 수 있다.

### 2-2. git 이 gh 를 쓰게 (Claude, 승인 후)

```powershell
gh auth setup-git
```

Windows 기본 자격 증명 도우미(GCM)는 화면 없는 세션에서 인증 창을 띄운 채 멈출 수 있다. Claude Code 가 push 하다 멈추는 지점이다.

### 2-3. 권한 확인 (Claude)

```powershell
gh auth status
gh repo view nz-sdk/bridge-web --json viewerPermission -q .viewerPermission
gh repo view nz-sdk/bridge-backoffice --json viewerPermission -q .viewerPermission
```

- **기대값:** `Logged in to github.com account <아이디>`, 그리고 두 저장소 모두 `WRITE` · `MAINTAIN` · `ADMIN` 중 하나.
- **`Could not resolve to a Repository`:** 조직 초대를 수락하지 않았거나 그 저장소 권한이 없다. 0단계로 돌아간다.

### 2-4. DS 패키지 토큰 만들기 (사람)

1. github.com 오른쪽 위 프로필 사진 ▸ Settings ▸ 왼쪽 맨 아래 Developer settings
2. Personal access tokens ▸ Tokens (classic) ▸ Generate new token ▸ Generate new token (classic)
3. Note: `ds-bridge read · <PC 이름>`, Expiration: 90 days
4. Select scopes 에서 **`read:packages` 하나만** 체크한다. `repo` 를 비롯한 다른 칸은 비운다.
5. Generate token → 이 화면에서 한 번만 보이는 값을 복사한다.

fine-grained 토큰은 `E403 token does not match expected scopes` 가 난다. 반드시 classic 이다.

### 2-5. `NODE_AUTH_TOKEN` 등록 (사람)

Claude 는 창만 열어 줄 수 있다: `rundll32 sysdm.cpl,EditEnvironmentVariables`.

1. 위쪽 「<사용자>에 대한 사용자 변수」 ▸ 새로 만들기
2. 이름 `NODE_AUTH_TOKEN`, 값은 복사한 토큰 → 확인 → 확인
3. 열려 있는 PowerShell · VS Code 를 모두 닫고 다시 연다.

- **창으로 넣는 이유:** 명령으로 넣으면 PowerShell 기록에 토큰이 남는다.
- **저장소 쪽 연결:** 저장소에 커밋된 `.npmrc` 가 `@nz-sdk` 를 `https://npm.pkg.github.com` 으로 보내고, `${NODE_AUTH_TOKEN}` 을 읽는다.
- **토큰을 받으면 안 되는 곳:** 토큰을 `~/.npmrc` 에 적지 않는다(오히려 E401). 채팅 · 파일 · 커밋 · 스크린샷에도 남기지 않는다.
- **대안 (bridge-web README 방식):** gh 로그인 토큰을 쓴다. `gh auth refresh -h github.com -s read:packages` 뒤 창마다 `$env:NODE_AUTH_TOKEN = gh auth token`.
  gh 토큰은 권한이 넓으니 영구 환경변수로는 넣지 않는다.

---

## 3. 저장소 · 작성자 · 의존성

두 저장소는 서브모듈이 아니라 독립 repo 다. 아래는 모두 Claude 가 승인받은 뒤 한다.

```powershell
New-Item -ItemType Directory -Force D:\work\bridge | Out-Null   # 경로는 사용자에게 받은 값
cd D:\work\bridge
gh repo clone nz-sdk/bridge-web
gh repo clone nz-sdk/bridge-backoffice
```

이미 받아 둔 저장소는 최신화한다. main 이면 `git -C <저장소> pull --ff-only`, 작업 브랜치면 main 을 받아 브랜치를 맞춘다.
낡은 체크아웃의 README · 설정은 지금 방식과 다를 수 있다. 예를 들어 #116 이전 README 는 이미 없어진 사람별 이슈 토큰을 설명했다.
점검의 `<저장소> up to date` 행이 이것을 본다.

### 작성자 (저장소마다 local)

이름과 회사 메일은 AskUserQuestion 으로 묻는다.

```powershell
git -C D:\work\bridge\bridge-web        config user.name  "<본인 이름>"
git -C D:\work\bridge\bridge-web        config user.email "<아이디>@newzen.kr"
git -C D:\work\bridge\bridge-backoffice config user.name  "<본인 이름>"
git -C D:\work\bridge\bridge-backoffice config user.email "<아이디>@newzen.kr"
```

- 이 메일이 커밋 작성자이자 담당자 ID 다. 저장소 CLAUDE.md 가 커밋 · PR · 이슈를 쓸 때 이 값을 읽는다.
- PR 본문 첫 줄은 `Author: 이름 <이메일>` 이다.
- `--global` 은 쓰지 않는다.
- 커밋 · PR 에 Claude 표기(`Co-Authored-By` · 「Generated with」)를 넣지 않는 것이 팀 규칙이다.

### 의존성

이 세션이 토큰을 아직 못 보면, 같은 줄에서 사용자 환경변수를 읽어 넘긴다. 토큰 값은 출력되지 않는다.

```powershell
cd D:\work\bridge\bridge-web
$env:NODE_AUTH_TOKEN = [Environment]::GetEnvironmentVariable('NODE_AUTH_TOKEN','User'); npm view @nz-sdk/ds-bridge version; npm ci
```

- **기대값:** `npm view` 가 판 번호(예: `0.0.9`)를 낸다.
- **실패하면 (`E401`):** 토큰이 없거나 만료됐거나 `~/.npmrc` 와 충돌한다.
- **실패하면 (`E403`):** classic 이 아니거나 `read:packages` 가 없거나 DS-Bridge 패키지 권한이 없다. 권한은 DS-Bridge 관리자에게 받는다.
- **어디서 돌리나:** 레지스트리 연결이 저장소 `.npmrc` 에 있으므로 저장소 폴더 안에서만 확인된다.
- **`--omit=dev` 는 쓰지 않는다.** 검사 도구가 dev 의존성이다.

### 백오피스 `.env`

`.env.example` 을 복사하고 아래 **두 줄**로 맞춘다. 따옴표는 쓰지 않는다.

```properties
VITE_AUTH_ISSUER=https://bridge-auth.newzen.kr
VITE_API_BASE=https://bridge-api.newzen.kr
```

- 운영 bridge-auth · bridge-api 는 `http://localhost:5174` 에서 오는 요청을 허용한다. 그래서 dev 서버 포트가 5174 로 고정이고(strictPort), hosts 는 고치지 않는다.
- `VITE_REDIRECT_URI` 는 쓰지 않는다. 로그인이 `POST {VITE_AUTH_ISSUER}/bo/v1/login`(업무 계정 ID · 비밀번호)이고, `vite.config.ts` 는 위 두 값만 읽는다.
  `document/run/EC2-배포.md` §13 의 세 줄 예시는 OIDC 시절 것이다.
- bridge-web 은 `.env` 없이 뜬다. dev 서버가 `/api` 를 운영 bridge-api 로 넘긴다.
- ⚠ 개발 DB 와 운영 DB 가 나뉘어 있지 않다. 로컬 화면에서 저장 · 삭제하면 공유 DB 에 그대로 쓴다.

---

## 4. Claude Code

이 스킬이 돌고 있다면 이미 설치 · 로그인돼 있다. 점검만 한다.

- **설치:** VS Code 확장은 `code --install-extension anthropic.claude-code` 로 깐다(1.94 이상).
  - 터미널 CLI 는 선택이다: `irm https://claude.ai/install.ps1 | iex` → `claude --version` · `claude doctor`.
- **로그인:** 초대받은 회사 claude.ai 팀 계정으로 한다. 사용자가 `/status` 의 계정 행을 확인하고, 바꿀 때는 `/login`.
- **API 키 변수:** `ANTHROPIC_API_KEY` · `ANTHROPIC_AUTH_TOKEN` 이 있으면 Claude Code 가 그 키로 붙고 claude.ai 커넥터(BridgeX · Atlassian)를 가져오지 않는다.
  사용자 승인 뒤 지우고 VS Code 를 다시 시작한다.
- **MCP 타임아웃:** `MCP_TIMEOUT` · `MCP_TOOL_TIMEOUT`(120초)은 저장소 `.claude/settings.json` 에 이미 있다. 개인 설정은 `.claude/settings.local.json`.

---

## 5. 커넥터

BridgeX(서버 모듈 · API 정의 · DB 구조)와 Atlassian(Jira)은 claude.ai 에서 한 번 연결하면 claude.ai · Desktop · Claude Code 가 같이 쓴다.
claude_design 은 저장소 `.mcp.json` 으로 붙으니 여기서 할 일이 없다.

### 5-1. bridge-auth 계정 만들기 (사람 · 브라우저로 먼저)

- **방법 A · 회사 Google 계정**
  - `https://bridge-auth.newzen.kr/login` → Google 로 로그인한다.
  - 「승인을 기다리고 있습니다」가 나오면 정상이다. 계정이 비활성 · `mcp.read` 로 생겼다.
- **방법 B · 회사 메일**
  - `https://bridge-auth.newzen.kr/signup` 을 직접 연다. 로그인 화면에 링크가 없다.
  - `@newzen.kr` 메일을 넣으면 6자리 코드가 온다(10분 안에 넣는다).
  - ID 와 비밀번호(15자 이상, ID 를 넣을 수 없다)를 정하고 가입 신청한다.
- 첫 등록을 VS Code · Claude Code 연결 창에서 하지 않는다. 승인 대기 화면에서 멈춘다.

### 5-2. 승인 요청 (사람)

요청 문구 예: 「bridge-auth 에 ○○ 계정(Google ○○@○○ / 회사 메일 ID ○○)으로 가입했습니다. 활성화와 `mcp.read` · `mcp.write` 부탁드립니다.」
관리자는 백오피스 「사용자」에서 권한을 체크하고 활성화한다.

| 권한 | Claude 가 할 수 있는 것 | 누구에게 |
|---|---|---|
| `mcp.read` | 모듈 목록 · 상태 · 인터페이스 문서, 소스 검색 · 내보내기, DB 테이블 구조 | 조회만 하는 사람 |
| `mcp.write` | 위 + 인터페이스 정의, 배포 · 수정 · 롤백 · 삭제, SELECT 조회 | 서버 모듈을 배포하는 AX 개발자 |
| `mcp.admin` | 설정 쓰기 · 공유 라이브러리 · 디버그 | 수퍼관리자만 |

권한 변경은 다음 로그인부터 반영된다(이미 받은 access 는 최대 1시간 유효).

### 5-3. BridgeX 팀 커넥터 (사람)

1. claude.ai ▸ 설정 ▸ 커넥터 ▸ BridgeX ▸ 연결
2. bridge-auth 로그인 창이 뜨면 5-1 계정으로 로그인한다.
3. 상태가 「연결됨」이면 끝이다.

- **목록에 없을 때:** 조직 관리자가 등록한 팀 커넥터다(URL `https://bridge-api.newzen.kr/platform/mcp`). 목록에 없으면 조직 관리자에게 묻는다.
- **토큰 보관:** 토큰은 claude.ai 가 갖는다. access 는 1시간, refresh 는 7일이고 자동으로 회전한다. PC 에는 남지 않는다.
- **도구 이름:** Claude Code 에서는 `mcp__claude_ai_BridgeX__*` 로 보인다.
- **Desktop 에 안 보일 때:** 앱을 완전히 종료하고 다시 연다.

### 5-4. Atlassian MCP 커넥터 (사람)

Atlassian Rovo MCP **v2** 를 사용자 지정 커넥터로 붙인다. v1(`https://mcp.atlassian.com/v1/mcp`)은 지원 중단이고 2027-03-01 에 제거된다.

1. claude.ai ▸ 설정 ▸ 커넥터 ▸ **사용자 지정 커넥터 추가** — 이름 `Atlassian MCP` · URL `https://mcp.atlassian.com/v2/mcp`.
2. 연결 → Atlassian 로그인 → `newzensolution.atlassian.net` 접근을 허용한다.
3. 옛 `Atlassian` 커넥터(v1)가 있으면 지운다. 둘 다 있으면 같은 이름의 도구가 두 벌 보여 스킬이 어느 쪽을 부를지 정해지지 않는다.

- **도구 이름:** Claude Code 에서는 `mcp__claude_ai_Atlassian_MCP__*` 로 보인다. v2 는 자주 쓰는 도구만 바로 보이고, 나머지는 `discover` 로 찾아 `executeRead` · `executeWrite` 로 부른다.
- **「사용자 지정 커넥터 추가」 가 없을 때:** 팀 설정으로 막힌 것이다. 조직 관리자에게 묻는다.
- 이슈 등록 스킬(bridge-web `/report-issue`, bridge-backoffice `/브릿지X-백오피스:이슈등록`)이 이 커넥터를 쓴다. 스킬은 v2 도구만 쓰고, v1 만 붙어 있으면 Jira 쪽을 빼고 다시 연결하라고 알린다.

**커넥터 목록은 세션 시작 때 받는다.** 연결한 뒤에는 VS Code 창을 다시 불러오거나 새 세션을 열고, 이 스킬을 다시 부르게 한다.

---

## 6. 첫 세션 확인

bridge-web 에서 먼저, 이어서 bridge-backoffice 에서 한 번 더 한다.

1. `code D:\work\bridge\bridge-web` 처럼 **저장소 폴더를 루트로** 연다. 상위 폴더로 열면 저장소 CLAUDE.md 와 `.claude/launch.json` 이 잡히지 않는다.
2. 처음 열면 `.mcp.json` 서버를 승인하라고 묻는다(bridge-web: `claude_design` · `shadcn`, backoffice: `claude_design`). 사용자가 승인한다.
3. `/mcp` 에서 `claude_design` · `claude.ai BridgeX` · `claude.ai Atlassian MCP` 가 `✔ Connected` 인지 본다. 옛 `claude.ai Atlassian` 이 보이면 5-4 의 3 대로 지운다.
   - `⏸ Pending approval` 이면 아직 승인하지 않은 것이다.
   - `claude_design` 이 인증 오류면 사용자가 `/design-login` 을 한다.
4. Claude 가 읽기 도구로 확인한다. `protean_list_modules` 는 모듈 표, `atlassianUserInfo` 는 본인 계정이 나와야 한다.
   `npm ls @nz-sdk/ds-bridge` 와 `gh release view -R nz-sdk/DS-Bridge --json tagName -q .tagName` 이 같은지도 본다.
5. 검사 4종을 돌린다. CI 와 같다.

   ```powershell
   npm run typecheck
   npm run lint
   npm run lint:eslint
   npm run build
   ```

6. dev 서버는 `npm run dev` 다. web 은 `http://localhost:5173`, backoffice 는 `http://localhost:5174`(고정).
   - 백오피스 로그인은 업무 계정에 관리 등급(`mcp.manager` 이상)이 있어야 된다. 등급이 없으면 로그인 화면까지만 본다.
   - 80 포트로 띄워야 하면 `npx vite --port 80 --strictPort` 를 쓴다. `npm run dev -- --port 80` 은 npm 이 플래그를 먹는다.

---

## 7. 팀 등록

bridge-web · bridge-backoffice 의 `.github/github-jira-map.yml` 을 고친다. `people` 에 GitHub 아이디를 더하고, 맡을 `areas` 의 `developers` 에도 아이디를 넣는다.
이름 · 이메일은 넣지 않는다(스키마가 막는다). jiraAccountId 는 `atlassianUserInfo` 로 얻는다.

```yaml
people:
  <GitHub 아이디>:
    jiraAccountId: "<Jira accountId>"
    roles: [developer]
```

- 저장소 변경이므로 그 저장소의 브랜치 + PR 규칙을 따른다(예: `chore/jira-map-<아이디>`). 커밋 · push · PR 은 사용자 승인 뒤 한다.
- 대조표는 bridge-web 이슈와 Jira EXP 의 양방향 동기화(`issue-sync.yml`)와 이슈 등록 스킬이 보고자 · 담당을 찾을 때 읽는다. 개발자가 따로 만들 토큰은 없다.
- 활성 gh 계정이 `people` 에 없고 다른 계정이 있으면 먼저 어느 계정으로 일할지 정한다(2-1 「gh 계정이 여럿일 때」).
  그 계정이 맞다면 추가하고, 아니면 `gh auth switch` 로 바꾼다.

---

## 옛 설정 정리

점검 스크립트의 `old` 행이 가리키는 것이다. 초기 POC 때 쓰던 설정이고, 지금은 쓰지 않거나 헷갈림의 원인이다.

| 잔재 | 정리 | 누가 |
|---|---|---|
| hosts 의 `bridge*.newzen.biz` · `bridge*.newzen.kr` 줄 | `Start-Process notepad "$env:SystemRoot\System32\drivers\etc\hosts" -Verb RunAs` 로 연다(UAC 승인). 그 줄을 지우거나 `#` 으로 주석 처리하고 저장한 뒤 `ipconfig /flushdns` | 사람(관리자 권한) |
| 저장소 `.mcp.json` 의 직접 bridge 서버(mcp-remote · `bridge-mcp-agent`) | 그 항목을 지우는 PR. 저장소의 브랜치 + PR 규칙대로 하고 승인 후 진행 | Claude |
| 사용자 · 로컬 범위의 직접 bridge 서버 | `claude mcp remove <이름> -s user`. 로컬 범위면 그 프로젝트 폴더에서 `-s local` | 사람 또는 Claude(승인 후) |
| 백오피스 `.env` 의 `VITE_REDIRECT_URI` | 그 줄 삭제(읽는 곳이 없다) | Claude(승인 후) |
| gh 의 fine-grained 계정 | 쓰지 않으면 `gh auth logout -h github.com -u <계정>` | 사람 |

---

## 완료 확인표

| 항목 | 명령 · 행동 | 기대 결과 |
|---|---|---|
| 점검 스크립트 | `check.ps1 -Root <작업 폴더>` | missing 0 |
| gh 로그인 | `gh auth status` | `Logged in …`, oauth 토큰 |
| 저장소 권한 | `gh repo view nz-sdk/<repo> --json viewerPermission` | `WRITE` 이상 |
| DS 토큰 | 저장소 안 `npm view @nz-sdk/ds-bridge version` | 판 번호 |
| 작성자 | 저장소 안 `git config --get user.email` | 본인 회사 메일 |
| Claude 계정 | `/status` | 회사 팀 계정 |
| MCP | `/mcp` | claude_design · claude.ai BridgeX · claude.ai Atlassian MCP Connected (옛 claude.ai Atlassian 없음) |
| BridgeX | `protean_list_modules` | 모듈 표 |
| Jira | `atlassianUserInfo` | 본인 계정 |
| 검사 | typecheck · lint · lint:eslint · build | 모두 통과 |

---

## 문제 해결

| 증상 | 원인 | 조치 |
|---|---|---|
| `npm ci` · `npm view` E401 | 토큰 없음 · 옛 창 · `~/.npmrc` 충돌 · 만료 | 창 재시작 · `~/.npmrc` 의 `npm.pkg.github.com` 줄 삭제 · 토큰 재발급 |
| E403 `token does not match expected scopes` | fine-grained 이거나 `read:packages` 없음 | classic PAT · `read:packages` 로 다시 |
| E403 (scope 정상) | DS-Bridge 패키지 권한 없음(bridge-web 에만 초대) | DS-Bridge 관리자에게 패키지 권한 요청 |
| push 가 멈춤 · 인증 창 | GCM 이 창을 띄우고 기다림 | `gh auth setup-git`. 한 번만 우회: `git -c credential.https://github.com.helper='!gh auth git-credential' push -u origin <브랜치>` |
| `gh pr checks` 403 | gh 를 fine-grained PAT 로 로그인 | 브라우저 로그인으로 다시. 또는 `gh run list --branch <브랜치>` → `gh run watch <id> --exit-status` |
| `/mcp` 에 claude.ai BridgeX · Atlassian MCP 없음 | 미연결 · API 키 변수 · 팀 아닌 계정 · 세션이 연결 전에 시작됨 | claude.ai 에서 연결 · API 키 변수 삭제 후 `/login` · 창 다시 불러오기 |
| 이슈 등록 스킬이 「Atlassian MCP v1 — 다시 연결」 로 Jira 를 뺌 | 옛 `Atlassian` 커넥터(v1)만 연결됨 | 5-4 대로 v2 사용자 지정 커넥터 추가 · 옛 커넥터 삭제 · 창 다시 불러오기 |
| 「승인을 기다리고 있습니다」 | 관리자 승인 전 | 가입 방법과 계정을 알려 활성화 요청 |
| 배포 · SELECT 도구 권한 오류 | `mcp.write` 없음 | 관리자에게 요청 → 커넥터 재연결 |
| `claude_design` 인증 오류 | Claude Design 로그인 없음 · 만료 | `/design-login` |
| MCP `CONNECT_TIMEOUT` | 타임아웃 설정은 세션 시작 때만 읽힘 | 새 세션. 계속되면 `[Environment]::SetEnvironmentVariable('MCP_TIMEOUT','180000','User')` 후 VS Code 재시작 |
| 백오피스 CORS 오류 | 5174 가 아닌 포트 · `.env` 누락 | `npm run dev`(5174 고정) · `.env` 두 줄 |
| `code` 명령 없음 | zip 판 · PATH 미반영 | 사용자 설치판으로 다시 깔거나 `…\bin` 을 사용자 PATH 에 추가 |
| 한글 깨짐 | 콘솔 코드페이지 | `chcp 65001` |
