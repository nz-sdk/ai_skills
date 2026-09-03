---
name: scaffold-shadcn-app
description: >-
  Vite + React + TypeScript + Tailwind v4 + shadcn/ui 신규 프로젝트를 처음부터 스캐폴딩한다.
  빈/신규 프로젝트에서 "shadcn 프로젝트 만들어줘", "Vite React shadcn 셋업", "프론트엔드 환경 잡아줘"
  같은 요청에 사용. 전제조건 점검 → 프로젝트 생성 → shadcn MCP 등록 → Tailwind/별칭 → (base vs radix
  선택) → init → 컴포넌트 추가 → 점검까지 수행한다. 버전은 실행 시 최신을 조회해 설치한다.
version: 0.1.0
license: AGPL-3.0-only
compatibility:
  agents:
    - claude
---

# scaffold-shadcn-app

Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui 스택을 새로 까는 레시피.
아래 순서대로 진행하되, **버전 숫자는 박지 말고 실행 시점에 최신을 조회**한다.

## 0. 진행 원칙

- **버전**: 설치 직전 `npm view <pkg> version`으로 최신을 조회 → 사용자에게 알려준 뒤 설치한다.
- **역할 분담**: 컴포넌트 **탐색·계획은 MCP**, 실제 **파일 생성·초기화는 npx**.
- 각 단계가 끝나면 다음으로 넘어가기 전에 결과를 확인한다(파일 생성/설치 성공 여부).

## 1. 전제조건 점검

```bash
node -v && npm -v && npx -v
```

- Node.js는 LTS 권장. 하나라도 없거나 너무 낮으면 **진행을 멈추고** 설치를 안내한다(nvm 또는 nodejs.org).

## 2. Vite + React + TS 프로젝트 생성

> ⚠️ `create-vite`는 **빈 디렉터리**를 요구한다. 다른 파일(`.mcp.json` 등)을 먼저 만들면 프롬프트로 취소되므로,
> **반드시 프로젝트 생성을 먼저** 하고 MCP 등록(3단계)은 그 뒤에 한다.

빈 디렉터리에서 Vite의 react-ts 템플릿으로 시작한다.

```bash
# 현재 디렉터리에 스캐폴딩 (최신 create-vite 사용)
npm create vite@latest . -- --template react-ts
npm install
```

> ℹ️ 최신 Vite 템플릿은 이미 React 19 / Vite 8 / TS 6 / `@vitejs/plugin-react` 6 + `@types/*`를 깔아준다.
> 4단계는 보통 마이너 갱신 수준이다.

## 3. shadcn MCP 등록 (필수)

프로젝트 루트 `.mcp.json`에 shadcn MCP 서버를 stdio로 등록한다(없으면 생성, 있으면 병합):

```json
{
  "mcpServers": {
    "shadcn": { "type": "stdio", "command": "npx", "args": ["shadcn@latest", "mcp"], "env": {} }
  }
}
```

등록 후 MCP가 연결됐는지 확인한다(예: `get_project_registries`로 `@shadcn` 레지스트리 응답 확인).
MCP 변경은 Claude Code 재시작/재로딩이 필요할 수 있다.

## 4. 핵심 패키지 최신 갱신 (선택)

핵심 패키지의 **최신 버전을 조회해 사용자에게 알리고** 필요 시 갱신한다:

```bash
npm view react version react-dom vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node version
# 알린 뒤 설치
npm install react@latest react-dom@latest
npm install -D vite@latest @vitejs/plugin-react@latest typescript@latest @types/react@latest @types/react-dom@latest @types/node@latest
```

> ⚠️ `@types/react`/`@types/react-dom`는 React 메이저와 맞춰야 한다(React 19면 types도 19). 불일치 시 메이저를 고정해 재설치.

## 5. Tailwind CSS v4

```bash
npm view tailwindcss version @tailwindcss/vite version   # 최신 알림
npm install tailwindcss@latest @tailwindcss/vite@latest
```

진입 CSS(Vite react-ts 템플릿이면 `src/index.css`) **최상단**에:

```css
@import "tailwindcss";
```

## 6. 경로 별칭 (`@/` → `src`)

**`vite.config.ts`** — Tailwind 플러그인 + 별칭:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

**tsconfig — `paths` 추가** (`baseUrl` 없이; modern TS):

> ⚠️ 최신 Vite react-ts 템플릿은 **project-references 구조**다 — `tsconfig.json`(references만) + `tsconfig.app.json`(src 컴파일) + `tsconfig.node.json`.
> shadcn init이 별칭을 검증하려면 **`tsconfig.json`과 `tsconfig.app.json` 둘 다** `paths`가 있어야 한다.

```jsonc
// tsconfig.json (references-only 템플릿이면 compilerOptions를 새로 추가)
{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }

// tsconfig.app.json (기존 compilerOptions에 한 줄 추가)
{ "compilerOptions": { /* ...기존... */ "paths": { "@/*": ["./src/*"] } } }
```

> 평면 `tsconfig.json`(references 없음) 템플릿이면 그 한 곳에만 넣으면 된다.

## 7. 🔸 사용자 선택지 (init 전에 반드시 물어본다)

`AskUserQuestion`으로 다음을 확정한다:

1. **컴포넌트 라이브러리 (`-b` 플래그)** — 필수:
   - `base` → 컴포넌트가 **`@base-ui/react`** 프리미티브 사용
   - `radix` → 컴포넌트가 **`radix-ui`** 프리미티브 사용
2. (선택) **baseColor** — `neutral`/`zinc`/`slate`/`gray`/`stone`.
3. (선택) **초기 컴포넌트 세트** — 예: `button input label`. 안 정하면 init만 하고 9단계에서 추가.

> ℹ️ shadcn CLI 4.x 기준: `-b`는 **컴포넌트 라이브러리**(`radix`|`base`)를 뜻한다(예전 base **color**가 아님).
> `-d, --defaults`는 `--template=next` + 프리셋을 기본으로 잡으므로 Vite는 `-t vite`로 덮어쓴다.

## 8. shadcn 초기화

선택값으로 실행:

```bash
npx shadcn@latest init -d -t vite -b <base|radix>
```

- 완료 시 `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`(기본), CSS 테마 토큰(`@theme inline`, `:root`, `.dark`)이 생성되고 의존성(`@base-ui/react` 또는 `radix-ui`, `tw-animate-css`, `@fontsource-variable/geist` 등)이 설치된다.
- preflight에서 Vite·Tailwind v4·import 별칭을 자동 검증한다(6단계 별칭이 맞아야 통과).
- **비대화 팁**: 덮어쓰기 `-f`, 기존 UI 재생성 `--reinstall`, 라이브러리 전환 확인 프롬프트는 `printf 'y\n' | npx shadcn ...`.

## 9. 컴포넌트 추가 (MCP로 계획 → npx로 설치)

```text
1) search_items_in_registries / list_items_in_registries  → 어떤 컴포넌트가 있는지 탐색
2) view_items_in_registries / get_item_examples_from_registries → 파일·의존성·예제 확인
3) get_add_command_for_items(['@shadcn/button', ...]) → 설치 명령 생성
```

생성된 명령을 npx로 실제 실행:

```bash
npx shadcn@latest add @shadcn/button @shadcn/input @shadcn/label
```

→ `src/components/ui/*.tsx` 생성.

## 10. 설치 후 점검

MCP `get_audit_checklist`로 체크리스트를 가져와 점검한다:

- [ ] import 형태가 맞는지 (named vs default)
- [ ] 모든 의존성 설치됨
- [ ] lint 경고/에러 확인
- [ ] 타입 에러 확인
- [ ] 브라우저 렌더링 검증 (chrome-devtools MCP 활용 가능)

## 11. 검증

```bash
npx tsc -b        # Vite react-ts 템플릿의 typecheck (references 빌드). 평면 tsconfig면 `tsc --noEmit`
npm run build     # 템플릿 기본 build 스크립트 = `tsc -b && vite build`
```

둘 다 통과하면 스캐폴딩 완료. 이후 개발은 `@/components/ui/*` 위에서 진행한다.

---

## 부록 A — shadcn MCP 도구 7종

| 도구 | 용도 |
|---|---|
| `list_items_in_registries` | 레지스트리의 컴포넌트/아이템 목록 조회 |
| `search_items_in_registries` | 이름·키워드로 아이템 검색 |
| `view_items_in_registries` | 특정 아이템 상세(파일·의존성) 보기 |
| `get_item_examples_from_registries` | 사용 예제·데모 코드 조회 |
| `get_add_command_for_items` | `npx shadcn add ...` 설치 명령 생성 |
| `get_project_registries` | `components.json`의 레지스트리 목록 조회 |
| `get_audit_checklist` | 설치 후 점검 체크리스트 조회 |

## 부록 B — MCP vs npx

| 상황 | 수단 |
|---|---|
| 어떤 컴포넌트가 있는지 탐색·검색 | **MCP** (`search/list_items_in_registries`) |
| 파일·의존성·예제 미리 보기 | **MCP** (`view_items_in_registries`, `get_item_examples_from_registries`) |
| 설치 명령 생성 | **MCP** (`get_add_command_for_items`) |
| 실제 설치·초기화 (파일 생성) | **npx** (`npx shadcn@latest add/init`) |

> MCP = 조회·계획, npx = 실제 파일 변경. 설치 전 MCP로 대상을 확인한 뒤 npx로 적용한다.
