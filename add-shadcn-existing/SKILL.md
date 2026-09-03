---
name: add-shadcn-existing
description: >-
  이미 존재하는 React 프로젝트(Vite/Next.js/CRA 등)에 shadcn/ui를 추가·통합한다.
  "기존 프로젝트에 shadcn 붙여줘", "이 React 앱에 shadcn 설치", "shadcn 컴포넌트 추가"
  같은 요청에 사용. 프로젝트 구조 탐지(프레임워크·Tailwind 버전·TS/JS·기존 shadcn·git submodule)
  → 설치 위치/.mcp.json 배치 선택 → 정합성 보정 → init 또는 add → 점검까지 수행한다.
  빈 폴더에서 처음부터 만드는 경우는 scaffold-shadcn-app 스킬을 쓴다. 버전은 실행 시 최신 조회.
version: 0.1.0
license: AGPL-3.0-only
compatibility:
  agents:
    - claude
---

# add-shadcn-existing

이미 만들어진 React 프로젝트에 shadcn/ui를 추가한다. 빈 폴더 신규 생성은 `scaffold-shadcn-app`을 쓴다.

핵심 분리(꼭 기억):
- **shadcn 컴포넌트는 항상 frontend 패키지에 설치된다** (`components.json` · `src/components/ui`가 사는 곳). monorepo/submodule이어도 main 루트·backend엔 넣지 않는다.
- **선택 대상은 `.mcp.json` 위치**다. Claude Code는 *연 워크스페이스 루트*의 `.mcp.json`으로 MCP 서버를 띄우고, shadcn MCP의 프로젝트 인식(`components.json` 스캔)은 그 cwd에 묶인다 → 그래서 main/sub/both 선택이 의미가 있다.

## 0. 진행 원칙

- **버전**: 설치 직전 `npm view <pkg> version`으로 최신 조회 → 사용자에게 알린 뒤 설치.
- **역할 분담**: 컴포넌트 **탐색·계획은 MCP**, 실제 **파일 생성·설치는 npx**.
- **기존 환경을 깨지 않는다**: 덮어쓰기 전 항상 현재 설정(Tailwind/별칭/스타일)을 읽고, 충돌은 사용자에게 알린다.

## 1. 전제조건 점검

```bash
node -v && npm -v && npx -v
```

없거나 너무 낮으면 멈추고 안내(nvm 또는 nodejs.org).

## 2. 프로젝트 구조 탐지 (핵심)

읽기 전용으로 먼저 파악한 뒤 결과를 **사용자에게 보고**한다.

1. **monorepo / git submodule 여부**
   ```bash
   cat .gitmodules 2>/dev/null        # submodule 경로 목록
   ls -d */ 2>/dev/null               # 후보 디렉터리
   ```
   - submodule이 있으면 각 경로 확인 (예: `frontend/`, `backend/`).
2. **React 앱(=frontend) 위치** — `react` + 번들러가 있는 `package.json`을 찾는다.
   ```bash
   grep -lE '"react"' $(find . -maxdepth 3 -name package.json -not -path '*/node_modules/*')
   ```
3. **프레임워크 탐지** (해당 package.json의 deps):
   - `next` → **Next.js** (`shadcn init`이 자동 감지; 보통 `-t next` 불필요)
   - `vite` → **Vite** (`-t vite`)
   - `react-scripts` → **CRA** ⚠️ shadcn은 CRA 지원을 중단 → Vite 마이그레이션 권장(사용자에게 고지)
   - 그 외(Remix/Astro/TanStack 등) → shadcn 공식 프레임워크 옵션 확인 후 진행
4. **Tailwind 탐지**: 설치 여부 + **버전(v3 vs v4)**
   - v3: `tailwind.config.{js,ts}` + CSS에 `@tailwind base/components/utilities`
   - v4: CSS에 `@import "tailwindcss"` + `@tailwindcss/vite`(또는 postcss 플러그인)
   - shadcn 4.x는 **Tailwind v4** 기준. v3면 6단계에서 처리 방식을 선택.
5. **TS vs JS**: `tsconfig.json` 존재 여부 → `components.json`의 `tsx` 값 결정.
6. **기존 shadcn 여부**: `components.json` 있으면 **init 생략**, 바로 `add`로 간다. `-b`(base/radix)는 기존 `style`을 따른다.
7. **경로 별칭 탐지**: `@/` 별칭이 `vite.config`/`tsconfig`(Vite) 또는 `tsconfig`(Next)에 있는지.

**보고 예시**: "Vite + TS, Tailwind v4 설치됨, shadcn 미설치, git submodule 2개(frontend/backend) — 설치 대상은 `frontend/`."

## 3. 🔸 사용자 선택지 (AskUserQuestion)

탐지 결과를 바탕으로 확정한다:

1. **설치 대상 폴더** — frontend 후보가 여럿이거나 모호하면 선택하게 한다. (단일하면 확인만)
2. **`.mcp.json` 위치** — fullstack/submodule일 때 핵심:

   | 위치 | 언제 | 트레이드오프 |
   |---|---|---|
   | **frontend(sub)만** | frontend 서브모듈을 직접 열어 작업 | MCP cwd=frontend라 `components.json` 인식 **정확**. 같은 세션에서 backend는 못 봄. |
   | **main만** | 메인 레포를 열고 front/back을 한 세션에서 작업 | shadcn MCP의 프로젝트 인식이 main 기준이라 frontend `components.json`을 **못 찾을 수 있음** → MCP 조회는 frontend를 열거나 cwd를 맞춰야 함 |
   | **both (권장: 메인 통합 작업 시)** | 메인을 열든 frontend를 열든 동작 | 파일 2개 관리. **단, 메인을 연 세션에서 shadcn MCP의 프로젝트 인식은 여전히 frontend를 직접 열어야 정확** |

   > 정직한 권장: shadcn 작업을 할 때는 **frontend 패키지를 워크스페이스로 열어** MCP cwd가 거기 맞게 한다. 설치 명령은 항상 `cd <frontend>` 후 실행한다(아래 부록).
3. **(Tailwind v3인 경우)** v4로 업그레이드할지 / v3 호환으로 갈지.
4. **(기존 shadcn 없을 때)** 컴포넌트 라이브러리 `base`(@base-ui/react) vs `radix`(radix-ui).

## 4. shadcn MCP 등록 (선택한 위치에)

선택한 각 위치의 `.mcp.json`에 등록(없으면 생성, 있으면 `mcpServers`에 병합):

```json
{
  "mcpServers": {
    "shadcn": { "type": "stdio", "command": "npx", "args": ["shadcn@latest", "mcp"], "env": {} }
  }
}
```

MCP 변경은 Claude Code 재로딩이 필요할 수 있다. 등록 후 `get_project_registries`로 연결 확인.

## 5. 정합성 보정 (없는 것만 채운다)

탐지 결과에서 **빠진 선행 요건만** 추가한다. 이미 있으면 건드리지 않는다.

- **Tailwind 미설치/업그레이드**:
  - Vite: `npm install tailwindcss@latest @tailwindcss/vite@latest` + CSS 최상단 `@import "tailwindcss";` + `vite.config`에 `tailwindcss()` 플러그인.
  - Next.js: shadcn 공식 Next + Tailwind v4 안내를 따른다(PostCSS 플러그인 방식).
  - v3 유지 선택 시: 기존 v3 설정을 그대로 두고 shadcn init이 v3 경로로 동작하게 한다.
- **경로 별칭 미설정**:
  - Vite: `vite.config`(`resolve.alias '@'→src`) + `tsconfig`(`paths {"@/*":["./src/*"]}`).
    ⚠️ Vite react-ts 템플릿처럼 **project-references**면 `tsconfig.json` + `tsconfig.app.json` **양쪽**에 paths.
  - Next.js: `tsconfig.json`의 `paths`만 (별도 vite 설정 없음).

## 6. shadcn init 또는 add

- **`components.json` 없음 → init** (프레임워크에 맞게):
  ```bash
  cd <frontend>            # submodule/monorepo면 반드시 이동
  # Vite:
  npx shadcn@latest init -d -t vite -b <base|radix>
  # Next.js: (자동 감지)
  npx shadcn@latest init -d -b <base|radix>
  ```
  - 비대화 팁: 덮어쓰기 `-f`, 재생성 `--reinstall`, 전환 확인 프롬프트 `printf 'y\n' | npx shadcn ...`.
- **`components.json` 있음 → init 생략**, 바로 7단계. 기존 `style`(base/radix)·`baseColor`를 따른다.

## 7. 컴포넌트 추가 (MCP로 계획 → npx로 설치)

```text
1) search_items_in_registries / list_items_in_registries  → 탐색
2) view_items_in_registries / get_item_examples_from_registries → 파일·의존성·예제 확인
3) get_add_command_for_items([...]) → 설치 명령 생성
```

```bash
cd <frontend>        # 항상 frontend에서 실행
npx shadcn@latest add @shadcn/button @shadcn/input ...
```

→ `<frontend>/src/components/ui/*.{tsx,jsx}` 생성.

## 8. 설치 후 점검

MCP `get_audit_checklist`로 체크리스트 조회 후:

- [ ] import 형태 (named vs default)
- [ ] 모든 의존성 설치됨
- [ ] lint 경고/에러
- [ ] 타입 에러 (TS면)
- [ ] 브라우저 렌더링 (chrome-devtools MCP 활용 가능)

## 9. 검증

```bash
cd <frontend>
# 타입체크: 프로젝트 스크립트에 맞춰 (tsc -b / tsc --noEmit / next build 등)
npm run build
```

---

## 부록 — git submodule 작업 주의

- **항상 `cd <frontend>` 후** 패키지 설치·shadcn 명령 실행. main 루트에서 돌리면 엉뚱한 곳에 설치된다.
- **커밋 순서**: ① frontend(submodule) 안에서 변경 커밋 → ② main 레포에서 **submodule 포인터** 갱신 커밋. (frontend를 먼저 커밋하지 않으면 main이 가리키는 커밋이 없는 상태가 됨)
- `.mcp.json`을 어느 레포에 둘지에 따라 그 레포 git에 포함된다 — 두 곳에 두면 두 레포 각각 커밋 대상.
- 브랜치 전략(예: main=`next_new`, submodule=`next_new_<name>`)이 있으면 그 컨벤션을 따른다.

## 부록 — shadcn MCP 도구 / MCP vs npx

`scaffold-shadcn-app` 스킬의 부록 A·B와 동일(MCP 7종, 조회=MCP·변경=npx). 거기 참조.
