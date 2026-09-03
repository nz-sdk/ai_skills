---
name: create-frontend
description: scaffold-shadcn-app으로 깐 순수 Vite+React+TS+Tailwind v4+shadcn/ui 스캐폴드 위에, 우리 기본 프로젝트(new-world 데스크톱 셸)의 표준 프론트엔드 기반을 올리는 "스캐폴드 다음 첫 작업" 레시피. "프론트 기반 잡아줘", "create-frontend", "스캐폴드 다음 셋업", "우리 표준 프론트 골격", "i18n/폰트/통신 SDK/공유 번들까지 세팅" 같은 요청에 사용. 가장 먼저 셸(호스트)/앱(자기완결) 배포 형태를 선택한다. shadcn 기본 셋업(Vite 생성·Tailwind 설치·@/ 별칭·shadcn init·기본 컴포넌트 add)은 전제로 두고 제외한다. 버전은 실행 시 최신을 조회한다. 아직 스캐폴드가 없으면 먼저 scaffold-shadcn-app을 쓴다.
version: 0.1.0
license: AGPL-3.0-only
compatibility:
  agents:
    - claude
---

# create-frontend

`scaffold-shadcn-app` 이 끝난 **바로 다음** 프론트엔드 작업. 순수 shadcn 스캐폴드를
우리 기본 프로젝트(데스크톱 셸)의 표준 프론트 골격으로 끌어올린다.
표준 스택 정의는 **[부록 B — 표준 스택 요약](#부록-b--표준-스택-요약)** 을 단일 참조(SSOT)로 삼는다.

## 0. 진행 원칙

- **버전 고정하지 말 것**: 설치 직전 `npm view <pkg> version`으로 최신을 조회 → 사용자에게 알린 뒤 설치. 부록 B 의 버전 숫자는 스냅샷일 뿐 기준이 아니다.
- **역할 분담**: 컴포넌트 **탐색·계획은 shadcn MCP**, 실제 **파일 생성·설치는 npx/npm**.
- **겹치면 건드리지 않는다**: scaffold-shadcn-app 이 만든 것(Vite/Tailwind/별칭/shadcn init/기본 컴포넌트)은 재실행·재설치하지 않는다. 없는 것만 채운다.
- **프로젝트 고유 vs npm**: `@desktop/sdk`·`@desktop/ui`·`gui-tool` MCP 등은 npm 패키지가 아니라 **이 레포/서브모듈 내부 산출물**이다. `npm install` 대상이 아니라 소스·서브모듈에서 가져오거나 이 레포 안에서 만든다.
- **빌드 스크립트는 임의 작성 금지**: `build:vendor`·`build:apps`·`build:catalog` 은 §9~§10 의 정해진 레시피를 그대로 쓴다(클로드가 매번 새로 짜지 않는다).
- 각 단계가 끝나면 다음으로 넘어가기 전에 결과(설치/파일 생성/빌드)를 확인한다.

## 1. 배포 형태(셸/앱) & 프레임워크 — 사용자 선택

**배포 형태(§1-0)를 가장 먼저 정한 뒤**, 프레임워크 갈래(§1 본문)를 정한다.

### 1-0. 배포 형태 — 셸(호스트) vs 앱(자기완결) [가장 먼저]

`AskUserQuestion` 으로 먼저 확정한다. **이 값이 §9~§14·§15 의 external(공유) 정책을 결정한다.**

- **앱 (self-contained)** — 이 프로젝트 하나로 완결. react 를 앱 번들에 **내장**, importmap/external **미적용** → 항상 빌드·렌더된다. 외부 앱 호스팅 계획이 없으면 **기본 권장**(가장 안전).
- **셸 (host / 데스크톱 셸)** — 여러 업무 앱(`src/apps/<id>`)을 런타임 로딩하며 react 를 **1개만 공유** → §10 importmap external 아키텍처 적용. 단, vendor 는 §10 의 **'고친 레시피'로만** 생성하고 §14 `preview` 검증이 **필수**다.

- **배치 기본 규칙**(되묻기 제거): 업무 화면(디자인싱크 변환분) → `src/apps/<id>/`(외부 앱, external 대상). 셸 크롬(로그인·사이드바·네비) → 셸 컴포넌트(`src/components`, `src/App.tsx`).
- 선택 값(SHELL/APP)을 §15 프로젝트 CLAUDE.md 에 기록한다.

### 1-N. Next.js 사용 여부

`AskUserQuestion` 으로 **Next.js 를 쓸지** 확정한다.

- **아니오 (Vite)** — 기본 경로. scaffold-shadcn-app 이 깐 Vite 스택 위에서 §2 부터 그대로 진행한다.
- **예 (Next.js)** — Next.js 경로. Vite 전제(빌드 파이프라인·importmap 공유·`vite.config.ts` CSP 등)가 달라지므로 해당 단계를 Next.js 방식으로 대체하고, 아래 1-2 에서 렌더링 방식을 확정한다. (Next 는 자체 번들러라 §9·§10 셸 아키텍처를 건너뛴다 — 부록 C.)

### 1-1. 판단 가이드 — Next.js 는 언제 쓰나

선택 전에 아래 기준으로 사용자에게 **권장안을 제시**한다. 우리 기본 프로젝트(데스크톱 셸)는 **로그인 뒤 인증 SPA** 라 기본이 **Vite** 다 — SEO 불필요, dev 속도, 셸 아키텍처(§10) 때문.

| Next.js 가 맞는 신호 | Vite(기본) 가 맞는 신호 |
|---|---|
| 공개 페이지 비중 큼(마케팅·블로그·문서·이커머스 카탈로그) → SEO·크롤러에 pre-rendered HTML 필요 | 로그인 뒤 인증 앱(내부 대시보드·어드민·SaaS 코어·데스크톱 셸) → 크롤러 무의미 |
| 초기 로드/LCP·CDN sub-100ms 가 중요 | 빠른 dev 서버(~300ms)·SPA 인터랙션 우선 |
| 라우트마다 렌더링 전략을 섞어야 함(마케팅=SSG, 대시보드=SSR) | SSR 이 몇 라우트만 필요 → React Router v7 / TanStack Start 로도 충분(중간지대) |

> SSR 이 **day-one 전 라우트 요건**이면 Next.js 가 마찰이 가장 적다. 소수 라우트만이면 Vite + React Router v7/TanStack Start 가 더 가볍다.

### 1-2. 렌더링 방식 확정 (Next.js "예" 일 때)

"예" 면 `AskUserQuestion` 으로 **기본 렌더링 방식**을 고르게 한다(App Router 는 라우트별로 섞을 수 있으니, 여기선 프로젝트 **디폴트**를 정하는 것). 각 옵션 `description` 에 아래 "언제/비용"을 넣어 판단을 돕는다:

| 옵션 `label` | `description`(언제 / 비용) |
|---|---|
| **SSG** (Static Site Generation) | 거의 안 바뀌는 페이지(문서·블로그·마케팅·About/Pricing)를 빌드 타임에 정적 생성. **가장 빠르고 저렴**, SEO 최상. |
| **ISR** (Incremental Static Regeneration) | 정적 캐시 + 지정 주기 백그라운드 재생성. 5~60분 신선도면 되는 상품 카탈로그·뉴스·리더보드. 저비용. |
| **SSR** (Server-Side Rendering) | 매 요청 서버 렌더. 쿠키·로그인 사용자·매번 최신이 필요한 인증 대시보드·개인화 피드. **가장 비쌈**(요청마다 서버 왕복). |
| **CSR** (Client-Side Rendering) | 빈 HTML → 브라우저에서 JS 로 렌더. SSG/ISR 페이지 안의 인터랙티브 위젯에 국한. SEO·LCP 손해라 페이지 전체 기본값으론 비권장. |

- **권장 디폴트 제시**: 공개 콘텐츠 위주면 SSG(+동적 페이지 ISR), 인증 앱 위주면 SSR, 순수 인터랙티브 위젯은 CSR. 최종은 사용자 선택.
- App Router 기준으로 라우트별 혼용이 가능함을 알린다(디폴트만 정하고 예외 라우트는 개별 지정).

> **Next.js "예" 를 골랐으면** → §2 부터의 Vite 기준 단계를 그대로 따르지 말고 **[부록 C — Next.js 경로](#부록-c--nextjs-경로)** 로 간다. 부록 C 가 스캐폴딩·단계 매핑·렌더링 구현을 다룬다. 렌더링 디폴트(1-2 선택)는 부록 C-3 에서 코드로 반영한다.

## 2. 전제 점검 — shadcn 셋업 있으면 진행, 없으면 선행 스킬 판별

이 스킬은 **shadcn 기본 셋업이 이미 끝난 것**을 전제로 한다. 먼저 확인한다:

```bash
test -f components.json && echo "shadcn ✔"        # shadcn init 완료
test -f src/lib/utils.ts && echo "cn util ✔"
grep -q '"@/\*"' tsconfig.app.json && echo "alias ✔"
grep -q '@import "tailwindcss"' src/index.css && echo "tailwind v4 ✔"
node -v && npm -v && npx -v
```

- `.mcp.json` 에 `shadcn` MCP 가 등록돼 있는지도 확인(컴포넌트 탐색에 사용). 없으면 사용자에게 등록을 요청(에이전트가 `.mcp.json` 을 직접 쓰는 건 self-modification 가드로 막힐 수 있음).

### 셋업이 없으면 — 어느 선행 스킬인지 판별해 사용자에게 알린다

`components.json`(또는 shadcn 셋업)이 **없으면 멈추고**, 현재 폴더 상태로 **어느 선행 스킬을 먼저 돌려야 하는지 판별**한다. 무조건 scaffold 로 보내지 말 것.

```bash
# 빈/신규 폴더 판별: 소스가 될 만한 파일이 사실상 없는가?
ls -A | grep -vE '^\.(git|claude|mcp\.json)$' | head
test -f package.json && echo "package.json 있음"        # 기존 프로젝트 신호
```

판별 → 실행 여부를 **사용자에게 알린다**:

| 현재 상태 | 선행 스킬 | 안내 |
|---|---|---|
| 빈/신규 폴더 (React 프로젝트 아님, `package.json`·`src` 없음) | **`scaffold-shadcn-app`** | "빈 폴더입니다 — 먼저 `scaffold-shadcn-app` 으로 스택을 깔아야 합니다. 진행할까요?" |
| 기존 React 프로젝트인데 shadcn 없음 (`package.json`·`src` 있음, `components.json` 없음) | **`add-shadcn-existing`** | "기존 React 프로젝트로 보입니다(shadcn 미설치) — `add-shadcn-existing` 으로 shadcn 을 붙여야 합니다. 진행할까요?" |
| fullstack 서브모듈 구조(`.gitmodules` 로 frontend 분리) | **`add-shadcn-existing`** | frontend 위치·`.mcp.json` 배치는 그 스킬이 다룬다. |

- 판별이 애매하면(예: React 여부 불확실) `AskUserQuestion` 으로 사용자에게 확인한 뒤 스킬을 지목한다.
- **어느 경우든 선행 스킬을 사용자 동의 없이 자동 실행하지 않는다** — 어느 스킬을 왜 돌려야 하는지 알리고 진행 여부를 받는다. 선행 스킬이 끝나면 이 스킬(3단계 = shadcn 표준)로 돌아온다.

## 3. 🔸 shadcn 프로젝트 표준 확정 (실행 시 선택)

`AskUserQuestion` 으로 **style / baseColor** 를 확정한다. 프로젝트 기본값을 **추천**으로 제시하되 변경 가능:

- **style** — 추천 `base-vega` (프로젝트 표준). 대안: `base-nova` 등.
- **baseColor** — 추천 `olive` (프로젝트 표준). 대안: `neutral`/`zinc`/`slate`/`stone`.

확정 후 `components.json` 을 프로젝트 표준으로 맞춘다.

- 스캐폴드가 다른 값(예: base-nova / neutral)으로 init 됐으면 `components.json` 의 `style`·`tailwind.baseColor` 를 표준값으로 갱신하고, 필요 시 테마 토큰을 재생성한다:
  ```bash
  # 표준 컬러로 테마 토큰 재적용이 필요할 때(기존 컴포넌트 재설치)
  printf 'y\n' | npx shadcn@latest init -f -t vite -b <base|radix>   # 라이브러리는 scaffold 선택 유지
  ```
- 라이브러리(base vs radix)는 scaffold 단계에서 이미 정한 값을 **유지**한다(프로젝트 표준은 `@base-ui/react` = base). 바꾸려면 사용자에게 재확인.

## 4. 폰트 (self-host 가변 폰트)

표준: **Geist + Raleway** 가변 폰트를 self-host.

```bash
npm view @fontsource-variable/geist version @fontsource-variable/raleway version   # 최신 알림
npm install @fontsource-variable/geist @fontsource-variable/raleway
```

`src/index.css` 진입부에 import 하고 `@theme inline` 의 `--font-sans` / (필요시)`--font-heading` 에 연결:

```css
@import "@fontsource-variable/geist";
@import "@fontsource-variable/raleway";
/* @theme inline { --font-sans: 'Geist Variable', sans-serif; --font-heading: 'Raleway Variable', sans-serif; } */
```

> scaffold init 이 이미 Geist 를 넣었을 수 있다 — 중복 import 금지, Raleway 만 추가.

## 5. 추가 UI 라이브러리

부록 B 의 "UI 라이브러리" 목록을 설치한다. **shadcn registry 에도 있는 것(sonner/cmdk/carousel/drawer/otp/calendar 등)은 MCP 로 먼저 탐색 → npx add** 로 넣어 래퍼 컴포넌트까지 생성하고, 순수 npm 라이브러리는 아래 **체크리스트로 골라** 설치한다.

- **shadcn 파생(가능하면 `npx shadcn add`)**: `sonner`(토스트), `cmdk`(커맨드 팔레트), `vaul`(드로어), `input-otp`, `embla-carousel-react`(carousel), `react-day-picker`(calendar)
  ```bash
  # shadcn 파생은 MCP 로 확인 후:
  npx shadcn@latest add @shadcn/sonner @shadcn/command @shadcn/drawer @shadcn/carousel
  ```

### 순수 npm — `AskUserQuestion` 체크리스트로 선택 설치

전부 한 번에 깔 필요는 없다. **`AskUserQuestion`(multiSelect: true)** 으로 지금 필요한 것만 고르게 한 뒤, **선택된 것만** 최신 조회→설치한다. **각 옵션의 `label` 은 패키지명, `description` 에는 아래 "무슨 기능인지"를 그대로 넣어** 사용자가 기능을 보고 고르게 한다:

| 옵션 `label`(패키지) | `description`(무슨 기능인지) |
|---|---|
| `react-resizable-panels` | 드래그로 크기 조절되는 분할 패널. 좌우/상하로 나뉜 레이아웃(예: Detail 패널, 사이드바)을 사용자가 늘렸다 줄였다 하게 한다. |
| `@tanstack/react-virtual` | 가상 스크롤(virtualization). 수천~수만 행의 리스트/그리드에서 화면에 보이는 항목만 렌더링해 성능을 유지한다. |
| `react-big-calendar` + `date-fns` | 월/주/일 뷰의 풀 캘린더 UI(`react-big-calendar`) + 날짜 파싱·연산·포맷 유틸(`date-fns`). 일정/이벤트 화면에 쓰며 둘을 쌍으로 설치한다. |
| `react-live` | 코드 문자열을 실시간으로 편집하고 그 결과를 바로 렌더링하는 라이브 프리뷰. 컴포넌트 갤러리·문서의 "코드 편집→미리보기"에 쓴다. |
| `html2canvas-pro` | DOM 요소를 캡처해 `<canvas>`/이미지로 렌더링. 화면 스크린샷·이미지 내보내기 기능에 쓴다. |

- 기본값은 "지금은 없음(후속에서 추가)" 를 포함해, 첫 화면에 안 쓰는 건 미루게 한다.
- 선택 확정 후 **고른 패키지만** 조회·설치:
  ```bash
  # 예시: 선택이 react-resizable-panels + tanstack-virtual 이라면 그 둘만
  npm view react-resizable-panels version @tanstack/react-virtual version    # 최신 알림
  npm install react-resizable-panels @tanstack/react-virtual
  ```
- 무엇을 넣고 무엇을 미뤘는지 설치 후 사용자에게 요약해 알린다.

## 6. 국제화 (i18n) — 사용 여부·로케일 모두 사용자 선택

i18n 은 **선택 영역**이다. 강제로 넣지 말고 먼저 사용 여부를 묻는다.

### 6-1. 사용 여부

`AskUserQuestion` 으로 i18n 을 넣을지 확정한다(옵션: "예 — i18n 설정" / "아니오 — 지금은 생략"). **아니오면 이 단계 전체를 건너뛴다.**

### 6-2. 로케일 선택 (기본 4개 + 타이핑으로 추가)

"예" 면 `AskUserQuestion`(**multiSelect: true**)으로 지원 로케일을 고르게 한다.

- **기본 4개 옵션**: `ko`(한국어), `en`(English), `ja`(日本語), `zh`(中文) — 프로젝트 표준값이라 기본 제시.
- **다른 로케일은 "Other" 타이핑**으로 받는다. 질문 타이틀/설명에 **입력 예시를 넣어** 형식을 알린다 — 예: `"지원할 로케일을 고르세요 (기타는 직접 입력: 예 fr, es, pt-BR, de, vi)"`.
- 선택된 로케일 목록으로 아래 리소스 폴더/초기화를 구성한다. fallback 로케일은 선택된 것 중 하나(기본 `ko`, 없으면 첫 항목)로 잡되 필요 시 사용자에게 확인.

### 6-3. 설치·구조

```bash
npm view i18next version react-i18next version   # 최신 알림
npm install i18next react-i18next
```

구조(`src/shared/i18n/`) — **선택된 로케일만** 생성:

- `src/shared/i18n/locales/<선택 로케일>/` — 번역 리소스(JSON/ts)
- `src/shared/i18n/index.ts` — i18next 초기화(`initReactI18next`), fallback = 위에서 정한 로케일
- date-fns 로케일 맵 + region 기반 날짜/숫자 포맷 헬퍼 (date-fns 는 §5 에서 이미 깔렸으면 재설치하지 않는다)

`main.tsx` 이전에 i18n 초기화가 로드되도록 import 순서를 잡는다.

`<html lang>` 은 **`languageChanged` 핸들러 한 곳에서만** 갱신한다. `setLocale` 안에서만
처리하면 초기 로드(localStorage/navigator 감지) 경로가 빠져 `index.html` 의 `lang` 이
그대로 남는다.

```ts
i18n.on('languageChanged', (lng) => { document.documentElement.lang = lng })
document.documentElement.lang = i18n.resolvedLanguage ?? FALLBACK_LOCALE  // 초기 1회
```

> 셸(§1-0)에서 external 을 켰다면 i18next 인스턴스도 공유 대상이다(§10-2 참고: i18next standalone + react-i18next external).

### 6-4. ⚠️ 화면 문자열은 전부 `t()` 를 거친다 — 데모 화면도 예외 없음

i18n 을 켰으면 **언어를 바꿨을 때 화면 전체가 바뀌어야 한다.** 배선만 해놓고 문자열 몇 개만
연결하면 "언어를 바꿔도 절반만 바뀌는" 상태가 된다 — 동작하는 것처럼 보여서 더 나쁘다.

- 이 스킬이 만드는 **점검/데모 화면도 실제 화면과 같은 규칙**으로 작성한다. 데모라고 하드코딩하면
  이후 실제 화면을 만드는 사람이 그 패턴을 그대로 따라간다.
- 라벨·placeholder·버튼·다이얼로그 제목/본문·toast·tooltip·메뉴 항목·select 옵션까지 전부 키로 뺀다.
- **선택된 로케일을 전부 채운다.** 하나라도 비면 그 언어에서 fallback 이 튀어나와 화면이 섞인다.
- 번역하지 **않는** 것은 이유가 분명한 경우만 — 언어 이름(`한국어`/`English`/`日本語`/`中文`,
  각 언어를 그 언어로 표기하는 게 표준) · 고유명사/기술명(`Vite`, `React`, `QA` 등).

**두 가지 함정** (둘 다 "일부만 안 바뀐다" 로 나타난다):

```tsx
const LABELS = { high: t('priority.high') }                        // ❌ 모듈 레벨 → 최초 1회로 굳음
const labels = useMemo(() => ({ high: t('priority.high') }), [t])  // ✅ t 는 언어 변경 시 새 참조
```

- 언어 변경 리렌더는 **`useTranslation()` 을 부른 컴포넌트에만** 전파된다. 번역 문자열을 쓰는
  컴포넌트는 직접 `useTranslation` 을 부른다.

**검증**: `preview` 에서 로케일을 하나씩 바꿔가며 `document.body.innerText` 를 덤프해
남아 있는 원본 언어 문자열이 없는지 본다.

## 7. 인증 / 애널리틱스 — 각각 독립 사용자 선택

인증과 애널리틱스는 **서로 별개의 선택 영역**이다. 하나로 묶지 말고 각각 따로 사용 여부를 묻는다(둘 다 넣기 / 하나만 / 둘 다 생략 모두 가능).

### 7-1. 인증 (Google OAuth) — 사용자 선택

`AskUserQuestion` 으로 사용 여부를 확정한다("예 — Google OAuth 설정" / "아니오 — 생략"). **아니오면 건너뛴다.**

"예" 면:

```bash
npm view @react-oauth/google version   # 최신 알림
npm install @react-oauth/google
```

- **셸(§1-0)** 이면 **공유 번들(external)** 로 로드한다(§10). 앱 코드는 `import` 하되 빌드에선 external 처리. **앱(§1-0)** 이면 그냥 번들에 포함(external 미적용).
- OAuth 클라이언트 ID 등 시크릿은 env(`.env`, gitignore)로 두고 코드에 박지 않는다.

### 7-2. 애널리틱스 (GA4) — 사용자 선택

`AskUserQuestion` 으로 사용 여부를 확정한다("예 — GA4 설정" / "아니오 — 생략"). **아니오면 건너뛴다.**

아래 **4개 지점 + 5개 설계 원칙**을 그대로 따른다(SPA·라우터 없음 전제의 표준 GA4 구성). 측정 ID·운영 도메인만 이 프로젝트 값으로 바꾼다.

**구성 4지점**

1. **`index.html` — gtag.js 인라인 로더** (npm 패키지 아님, 스니펫):
   - **localhost 가드**: `location.hostname` 이 `localhost`/`*.localhost`/`127.0.0.1`/`[::1]`/`::1`/`''` 면 즉시 `return` → 로컬·프리뷰에선 gtag 아예 미로드.
   - prod 에서만 `googletagmanager.com/gtag/js?id=<측정ID>` 로드 후 `gtag('config', '<측정ID>', { send_page_view: false })`.
   - **`send_page_view: false`** — 자동 페이지뷰 off. 라우터 없는 SPA 이므로 화면/앱 전환마다 수동 전송.
2. **`src/analytics.ts` — 타입 안전 래퍼**:
   - `window.gtag` 없으면 **조용히 no-op**(로컬·광고차단·로드실패). 호출부는 환경을 신경 안 씀.
   - `declare global { interface Window { gtag?; dataLayer? } }` 로 별도 `.d.ts` 없이 타입 안전.
   - 앱/화면 전환 → 가상 `page_view`(`page_path: '/app/<id>'`), 라이프사이클 이벤트(`open_app`/`close_app`/`minimize_app`/`toggle_maximize_app`) 등 이 프로젝트 이벤트 스키마에 맞춰 export.
3. **호출 지점** — 실제 전환/라이프사이클 지점에서 `trackAppView`/`trackAppEvent` 호출.
4. **`vite.config.ts` — CSP 도메인 허용**(§10 CSP 와 함께 주입):
   - `script-src` 에 `https://www.googletagmanager.com`.
   - `connect-src` 에 `www.google-analytics.com`·`analytics.google.com` 을 **bare 와 `*.` 와일드카드 둘 다** 명시.
   - ⚠️ **CSP 와일드카드 함정**: `*.example.com` 은 `example.com` 자체를 매칭하지 않는다. GA4 전송 엔드포인트는 bare 도메인이라 와일드카드만 넣으면 전송이 막힌다 — bare 도 반드시 추가.

**설계 원칙 요약**: ① localhost 가드로 로컬 수집 0 · ② SPA → 수동 가상 페이지뷰 · ③ no-op 폴백 · ④ CSP bare+와일드카드 · ⑤ **로컬 검증 불가** — 운영 배포 후 "콘솔 CSP 에러 없음 + GA4 실시간 리포트 도착" 두 가지로만 검증.

- 측정 ID·운영 도메인은 이 프로젝트 값으로. 값이 없으면 사용자에게 물어 env/스니펫에 주입.

## 8. 린트 (ESLint 10 flat config)

표준은 **ESLint 10 flat config**. 최신 Vite react-ts 템플릿은 `oxlint` 로 스캐폴드될 수 있으므로, 표준에 맞춰 **ESLint 10 로 교체**한다(사용자에게 교체/병행 여부 확인).

```bash
npm view eslint version typescript-eslint version eslint-plugin-react-hooks version eslint-plugin-react-refresh version
npm install -D eslint typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh
```

- `eslint.config.js`(flat config) 작성, `package.json` 의 `lint` 스크립트를 `eslint .` 로 교체.
- oxlint 를 걷어낼지(`.oxlintrc.json`+devDep 제거) 사용자에게 확인.

## 9. 빌드 파이프라인 확장

표준 파이프라인을 `package.json` 에 구성한다:

```
build = tsc -b → build:vendor → build:apps → build:catalog → vite build
```

- **esbuild** — vendor/외부 앱 lib 번들. `npm view esbuild version` 후 `npm install -D esbuild`.
- **cross-env** — 크로스플랫폼 env 주입. `npm install -D cross-env`.
- **babel-plugin-react-compiler** — 설치하되 **비활성화**. importmap external-react 아키텍처(§10)와 충돌하므로 `vite.config.ts` 에서 끈다(주석으로 이유 명시).
- 빌드 스크립트(`.mjs`)를 `scripts/` 아래 두고(`build:vendor`/`build:apps`/`build:catalog`) `package.json` scripts 에 연결한다. `"type": "module"` 전제.

**필수 규칙**

- **`build:vendor`·`build:apps` esbuild 는 `minify: false`** — 산출물을 사람이 읽을 수 있게(검증·디버깅). (압축된 vendor 는 export 형태 확인이 어렵다 — error-test 사례.)
- **`build:vendor` 엔트리는 bare 패키지 금지 → §10-2 의 named 재노출 shim 필수.** bare(`entryPoints:{react:'react'}`)로 번들하면 default-only 가 되어 prod `preview` 링크 에러가 난다.
- **`build:apps`/`build:catalog` 은 아래 §9-a/§9-b 의 정해진 레시피를 그대로 쓴다 — 클로드 임의 작성 금지.**
- **앱(§1-0)** 이면 build:vendor 산출물은 external 로 쓰이지 않는다(§10 게이트 OFF) — 파이프라인은 유지하되 importmap 미주입.

### 9-a. `build:apps` 표준 레시피 (`scripts/build-apps.mjs`)

`src/apps/<id>/` 중 **`manifest.json` + `index.ts`** 가 있는 폴더를 앱으로 보고 각각 독립 번들한다.

- esbuild 옵션(고정):
  ```js
  { bundle: true, format: 'esm', platform: 'browser', target: ['es2022'],
    sourcemap: true, minify: false, jsx: 'automatic',   // React 19 automatic runtime
    external: EXTERNAL_IDS,                              // 공유 런타임은 /vendor 로(importmap 공유)
    alias: { '@': 'src', '@desktop/sdk': 'src/shared/comms' },
    metafile: true, entryNames: '[name].[hash]', assetNames: '[name].[hash]' }
  ```
- 산출물: `public/apps/<id>.<hash>.js`(+`.css`). metafile 입력 + 앱 폴더 내용 해시로 **증분 빌드**(`public/apps/.build-manifest.json` 캐시).
- `jsx:'automatic'` 필수(classic 이면 "React is not defined"). jsx-runtime import 는 external → importmap 해석.

### 9-b. `build:catalog` 표준 레시피 (`scripts/build-catalog.mjs`)

- `public/apps/.build-manifest.json`(해시가 박힌 entry/css URL) + 각 `src/apps/<id>/manifest.json`(`id`·`name`) 을 **병합** → `public/catalog/index.json`.
- 셸은 런타임에 이 catalog 를 fetch 해 어떤 앱을 어디에 마운트할지 발견한다.

## 10. 공유(single-instance) 아키텍처 — importmap external **(셸 전용)**

> **§1-0 에서 '앱' 을 골랐으면 이 단계 전체를 건너뛴다**(external 미적용, react 를 앱 번들에 내장 → 자기완결). '셸' 이면 아래 10-1·10-2 를 그대로 적용한다.

react·react-dom·`@desktop/sdk`·`@desktop/ui`·`@react-oauth/google`·i18n 을 **importmap external** 로 묶어 `/vendor/*.js` 한 곳에서 로드 → 셸과 외부 앱이 **단일 react 인스턴스** 공유.

- `build:vendor` 산출물 → `public/vendor/*.js`. **dev**: `vite.config.ts` alias 로 소스 직접 로드. **prod**: importmap 주입.
- **CSP**: prod 빌드에 `Content-Security-Policy` meta 주입 — `blob:`(SRI 모듈) / `ws:`·`wss:`(relay) / (GA4 쓰면) GA 도메인 허용.
- external 목록·importmap·require 배너는 `scripts/shared-externals.mjs` **단일 소스(SSOT)** 로 관리(`vite.config.ts`·`build:vendor`·`build:apps` 가 공유).

### 10-0. ⚠️ external 목록을 손으로 적지 않는다 (스캔으로 만든다)

**이걸 안 지키면 나머지 10-1·10-2 를 다 지켜도 셸 구조가 무효가 된다.**

external 을 **패키지 단위**로 적으면 안 된다. 요즘 UI 라이브러리는 컴포넌트마다 서브패스가 갈린다:

```
@base-ui/react          ← 79개 서브패스를 가진 패키지
  /button  /dialog  /menu  /select  /tooltip  /tabs  /accordion ...
```

`shared-externals.mjs` 에 `'@base-ui/react'` 한 줄만 적으면 **서브패스는 external 이 안 된다.**
그러면 그 모듈들은 **에러 없이 앱 번들에 복사**된다 → 라이브러리가 두 벌이 되고, 셸과 외부 앱이
서로 다른 인스턴스를 잡아 context(열린 팝업 상태 등)가 공유되지 않는다.
**빌드도 통과하고 §14 preview 게이트도 통과한다** — 셸 혼자일 땐 증상이 없기 때문이다.
외부 앱이 붙는 순간에야 드러난다.

→ **패키지 이름만 선언하고, 실제 import 경로는 `src/**` 스캔으로 채운다.**

```js
// scripts/shared-externals.mjs
export const SHARED_PACKAGES = ['react', 'react-dom', 'i18next', 'react-i18next',
                                '@base-ui/react', '@react-oauth/google', '@desktop/sdk']

// 스캔으로는 못 잡지만 반드시 필요한 것 (소스에 안 적힌다)
//  react/jsx-runtime : JSX 변환이 빌드 때 주입
//  react-dom         : vendor 내부(base-ui·react-dom/client)가 참조
const ALWAYS_SHARED = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']

export function scanSharedSpecifiers() {
  // src/** 의 .ts/.tsx/.js/.jsx 를 읽어 /(?:from|import)\s*\(?\s*["']([^"']+)["']/g 로 뽑고,
  // SHARED_PACKAGES 중 하나로 시작하는 것만 남긴다. ⚠️ 동기 fs — vite.config.ts 가 이 모듈을
  // import 하므로 top-level await 이 있으면 설정 로딩이 깨진다.
}

export const EXTERNAL_IDS = scanSharedSpecifiers()          // 이름은 그대로 유지
export const IMPORTMAP = buildImportmap(EXTERNAL_IDS)       // 이름은 그대로 유지
```

`EXTERNAL_IDS`·`IMPORTMAP` **이름을 유지**하면 소비자 3곳(`vite.config.ts`·`build:vendor`·`build:apps`)은
손댈 필요가 없다 — 값을 만드는 방식만 바뀐다.

**이 방식이어야 하는 이유**: 검증을 한 번 하고 끝나는 게 아니라 **매 빌드마다** 다시 한다.
사용자가 `npx shadcn add @shadcn/select` 로 컴포넌트를 늘려도, 디자인 에이전트가
`src/apps/<id>/` 에 화면을 만들어도, 다음 빌드에서 자동으로 따라온다. 사람이 목록을 기억할 필요가 없다.

- 매 빌드마다 `build:vendor` 가 **찾아낸 목록을 콘솔에 출력**한다 — 빠진 게 있으면 눈에 보인다.
- 정규식으로 import 구문을 읽으므로 **동적 import 의 인자가 변수면 못 잡는다.** 그런 경우는
  `ALWAYS_SHARED` 에 직접 넣는다.

### 10-1. external ON/OFF 게이트

external 은 **on-demand 게이트**로 둔다 — 공유할 외부 앱이 아직 없으면 꺼서 자기완결로 돌리고(안전), 필요할 때 켠다. `vite.config.ts`:

```ts
import { defineConfig, esmExternalRequirePlugin } from 'vite'
import { IMPORTMAP, EXTERNAL_IDS } from './scripts/shared-externals.mjs'

// 셸이면 이 값의 기본 정책을 정한다(항상 ON, 또는 앱 생기기 전엔 OFF).
const VENDOR_EXTERNAL = process.env.VENDOR_EXTERNAL === '1'

export default defineConfig(({ command }) => ({
  plugins: [
    react(), tailwindcss(),
    prodHtmlPlugin(VENDOR_EXTERNAL),   // importmap+CSP 는 VENDOR_EXTERNAL 일 때만 주입
    // Vite 8(Rolldown)이 external 을 require 로 남기는 걸 막고 ESM import 로 내보냄. build 전용.
    ...(VENDOR_EXTERNAL && command === 'build'
      ? [esmExternalRequirePlugin({ external: [...EXTERNAL_IDS] })] : []),
  ],
  // build.rollupOptions.external 은 쓰지 않는다(위 플러그인이 대체 — 중복 시 경고).
}))
```

`package.json`:

```json
"build:external": "cross-env VENDOR_EXTERNAL=1 npm run build"
```

> ⚠️ **VENDOR_EXTERNAL 기본값은 정책 선택**이다: (a) 셸이면 항상 ON, 또는 (b) 실제 외부 앱이 붙기 전까진 OFF(자기완결, `build:external` 로 켬 — error-test 방식). **어느 쪽이든 10-2 의 vendor 고친 레시피가 전제**여야 켰을 때 안 깨진다.

### 10-2. `build:vendor` — named 재노출 shim + code splitting

react 는 **CommonJS** 라, esbuild 로 bare 패키지를 그대로 ESM 번들하면 **`default` 만** 남고 `useCallback`·`createRoot` 같은 **named export 가 소실**된다. 소비자는 `import { useCallback } from 'react'` 로 named import 하므로, importmap 이 default-only 번들에 연결되는 순간 링크 에러가 난다. → 아래로 방지:

1. **동적 named 재노출 shim** (하드코딩 목록 금지 — 버전 변화/`useSyncExternalStore` 등 누락 위험):
   ```js
   // 패키지를 build 타임에 import → 실제 런타임 키를 읽어 ESM named 로 재노출
   const mod = await import(entry)
   const ns = mod.default ?? mod            // CJS(react: default)·ESM-named(react-dom/client) 양쪽 처리
   const names = Object.keys(ns).filter(k => k!=='default' && k!=='__esModule' && /^[A-Za-z_$][\w$]*$/.test(k))
   // 생성 shim: `import * as __ns from '<pkg>'; const __m=__ns.default??__ns; export default __m; export const { ...names } = __m`
   ```
2. **react 4형제 code splitting**: `react`·`react-dom`·`react-dom/client`·`react/jsx-runtime` 을 `splitting:true` 로 **한 번에** 번들 → react/react-dom 이 **공유 chunk 1개**(단일 인스턴스) + client 가 react-dom 내부 접근 유지. (원인 C 해결)
3. **서브패스 패키지도 `splitting:true` 로 한 번에**: `@base-ui/react` 루트 + 스캔으로 잡힌 서브패스(`/dialog`·`/menu`·`/select` …)를 **하나의 esbuild 호출**로 굽는다. 따로 구우면 `dialog.js` 와 `menu.js` 가 각자 라이브러리 속살을 복사해 가져서, 중복을 창고 안으로 옮기기만 한다. **제대로 되면 서브패스 엔트리가 각 1KB 안팎**이고 실체는 공유 chunk 에 있다 — 이게 육안 확인 포인트다.
4. **leaf consumers**: react 계열 external + `REACT_REQUIRE_BANNER`(CJS `require('react')` → importmap 네임스페이스로 되돌림) 주입. `i18next` 는 standalone(셸 init 인스턴스를 앱의 react-i18next 가 공유). `@react-oauth/google` 은 ESM 이라 external 만.
5. **`minify: false`** — 산출물 육안 검증 가능하게.

> ⚠️ **default export 유무를 Node `import` 로 판정하지 말 것.** `exports` 필드가 없는 패키지는
> Node 가 `main`(CJS), esbuild 가 `module`(ESM) 을 골라 결론이 갈린다 — Node 는 interop 으로
> `default` 를 보지만 esbuild 는 없다며 빌드가 죽는다(`@react-oauth/google` 실측).
> 재노출 shim 은 `import * as __ns from '<pkg>'; export * from '<pkg>'; export default (__ns.default ?? __ns)`
> 형태로 쓰면 양쪽 다 안전하다.

> 산출물이 named 를 실제로 노출하는지 §14 에서 `preview` + node 링크 체크로 검증한다.

## 11. 통신 SDK (`src/shared/comms/` → `@desktop/sdk`)

앱은 `fetch`/`WebSocket` 을 **직접 만들지 않는다**. `@desktop/sdk` 의 3개 API 만 쓴다:

| API | 용도 | 현재 상태 |
|---|---|---|
| `client.request` | 요청/응답 | ✅ **HTTP fetch 로 구현** |
| `client.serverStream` | 서버 스트림(SSE) | ⛔ **미구현** — 호출 시 throw |
| `client.channel` | 채널(양방향, WebSocket) | ⛔ **미구현** — 호출 시 throw |

`src/shared/comms/` 에 SDK 를 두고 `@desktop/sdk` 별칭(`vite.config.ts` `resolve.alias`)으로 노출한다.
미구현 2 개는 `notImplemented()` 로 **명시적으로 던진다** — 조용히 no-op 시키지 말 것.

### 11-1. `client.request` — HTTP 트랜스포트 (현행)

`request(topic, payload)` = `POST {API_BASE}{topic}` (JSON 본문/응답).

- 성공/실패 판정은 **HTTP 상태코드**(`res.ok`)로 한다.
- 성공(2xx): 파싱한 본문을 그대로 반환. 본문 없으면 `{}`.
- 실패: `Error` 에 `{status, body}` 를 실어 throw.

**실패 응답 본문 형식은 고정하지 않는다.** RFC 9457 `application/problem+json` 일 수도, 자체 포맷일 수도 있다
— **서버 계약을 따른다**. SDK 는 본문을 파싱해 넘겨줄 뿐 **형식을 해석하지 않는다**(트랜스포트 계층 유지).

- 화면이 어느 필드를 표시할지는 **프로젝트에서 정해** `CLAUDE.md` 에 적는다(예: `detail` / `message` / `msg`).
- 원칙만 공통: **실패 문구는 서버가 준 값을 그대로 쓴다.** 화면이 지어내지 않는다
  (문구를 바꾸려면 화면이 아니라 서버를 고친다). 통신 자체가 끊긴 경우만 화면 문구로 대체.

### 11-2. ⚠️ `API_BASE` 는 반드시 상대경로

```ts
const API_BASE = '/api'                        // ✅
// const API_BASE = 'http://10.0.0.1:8080'     // ❌ 금지
```

절대주소는 두 겹으로 막힌다:

- **CORS** — API 서버가 `Access-Control-Allow-Origin` 을 안 주면 브라우저가 차단
  (실측 사례: protean 은 해당 헤더 없음 + 프리플라이트 `OPTIONS` **403**)
- **CSP** — 우리 `connect-src 'self'` 에 걸림

상대경로면 요청이 **화면이 떠 있는 출처**로 나가고, 그걸 앞단(dev = Vite, prod = 웹서버)이 API 서버로 넘긴다.
→ **화면 코드는 dev/prod 무변경.** 배포 위치가 바뀌어도 안 고친다.

> ⚠️ curl·PowerShell 로 200 이 나와도 브라우저에서 된다는 뜻이 아니다 —
> 그 도구들은 동일 출처 정책을 지키지 않는다. **반드시 브라우저로 확인**할 것.

### 11-3. dev — Vite proxy

```ts
server: {
  proxy: {
    '/api/xxx': { target: 'http://<A>:8080', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') },
    '/api':     { target: 'http://<B>:8080', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') },
  },
}
```

⚠️ **키 순서** — 더 구체적인 경로를 먼저 둔다. `/api` 를 위에 두면 전부 그쪽으로 먹힌다.
※ `preview.proxy` 는 `server.proxy` 를 상속한다 → `npm run preview` 에서도 그대로 동작(Vite 8 확인).

### 11-4. prod — 웹서버가 proxy 를 이어받는다

정적 호스트(nginx 등)에 배포할 때:

```nginx
location /api/ { proxy_pass http://<B>:8080/; }   # ← 끝 슬래시 필수 (<B> = 11-3 dev proxy 의 /api 대상과 동일)
location /     { try_files $uri $uri/ /index.html; }     # SPA 폴백
```

⚠️ `proxy_pass` **끝의 슬래시**가 `/api` 를 떼어낸다(Vite `rewrite` 와 같은 역할). 빼면 404.
⚠️ **루트 배포 전제** — `/vendor/*`·`/catalog/*` 가 절대경로다. 서브경로에 올리려면 `base` 설정 필수(§9·§10).

### 11-5. [향후] SharedWorker

여러 탭이 서버 연결 1 개를 공유하는 구조(전송 HTTP/2 + WebSocket). **구현체 없음.**
`serverStream`/`channel` 은 이게 생겨야 열린다.

- SharedWorker 는 **브라우저 안**에 있다 — 서버가 아니다. 따라서 **CORS/CSP 가 그대로 적용**되고,
  도입해도 §11-2 상대경로·프록시는 **여전히 필요**하다.
- 도입해도 **화면 코드는 무변경** — 창구 안쪽만 교체된다. 그게 SDK 로 감싼 이유다.

## 12. 폴더 구조

표준 배치를 잡는다(없으면 생성):

- `src/shared/` — `i18n/`, `comms/`, 공통 유틸/타입
- `src/apps/<id>/` — 카탈로그로 묶이는 외부 앱. 각 앱 폴더 = `manifest.json`(직렬화 메타 `id`·`name` 등) + 앱 진입 파일. **앱 진입 파일은 화면 컴포넌트를 `default` 로 export 한다**(셸이 자기 트리에서 직접 렌더 → `createRoot` 는 셸 하나뿐, 엔진 1개). 앱은 자기 `createRoot` 를 만들지 않는다. ⚠️ `mount` 라는 코드체 낱말을 쓰지 말 것 — 예전에 "함수 이름"으로 오독돼 엔진 2개 사고가 났다. 진입점·계약 상세는 `appcontext-architecture` 스킬. (§9-a/§9-b)
- `public/vendor/`·`public/apps/`·`public/catalog/` — 빌드 산출물(gitignore)
- `src/analytics.ts` — GA4

## 13. git 설정 — 사용자 선택

git 초기화는 **선택 영역**이다. `AskUserQuestion` 으로 사용 여부를 확정한다("예 — git 설정" / "아니오 — 생략"). **아니오면 건너뛴다.**

- 이미 git 저장소면(`.git` 있음) init 하지 않는다 — `.gitignore` 만 점검·보완한다.
- "예" 이고 저장소가 아니면 **일단 `git init` 과 `.gitignore` 만** 설정한다. 커밋·브랜치·원격 연결 등은 이 단계에서 하지 않는다(후속 작업/사용자 지시로).

```bash
git rev-parse --is-inside-work-tree 2>/dev/null || git init
```

`.gitignore` — 스캐폴드가 만든 것(있으면)에 이 프로젝트 산출물을 보완한다(중복 금지). 최소 포함:

```gitignore
node_modules/
dist/
public/vendor/     # build:vendor 공유 번들 산출물(§10)
public/apps/       # build:apps 산출물(§9-a)
public/catalog/    # build:catalog 산출물(§9-b)
.env
.env.*
*.local
```

> 커밋 규칙·브랜치 네이밍은 이 스킬 범위 밖이다 — 실제 커밋 단계에서 **규칙 정본**을 따른다.
> 정본 기본 위치: `~/.claude/rules/git-commit-message-rule.md` · `git-branch-name-rule.md`.
> **포인터는 프로젝트 `CLAUDE.md` 에 둔다**(§15) — 전역·프로젝트 CLAUDE.md 는 합쳐져 로드되지만,
> 프로젝트 파일은 사람도 읽는 문서라 규칙 위치가 거기 적혀 있어야 한다.
>
> ⚠️ 정본이 `~/.claude/`(개인 홈)에 있으면 **레포를 클론한 사람에게는 따라가지 않는다**.
> 팀과 공유해야 하는 레포면 규칙 문서를 `<프로젝트>/.claude/rules/` 로 옮기고 포인터 경로를 그쪽으로 바꾼다.

## 14. 검증

```bash
npx tsc -b                 # 타입 (project references)
npm run lint               # eslint .
npm run build              # 전체 파이프라인(tsc -b → vendor → apps → catalog → vite build)
npm run dev                # 개발 서버 기동 확인
npm run preview            # ⚠️ prod 프리뷰 — 셸(external)일 때 vendor named-export 링크 에러는 여기서만 드러난다(§10)
```

**셸(§1-0)일 때 preview 검증 게이트 (필수)**

- `npm run preview` 로 뜬 주소를 **브라우저(chrome-devtools)로 열어** 콘솔을 확인한다 — 아래가 **전부 0건**이어야 통과:
  - `does not provide an export named '...'` (vendor named-export 소실)
  - `Calling require for '...'` / `Dynamic require` (Rolldown require)
  - `Cannot read properties of null (reading 'useState')` / `createRoot ... undefined` (react 다중 인스턴스)
  - 흰 화면(#root 비어 있음)
- vendor 통합 번들이 react·react-dom named 를 노출하는지 즉석 체크:
  ```bash
  node --input-type=module -e "import {useCallback,createRoot} from './public/vendor/react.js'"   # 에러 없이 통과해야 함
  ```
- **dev 만으로 끝내지 말 것** — external/importmap 실패는 `preview`(prod)에서만 드러난다.

기타:
- shadcn MCP `get_audit_checklist` 로 컴포넌트 점검(named vs default import, 의존성, 렌더링).
- 전부 통과하면 프론트 기반 완료. 이후 실제 화면/앱 개발로 넘어간다.

## 15. 프로젝트 CLAUDE.md 작성 (선택 결과 → 개발룰)

마지막으로, **이 스킬에서 사용자가 선택한 결과**를 모아 프로젝트 루트에 **`CLAUDE.md`**(개발룰 진입점)를 만든다. 앞 단계의 결정들을 "다음 세션이 바로 읽고 따르는 규칙"으로 굳히는 작업이다.

### 무엇을 담나 — 선택 결과 반영

이 스킬에서 확정된 값만 채운다(고르지 않은 영역은 넣지 않는다):

- **배포 형태**(§1-0): 셸 / 앱. 셸이면 external 정책(VENDOR_EXTERNAL 게이트 기본값)·preview 검증 필수를 명시.
- **프레임워크**: Vite / Next.js(§1) — Next 면 **렌더링 디폴트**(§1-2: SSG/ISR/SSR/CSR)와 라우트별 오버라이드 규칙.
- **shadcn 표준**(§3): 라이브러리(base/radix), `style`, `baseColor`, `@/` 별칭, `components.json` 위치.
- **폰트**(§4): Geist(+Raleway) / Next 면 `next/font`.
- **설치된 UI 라이브러리**(§5): 실제로 넣은 것만(미룬 것은 "후속" 으로 표기).
- **i18n**(§6): 사용 시 지원 로케일 목록·fallback·리소스 경로(`src/shared/i18n/`). 미사용이면 생략.
- **인증/애널리틱스**(§7): 사용 시 Google OAuth·GA4 규칙(시크릿은 env, GA4 CSP/localhost 가드). 미사용이면 생략.
- **린트**(§8): ESLint 10 flat config / Next 면 eslint-config-next.
- **아키텍처 규칙**(Vite 표준): 빌드 파이프라인(§9, minify:false·정해진 레시피), importmap 공유·단일 인스턴스(§10, 셸 전용), 통신 SDK 3-API(§11, `fetch`/`WebSocket` 직접 금지). Next 면 부록 C 기준으로 대체.
- **폴더 구조**(§12) 와 **명령어**(§14: dev/build/lint/typecheck/preview).
- **커밋·브랜치 규칙**(§13) — git 을 설정했으면 **반드시 넣는다**. 단 규칙 **본문은 복붙하지 말고 정본 포인터**만:

  ```markdown
  ## 커밋·브랜치 규칙

  커밋하거나 브랜치를 만들기 전에 **반드시** 아래 정본을 읽고 따른다. 형식을 추측으로 지어내지 않는다.

  - 커밋 메시지 → `~/.claude/rules/git-commit-message-rule.md`
  - 브랜치 네이밍 → `~/.claude/rules/git-branch-name-rule.md`

  - 커밋 `type` 과 브랜치 접두사는 **정합**해야 한다(feat/fix/docs/style/refactor/test/chore/perf)
  - `Co-Authored-By` 는 **그 머신의 `git config user.name` / `user.email`** 값을 쓴다
  - 변경이 여러 type 에 걸치면 **type 별로 커밋을 나눈다**
  ```

  정본 경로는 실제 설치 위치에 맞춘다(전역 `~/.claude/rules/` 가 기본. 팀 공유 레포면 `.claude/rules/` — §13 경고 참고).

### 작성 원칙

- **얇게 유지**: CLAUDE.md 는 매 세션 로드된다 — 코드로 자명한 것(파일 목록·의존성 버전)은 넣지 말고, **비자명한 규칙·컨벤션·경계**만 적는다. 상세 절차는 이 스킬/문서를 가리킨다.
- **선택만 반영**: 안 고른 기능(i18n/auth/GA4 등)은 항목 자체를 넣지 않는다 — "쓰면 이렇게" 식 사족 금지.
- **시크릿·프라이빗 금지**: 측정 ID/클라이언트 ID 등은 env 를 가리키고 값 자체는 박지 않는다. 내부 서버 주소·계정·개인 워크플로우 등 프라이빗 정보는 넣지 않는다(레포가 public 이 될 수 있음).
- **기존 CLAUDE.md 존중**: 이미 있으면 덮어쓰지 말고 이 프로젝트 섹션만 병합·보완한다.
- 커밋 규칙·브랜치 네이밍은 **본문을 복붙하지 말고 포인터만** 둔다(§13).
  예: `커밋 메시지 → ~/.claude/rules/git-commit-message-rule.md · 브랜치 → git-branch-name-rule.md`
  정합성(커밋 type ↔ 브랜치 접두사) 같은 **핵심 2~3줄**까지는 적어도 되지만, 표·전체 목록은 정본에 맡긴다.

### 마무리

- 작성 후 사용자에게 **핵심 요약**(배포 형태/프레임워크/렌더링/shadcn 표준/켠 기능)을 알리고, 빠진 규칙이 있으면 보완받는다.
- 이로써 `create-frontend` 완료 — 이후 개발은 이 CLAUDE.md 규칙 위에서 진행한다.

---

## 부록 A — scaffold-shadcn-app 과의 경계

| 항목 | 담당 |
|---|---|
| Vite+React+TS 프로젝트 생성 | **scaffold** (제외) |
| Tailwind v4 설치·`@import` | **scaffold** (제외) |
| `@/` 별칭(vite+tsconfig) | **scaffold** (제외) |
| shadcn init·기본 컴포넌트 add | **scaffold** (제외) |
| 배포 형태(셸/앱) 선택 | **create-frontend** (§1-0) |
| Next.js 사용 여부 분기 | **create-frontend** |
| shadcn **프로젝트 표준**(style/baseColor 확정) | **create-frontend** |
| 폰트(Raleway 추가)·추가 UI 라이브러리 | **create-frontend** |
| i18n·auth/analytics·ESLint 10 | **create-frontend** |
| 빌드 파이프라인·importmap 공유·통신 SDK | **create-frontend** |
| git 설정·폴더 구조 | **create-frontend** |
| 선택 결과 → 프로젝트 CLAUDE.md 작성 | **create-frontend** |

## 부록 B — 표준 스택 요약 (이 스킬의 내부 SSOT · 버전은 실행 시 재조회)

- 코어: React 19 · TS 6(project refs) · Node ESM
- 빌드: Vite 8 · esbuild · @tailwindcss/vite · cross-env · react-compiler(비활성)
- 스타일/UI: Tailwind v4 · @base-ui/react · shadcn(base-vega/olive) · cva · clsx+tailwind-merge · lucide · tw-animate-css · Geist+Raleway
- UI 라이브러리: resizable-panels · tanstack-virtual · cmdk · sonner · vaul · input-otp · embla · day-picker · big-calendar+date-fns · react-live · html2canvas-pro
- i18n: i18next 26 · react-i18next 17 (ko/en/ja/zh)
- 인증/분석: @react-oauth/google(external, 셸일 때) · GA4
- 배포 형태: **셸(host) / 앱(self-contained)** — external 정책 결정(§1-0)
- 아키텍처(셸): importmap external(VENDOR_EXTERNAL 게이트) · **external 목록은 손으로 적지 않고 `src/**` 스캔으로 생성(§10-0)** · **vendor named-shim(동적 Object.keys)+code splitting** · **서브패스 패키지도 splitting 으로 한 번에** · `esmExternalRequirePlugin` · **minify:false(비압축)** · prod CSP · **preview 렌더 검증 필수**
- 통신: `@desktop/sdk` — **`client.request` = HTTP fetch(`POST {API_BASE}{topic}`, `API_BASE='/api'` 상대경로)**.
  `serverStream`/`channel` 미구현. SharedWorker 는 [향후](§11-5)

## 부록 C — Next.js 경로

§1 에서 **Next.js "예"** 를 고른 경우의 경로. 본문 §2~§14 는 Vite 기준이므로, 여기서 **무엇이 대체되고 무엇이 그대로인지**를 단계별로 매핑한다. 버전은 여전히 실행 시 `npm view`/CLI 최신으로 조회한다.

> ⚠️ **셸 아키텍처는 Next 에 적용하지 않는다.** 본문 §10(importmap external → `/vendor/*.js` 단일 인스턴스)·§9(esbuild 다단계 빌드)는 **Vite 전용 데스크톱 셸 아키텍처**다. Next.js 는 자체 번들러·빌드를 쓰므로 이 두 단계는 **건너뛴다**. 즉 Next.js 경로는 "우리 표준 셸"이 아니라 **공개/SEO 지향 앱**을 위한 갈래다(§1-1 참고).

### C-1. 스캐폴딩 (Next 는 scaffold-shadcn-app 을 쓰지 않는다)

`scaffold-shadcn-app` 은 Vite 전용이다. Next.js 는 별도로 깐다:

```bash
npm view create-next-app version        # 최신 알림
npx create-next-app@latest              # App Router · TypeScript · Tailwind · ESLint · @/ 별칭 = 예
```

- **App Router**(`app/`), **TypeScript**, **Tailwind(v4)**, **src/ 디렉터리**, **`@/*` 별칭** 을 모두 예로 잡는다.
- 이어서 shadcn 초기화:
  ```bash
  npx shadcn@latest init         # 프레임워크=Next 자동 감지
  ```
  - **Tailwind v4**: `components.json` 의 `tailwind.config` 는 **빈 문자열**(`""`)로 둔다(v4 는 config 파일 없음).
  - `components.json` 에 **`"rsc": true`**(App Router + Server Components), `"css": "app/globals.css"`(또는 `src/app/globals.css`), `baseColor`.
- 그 뒤 §3 의 **프로젝트 표준(style/baseColor)** 은 그대로 적용 — 다만 재init 명령은 `-t vite` 대신 **`-t next`**.

### C-2. 본문 단계 매핑 (Vite → Next)

| 본문 | Next 대응 |
|---|---|
| §1-0 배포 형태 | Next 는 사실상 "앱(자기완결/SSR)" 경로 — 셸(importmap external)은 적용 안 함. |
| §2 전제 점검 | 검사 대상이 다르다: `components.json` + `app/globals.css` 의 `@import "tailwindcss"` + `lib/utils.ts` + `tsconfig.json` 의 `@/*`. (`tsconfig.app.json`·`src/index.css` 는 Next 에 없음) |
| §3 shadcn 표준 | 동일. 단 `rsc: true`, 재init 은 `-t next`. |
| §4 폰트 | `@fontsource-variable/*` 도 되지만 Next 는 **`next/font`**(자동 최적화·CLS 방지)가 표준. Geist 는 `next/font/google` 의 `Geist`, Raleway 도 `next/font/google`. `app/layout.tsx` 에서 로드해 `<html className={...}>`. |
| §5 UI 라이브러리 | 목록 동일. **인터랙티브/브라우저 API 컴포넌트(cmdk·embla·resizable-panels·react-live·big-calendar·vaul)는 `"use client"`** 가 필요. shadcn 래퍼는 이미 처리돼 있음. |
| §6 i18n | 패턴이 다르다: App Router 는 `middleware.ts` + `app/[locale]/` 세그먼트로 로케일 라우팅(또는 `next-intl`). i18next 도 쓰지만 server/client 경계를 나눠 초기화. 로케일 **선택 UX(6-1/6-2)** 는 동일. |
| §7-1 OAuth | `@react-oauth/google` 은 클라이언트 전용 → `"use client"` 프로바이더로 감싼다. **external/vendor 공유(§10)는 적용 안 함**(Next 가 번들). 서버 세션이 필요하면 NextAuth/Auth.js 대안 고려를 사용자에게 안내. |
| §7-2 GA4 | CSP 를 `vite.config.ts` 가 아니라 **`next.config` 의 `headers()`**(또는 `middleware`)로 준다. gtag 은 인라인 스니펫 대신 **`@next/third-parties` 의 `<GoogleAnalytics gaId=... />`** 를 `app/layout.tsx` 에 두는 게 표준(localhost 가드는 env 로 조건부 렌더). no-op 폴백·측정ID env·CSP bare+와일드카드 원칙은 동일. |
| §8 린트 | Next 는 **`eslint-config-next`** 를 쓴다(flat config 에 `next` 플러그인 포함). oxlint 교체 이슈 없음 — create-next-app 이 ESLint 로 깐다. |
| §9 빌드 파이프라인 | **건너뛴다.** `next build`/`next dev`/`next start` 가 대체. esbuild vendor/apps/catalog·cross-env·react-compiler 수동 구성 불필요(react-compiler 는 `next.config` 옵션으로 켬). |
| §10 공유 아키텍처 | **건너뛴다.** importmap external·`/vendor/*.js` 단일 인스턴스는 Vite 셸 전용. |
| §11 통신 SDK | `client.request`(fetch)는 그대로 쓰되 **`"use client"`** 경계에서만 — 상대경로 `/api` 는 브라우저에서만 해석되므로 **서버 렌더 경로에서 호출 금지**(SSR 에서 부르려면 절대주소가 필요해 §11-2 원칙이 깨진다). dev proxy 는 `next.config` 의 `rewrites` 로 대체. 나중에 SharedWorker(§11-5)를 도입해도 **SSR 불가**는 동일 — 클라이언트 컴포넌트에서 `useEffect`/동적 import 로 초기화. |
| §12 폴더 구조 | `src/apps/` 대신 App Router 의 `app/` 라우트 트리. `src/shared/`(i18n·comms·유틸)는 유지. `public/vendor/` 없음. |
| §13 git | 동일. `.gitignore` 에 `public/vendor/` 대신 **`.next/`** 를 넣는다(create-next-app 이 이미 넣어줌 — 중복 금지). |
| §14 검증 | `next lint` · `next build` · `next dev`(기본 3000 포트). `tsc --noEmit` 로 타입 체크(Next 는 project-references 아님). preview 게이트 불필요(external 미사용). |
| §15 CLAUDE.md | 동일하게 작성하되 프레임워크=Next, 렌더링 디폴트(C-3), 빌드/명령어(`next build`/`next dev`), §9·§10 미적용을 반영. |

### C-3. 렌더링 방식 구현 (§1-2 선택 반영)

App Router 는 **라우트/세그먼트 단위**로 렌더링을 정한다. 1-2 에서 고른 디폴트를 아래 코드로 반영하고, 예외 라우트만 개별 지정한다.

| 선택 | App Router 구현 |
|---|---|
| **SSG** | 기본값. 동적 세그먼트는 `generateStaticParams()` 로 빌드 타임 경로 생성. 동적 API(cookies/headers) 쓰면 정적에서 빠지므로, 강제하려면 `export const dynamic = 'force-static'`. |
| **ISR** | 세그먼트에 `export const revalidate = <초>` (또는 `fetch(url, { next: { revalidate: <초> } })`). 캐시된 정적 페이지를 주기적으로 백그라운드 재생성. |
| **SSR** | `export const dynamic = 'force-dynamic'` (또는 `export const revalidate = 0`). 매 요청 서버 렌더 — 쿠키·인증 사용자·매번 최신 데이터에. |
| **CSR** | 컴포넌트 최상단 `"use client"` + `useEffect`/SWR/TanStack Query 로 클라이언트 페치. **SSG/ISR 페이지 안의 위젯**으로 한정(페이지 전체 기본값으론 비권장). |

- 캐싱 계층(Request memoization / Data Cache / Full Route Cache / Router Cache)을 사용자에게 간단히 안내하고, 디폴트와 다른 라우트는 위 export 로 개별 오버라이드한다.
- `force-static` + ISR 혼용 제약(런타임 재검증하려면 `generateStaticParams` 빈 배열 반환 등)은 Next 공식 문서 기준으로 확인한다.

> 출처(실행 시 최신 재확인): shadcn Next 설치 문서, Next.js App Router 렌더링/캐싱 문서.
