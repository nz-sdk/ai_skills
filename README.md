# ai_skills

개발용 AI 스킬

## 스킬 목록

| 영문명 | 한글명 | 작성AI | 설명 |
| --- | --- | --- | --- |
| [nz_amoeba_make](nz_amoeba_make/) | 프로틴 샘플 생성기 | Claude | Protean 설정을 안내에 따라 고르면 실행 가능한 Spring Boot 샘플 서버를 생성한다 |
| [scaffold-shadcn-app](scaffold-shadcn-app/) | shadcn 신규 스캐폴드 | Claude | Vite+React+TS+Tailwind v4+shadcn/ui 신규 프로젝트를 처음부터 스캐폴딩한다 |
| [create-frontend](create-frontend/) | 프론트 표준 기반 세팅 | Claude | 스캐폴드 위에 표준 프론트엔드 기반(i18n·폰트·통신 SDK·공유 번들)을 올린다 |
| [appcontext-architecture](appcontext-architecture/) | 셸↔앱 계약 세우기 | Claude | 셸↔앱 계약(AppContext 근간)을 세운다 — create-frontend 다음 단계 |
| [add-shadcn-existing](add-shadcn-existing/) | 기존 프로젝트 shadcn 추가 | Claude | 이미 있는 React 프로젝트에 shadcn/ui 를 추가·통합한다 |

## 스킬 아티팩트

| 스킬 영문명 | 아티팩트 |
| --- | --- |
| nz_amoeba_make | [Amoeba Maker 선택 지도](https://claude.ai/code/artifact/6fe78fca-2674-4bcf-a76f-866bb81fe074?org=dbcf19a7-9d52-448d-b3cd-0945742ba48e) |

## 스킬 설정

Claude Code 는 정해진 경로에서만 스킬을 찾는다 — `~/.claude/skills/`(개인),
`.claude/skills/`(프로젝트), 플러그인의 `skills/`. 경로를 바꾸는 설정은 없고,
`permissions.additionalDirectories` 는 파일 접근만 열어줄 뿐 스킬을 읽지 않는다.

대신 이 저장소를 프로젝트의 `.claude/skills` 에 링크하면 저장소가 그대로 스킬
디렉토리가 된다. 저장소 구조(`<스킬명>/SKILL.md`)가 스킬 디렉토리 형식과 같아서
그대로 인식되고, 스킬을 추가해도 링크를 다시 만들 필요가 없다.

기존 `.claude/skills` 에 내용이 있으면 먼저 옮겨 둔다.

### Windows (PowerShell)

junction 은 관리자 권한이 필요 없다. (`mklink /D` 심볼릭 링크는 필요하다.)

```powershell
$repo    = "D:\path\to\ai_skills"   # 이 저장소
$project = "D:\path\to\my-project"  # 스킬을 쓸 프로젝트

Move-Item "$project\.claude\skills" "$project\.claude\skills.bak"  # 기존 폴더가 있을 때만
New-Item -ItemType Junction -Path "$project\.claude\skills" -Target $repo
```

### macOS / Linux

```bash
repo="$HOME/src/ai_skills"      # 이 저장소
project="$HOME/src/my-project"  # 스킬을 쓸 프로젝트

mv "$project/.claude/skills" "$project/.claude/skills.bak"  # 기존 폴더가 있을 때만
ln -s "$repo" "$project/.claude/skills"
```

### 확인

세션 시작 시점에 없던 최상위 스킬 디렉토리는 감시 대상으로 잡히지 않으므로, 링크한 뒤
Claude Code 를 재시작한다. `/skills` 목록에 나오면 정상이다.

모든 프로젝트에서 쓰려면 `$project\.claude\skills` 대신 `~/.claude/skills` 를 대상으로
같은 명령을 쓴다.
