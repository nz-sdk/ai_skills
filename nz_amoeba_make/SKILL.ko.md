[English](SKILL.md) | **한국어**

> 사람이 읽기 위한 번역본입니다. **스킬이 실제로 실행하는 파일은 [SKILL.md](SKILL.md)** 이며, 내용이 어긋나면
> 그쪽이 기준입니다. `SKILL.md` 를 고치면 이 파일도 함께 갱신해야 합니다.
> 이 파일에는 프론트매터가 없습니다 — 스킬로 중복 등록되지 않게 하기 위한 것입니다.
> 식별자에 해당하는 것(속성 키·값·클래스/파일명·좌표·환경변수명·명령어·capability id·플레이스홀더 토큰)은
> 번역하지 않고 원문 그대로 둡니다.

## 스킬 메타데이터

| 항목 | 값 |
|---|---|
| `name` | `nz_amoeba_make` |
| 표시 이름 | Amoeba Maker |
| `description` | `prototype/<name>` 아래에 실행 가능한 Protean 소비 샘플 서버를 처음부터 스캐폴딩한다. **Protean 옵션 표면 전체**(모든 `protean.*` 설정 + 모든 소비자 확장 지점 + 데이터베이스 서브플로우)를 사용자와 함께 훑고, 그에 맞는 build·config·code·infra·README 를 생성한다. Protean 을 모르는 사용자를 위해 만들어졌다 — 어떤 설정이든 기본값과 평이한 설명을 곁들여 스킬을 통해 구성할 수 있다. 새 Protean 샘플/예제 서버를 만들거나, capability 를 시험해 보거나, 다운스트림 Protean 통합을 부트스트랩할 때 사용한다. 트리거: "make a protean sample", "scaffold a protean server", "new protean example", "protean sample 만들어" |

# Amoeba Maker

게시된 `org.htcom:protean` jar 에 의존하는 자립형 Protean 소비 서버(Spring Boot 앱)를 `prototype/<name>/` 아래에
생성한다. 사용자가 선택한 capability 와 설정이 그대로 반영된다.

사용자는 Protean 을 모를 수 있으므로, **모든** `protean.*` 설정과 **모든** 소비자 확장 지점이 이 스킬을 통해
도달 가능해야 한다 — 각각 합리적인 기본값과 한 줄 설명을 갖춰서. 몇 가지만 골라 노출하지 말 것. 전체 카탈로그는
데이터로 관리된다:

- **`reference/protean-options.yaml`** — 모든 `protean.*` 키: 타입, 기본값, 허용값, 설명, `requires`(강제되는
  동반 옵션), `requires_when`(사용자가 값을 제공해야 하는 조건부 요구 — 미충족 시 차단), `build_deps`,
  `fragment`. **이 파일을 훑어 질문과 생성을 구동한다.**
- **`reference/db-vendors.yaml`** — 데이터베이스 서브플로우(벤더 + 기존 서버/docker/임베디드).
- **`reference/auth-stores.yaml`** — `embedded_auth` capability 의 사용자 저장소 서브플로우(`memory` | `jdbc`).
  `db-vendors.yaml` 이 `subflow: db` 로 도달되는 것과 똑같이 `subflow: authstore` 로 도달한다.
  **`embedded_auth` 는 토큰 서명 키를 MCP RCE 표면 안에 두게 된다** — 제시할 때 그 `security` 노트를 그대로
  인용하고, 절대 기본값으로 제시하지 말 것.
- **`reference/protean-capabilities.md`** — 사람이 읽는 서술 + 8가지 등록 메커니즘(배경 지식).
- **`templates/`** — 파일 템플릿 + capability 별 코드 프래그먼트 + 벤더별 DB 템플릿.

규칙: 모든 것을 템플릿에서 생성한다(기존 샘플이 없다고 가정). 생성되는 모든 산출물은 **영어**다(## 언어 참조).
요청받지 않았다면 아무것도 실행·배포하지 말고, 실행/검증 명령을 출력하며 끝낸다.

## 언어

**사용자와는 한국어로 대화하고, 생성되는 프로젝트는 영어로 쓴다.** 독자가 둘이기 때문이다 — 지금 옵션을
고르는 사람과, 나중에 저장소를 읽는 사람.

**한국어** — 세션 중에 말하는 모든 것: 질문 문구, 선택지 라벨과 그 설명, 그룹·단계 제목, 진행 표시("적용 가능한
확장 기능 7개 중 1/2"), 검증 리포트(OK / 경고 / 차단), 최종 확정 구성 echo, 그리고 실행/검증 명령을 둘러싼 서술.

**절대 번역하지 않고 원문 그대로 인용하는 것** — `protean.*` 속성 키, 그 값·enum 멤버·기본값, 클래스·파일·
디렉토리명, Maven 좌표, 환경변수명(`OAUTH_ISSUER_URI`, `SERVER_PORT`, …), 셸 명령, URL, 그리고 capability `id`.
`격리 모드` 라고 안내받은 사용자도 결국 yaml 에서 `protean.isolation.mode` 를 찾아야 한다 — 설명을 옮기되
식별자는 절대 옮기지 말 것.

**참조 데이터는 영어로 유지한다.** `protean-options.yaml` 과 `db-vendors.yaml` 의 `desc` / `note` / `title` 은
`ProteanProperties.java` 와 `docs/guide/03-configuration.md` 에서 파생된 것이라, 라이브러리가 바뀔 때 protean 과
대조 가능한 상태로 남아야 한다. 읽어서 질문 시점에 한국어로 *옮겨 제시*할 뿐, 그 파일들을 한국어로 고치지 말 것.

**생성 산출물은 영어로 유지한다** — Java 소스와 그 주석, `application.yml`, `README.md`, `setup.sh`. 이 언어
규칙은 대화만 규율하며 그것을 덮지 않는다. 샘플은 protean 자신의 영문 문서를 읽는 사람들과 공유된다.
(참고: 이 `SKILL.ko.md` 같은 스킬 문서의 번역본은 산출물이 아니라 스킬 문서이므로 이 규칙의 예외가 아니다.)

사용자가 다른 언어로 말을 걸면 그 언어를 따른다. 한국어는 기본값일 뿐, 사용자에게 강제하는 제약이 아니다.

## 입력 방식 (중요)

- **자유 입력(타이핑)** — 사용자가 값을 *직접 입력*한다. 절대 선택지 목록으로 만들지 말 것. 해당하는 것:
  폴더명, **Java 패키지**, 좌표/버전, 그리고 모든 **이름/경로/식별자**(커스텀 툴 이름, 클래스명, DB
  host/db/user/password, 커스텀 벤더의 드라이버 좌표/URL). 받아들일 수 있는 기본값을 제시하되, 답은 사용자의
  텍스트다.
- **선택** — 정해진 집합에서 고르는 것. 선택지로 제시한다(격리 모드, 설정 on/off, DB 벤더, 연결 방식, enum 값).

애매하면(이름/경로/식별자 성격의 값이면) → 자유 입력으로 취급한다.

두 방식 모두 **한국어로 묻는다** — 프롬프트와 기본값 설명 모두. 사용자가 입력한 텍스트는 그 자체로 받아들이며,
입력된 이름·경로·비밀번호를 번역하거나 정규화하지 말 것.

## 흐름 (Flow)

### 1. 대상 폴더 + Java 패키지 (타이핑)

타이핑 입력 2개 — 여기서 **둘 다** 묻는다(각각 사용자가 입력한다. 기본값 제시는 허용하되, 이름 목록을 제시하지는
말 것).

1. **폴더명** — `[a-z0-9_-]+` 검증. `prototype/<name>/` 아래에 생성하고, 이미 존재하면 거부한다.
2. **Java 패키지** — 기본값 `prototype.<name>`(`-`→`_` 치환). 사용자는 어떤 패키지든 입력할 수 있다
   (예: `kr.newzen.amoeba.api`). 검증: 점으로 구분된 각 세그먼트가 `[a-z_][a-z0-9_]*` 를 만족하고, 어떤
   세그먼트도 Java 예약어가 아닐 것. 이 값이 `{{PKG}}` 가 되고, `{{PKG_PATH}}` 는 `{{PKG}}` 의 `.`→`/` 다.

### 2. 좌표 / 버전 (타이핑) + maven-central 확인

좌표/버전을 **입력**하게 한다(기본값 `org.htcom:protean:0.0.1` — 2026-08-09 부터 Maven Central 에 올라간 릴리스
버전). 그다음 의존성 출처를 판단한다:
- `-SNAPSHOT` → Central 은 스냅샷을 호스팅하지 않는다 → **mavenLocal 경로**. protean 저장소에서 먼저
  `./gradlew publishToMavenLocal` 하라고 안내한다.
- 그 외에는 probe: `curl -sfI https://repo1.maven.org/maven2/org/htcom/protean/<ver>/protean-<ver>.pom` → 2xx 면
  **Central 경로**, 실패면 mavenLocal 경로.

생성되는 `build.gradle` 은 어느 쪽이든 두 저장소를 모두 나열한다. 이 확인은 출력하는 안내 문구만 좌우한다.

### 3. 핵심 결정 (선택)

나머지 전부의 형태를 좌우하는 몇 가지를 묻는다:
- **격리 모드** — `protean.isolation.mode`: in-process / worker / container.
- **MCP 표면** — `protean.mcp.enabled` on/off.
- **MCP OAuth** — `/platform/**` 을 OAuth2 Resource Server 로 보호할지? (MCP 가 켜졌을 때만 묻는다.) 예 ⇒
  `secured_mcp` capability 를 선택한 것과 동일하다. `mcp.authorization.resource` 를 묻게 되고, 그것이 step 7 의
  JWT issuer 프롬프트로 연쇄되며 security starter 를 끌어온다. 아니오 ⇒ MCP 표면이 열려 있는 상태 — 로컬 데모
  전용이며, README 가 그 사실을 반드시 밝혀야 한다.
- **데이터 접근** — 모듈이 데이터베이스를 필요로 하는가? (예 → step 4 의 DB 서브플로우. in-process 로 강제됨.)
- **Gate 프로파일** — strict(`tests`+`review` on, 기본) / relaxed(`review` off) / custom(게이트를 각각 설정).

### 4. 데이터베이스 서브플로우 (데이터 접근 = 예 일 때만)

`reference/db-vendors.yaml` 을 따라 구동한다:

1. **벤더** (선택, 타이핑 "other" 포함): `mysql` / `postgresql` / `h2` / other.
2. **연결 방식**:
   - 서버 기반(mysql/postgresql): **existing**(사용자가 host/port/db/user/password 를 *입력* → datasource 만,
     compose 없음) 또는 **docker**(벤더 템플릿에서 `docker-compose.yml` + `init/01-schema.sql` 생성).
   - `h2`(임베디드): `mem` 또는 `file` 을 묻는다 — 서버도 docker 도 없음. `src/main/resources/schema.sql` 을 쓴다.
   - other: 사용자가 드라이버 Maven 좌표, driver-class-name, JDBC URL, user/password 를 *입력* → datasource +
     드라이버 의존성만, compose 없음.

데이터 접근은 `protean.isolation.mode=in-process` 를 강제한다(worker/container 를 골랐다면 경고할 것 — 그 모드는
호스트 빈을 주입할 수 없다).

### 5. 확장 capability (opt-in 선택)

`protean-options.yaml` 의 `capabilities:` 중 이 구성이 `requires` 를 만족시킬 수 있는 **모든** 항목을 제시한다 —
커스텀 MCP 툴(이름 입력), 내장 툴 오버라이드, 커스텀 `CodeRule`, `ModuleActionAuthorizer`,
`ModuleUnloadCallback`, 커스텀 `DbDialect`, 커스텀 `ModuleStoreDialect`, **secured MCP control plane**,
**interface spec validator**. 각 항목의 `requires` 를 적용한다(예: 커스텀 툴 → `mcp.enabled` 강제).

대부분은 `fragment` 를 떨어뜨리지만, **전부가 그렇지는 않다 — 목록을 fragment 가 있는 항목으로 줄이지 말 것.**
`fragment` 가 없는 capability 는 *관문*이다. `secured_mcp` 는 사용자가 step 6 에서 `advanced` 키
`mcp.authorization.resource` 를 찾아내야 하는 대신 여기서 "MCP 표면을 보호한다"를 고를 수 있게 존재하며, 그
`requires` 의 bare key 는 그 값을 물어야 함을 뜻한다(그것이 다시 step 7 의 JWT issuer 프롬프트를 강제한다).
`scope_admin` 은 문서화 전용이다. 어떤 항목은 대신 **`fragment_bundle`**(여러 파일을 서브패키지로)을 가질 수
있는데, 나머지와 똑같이 제시한다. capability 가 간접적으로 가리키는 fragment 를 다시 내보내지 말 것 —
`secured_mcp` 는 옵션을 통해 `SecurityConfig` 를 끌어오므로 한 번만 내보내는 것이 맞다.

**둘은 step 3 에서 이미 결정됐다 — 여기서 다시 묻지 말 것:** `data_access`(step 3 의 "데이터 접근")와
`secured_mcp`(step 3 의 "MCP OAuth"). step 3 의 답을 그대로 관통시킨다 — MCP OAuth 에 예라고 했으면 여전히
`mcp.authorization.resource` 를 묻고 step 7 의 issuer 프롬프트로 연쇄된다. 여기서 골랐을 때와 똑같이.

**`options:` 를 가진 capability 는 그것까지 걸어야 끝난 것이다.** 설정 네임스페이스를 통째로 소유한 capability 는
그것을 group 과 **같은 레코드 형태**의 `options:` 목록으로 선언하며, 그 키들은 **여기서** 묻는다 — step 6 은
`groups:` 를 걷고 이것들은 group 이 아니므로, 여기서 건너뛰면 **영영 묻지 않게 된다**. 규칙은 step 6 과 같다:
옵션마다 **전체 프로퍼티 키 + 기본값**을 표시하고, `desc` 만 한국어로 옮기고, 질문당 4개 이하로 쪼개고,
`advanced`/`requires`/`requires_when` 을 지킨다. 같은 capability 가 `subflow:` 도 선언했다면 **그것을 먼저** 돌려
서브플로우의 답이 이미 정해진 뒤에 옵션을 묻는다.
현재 해당하는 것은 `embedded_auth` 다: `subflow: authstore` 로 사용자 스토어를 고른 뒤, 6개 `options:` 가
`amoeba.auth.*` 의 나머지를 덮는다 — 토큰 수명, 서명키 경로, 클라이언트 등록 2건. `enabled`/`store`/`users` 는
이미 정해져 있으므로(선택 자체와 서브플로우로) 그 셋만 묻지 않는다.

AskUserQuestion 은 질문당 선택지 4개가 상한이므로, 나누기를 즉흥적으로 하지 말고 **결정적으로** 제시한다 —
그것이 항목이 조용히 사라지는 것을 막는 장치다:

1. `capabilities:` 를 **파일 등장 순서대로** 훑어, 이 구성이 `requires` 를 만족하는 것만 남긴다.
2. `data_access` 와 `secured_mcp` 를 뺀다(step 3 에서 결정됨).
3. 남은 것을 **4개씩 끊어 그 순서대로** 묻는다.
4. **총 개수와 현재 위치를 미리 밝힌다** — "여기 적용 가능한 확장 기능 — 7개 중 1/2". 개수를 밝히지 않으면
   사용자는 아직 남은 것이 있는지 알 수 없고, 그것이 누락을 막는 유일한 실질적 장치다.

워크드 예시, in-process + MCP 활성(흔한 경우): 7개가 남는다 — `custom_mcp_tool`, `builtin_tool_override`,
`module_source_tools`, `code_rule`, `authorizer`, `interface_spec_validator`, `unload_callback` → 두 질문, 4 + 3.
(`db_dialect`/`scope_admin` 은 `worker.db.auto-provision` 이 필요하고 `module_store_dialect` 는 jdbc
module-store 백엔드가 필요하므로, 셋 다 걸러진다.)

여기 적힌 숫자를 믿지 말고 yaml 을 세라 — capability 가 추가될 때마다 개수가 움직이고, 낡은 총계는 바로 규칙 4가
막으려는 그 실패다.

### 6. 고급 옵션 — 표면을 기능 GROUP 단위로 하나씩 훑는다 (대화형)

이 단계가 걷는 것은 **`groups:` 뿐이다.** capability 자신의 `options:`(예: `embedded_auth` 의 `amoeba.auth.*`)는
그 키를 소유한 capability 와 함께 step 5 에서 이미 물었다 — `data_access`·`secured_mcp` 를 step 5 에서 다시 묻지
않는 것과 같은 이유로, 여기서 다시 묻지 않는다.

표면을 건너뛰는 "기본값 전부 수용" 단축 경로를 제시하지 말고, 몇 개 그룹만 표본으로 다루지도 말 것.
`protean-options.yaml` 의 **적용 가능한 모든 그룹을 훑는다**. 한 번에 한 그룹씩, 각각 그룹 이름을 머리에 달아서 —
그룹이 기능 단위(`ProteanProperties` 중첩 클래스)이기 때문이다. 각 그룹의 옵션은 그 그룹 안에 유지한다(trace
옵션은 "trace" 질문에, mcp 는 "mcp" 에). 여러 그룹을 한 질문 세트에 섞지 말 것.

적용 가능한 그룹, 순서대로 — 전부 다룬다:
`admin` → `mcp`(하위 옵션 + `debug`/`session`/`authorization`) → `bridge` → `gate`(세부: approval, signature) →
`module`(+ `executor`) → `reconcile` → `module-store` → `trace`(+ `metrics`) → `worker`
(+ `container`/`db`/`sidecar`/`admin-auth`) **격리 모드가 worker/container 일 때만**(아니면 전체 생략)
→ **`module_classpath`**(항상).
(`isolation` 과 gate on/off + `mcp.enabled` + MCP OAuth 는 step 3 에서 정해졌다. 다시 묻지 말 것.)

**`module_classpath` 는 `protean.*` 그룹이 아니다.** 파일의 세 번째 최상위 섹션이며, **배포된 모듈을 위해**
호스트에 존재해야 하는 jar 들이다 — 모듈은 소스로 배포되고 `RuntimeCompiler` 가 `java.class.path` 를 상속하기
때문이다. 엔트리는 `id` 로 키잉되고 `build_deps` 만 가지며, **`application.yml` 키를 절대 쓰지 않는다** —
`protean:` 아래에 주입하지 말 것. 마지막에 "배포할 모듈이 import 할 수 있는 것" 이라는 머리를 달아 제시해,
라이브러리를 설정하는 질문과 다른 성격임을 사용자가 알 수 있게 한다.

그룹별로: 옵션을 제시하고(각각 전체 속성 키 + 기본값 + 설명을 보여주며, 필요하면 4개 이하 질문으로 쪼갠다) 값을
수집한 뒤 다음 그룹으로 넘어간다. 사용자가 그룹을 통째로 건너뛸 수는 있지만, 적용 가능한 모든 그룹을 제시해야
한다 — 몇 개 하고 멈추지 말 것.

**사용자에게 보이는 모든 옵션은 전체 속성 키를 반드시 표시한다.** 형식:
`protean.<group>.<key> — <desc> (default: <default>)`. 키는 `protean-options.yaml` 의 레코드 키다.
**`<desc>` 부분만 한국어다** — 키와 기본값은 yaml 에 있는 그대로 인용한다. 사용자가 `application.yml` 을 열어
검색할 문자열이 바로 그것이기 때문이다. `advanced: true`(여기서만 노출)와 각 옵션의 `requires` 를 존중한다.
(AskUserQuestion 은 질문당 4개가 상한 — 키가 4개를 넘는 그룹은 여러 질문/호출로 쪼갠다.)

**boolean 옵션 — 체크박스가 곧 값이다(체크 = ON/true). "기본값에서 바꾼다"가 아니다.** AskUserQuestion 은
선택지를 미리 체크해 둘 수 없으므로, boolean 을 두 버킷으로 나눠 각 체크박스의 방향이 분명해지게 한다. 화면
문구는 한국어이며, **아래의 의미 규칙이 규칙이고 문구에 따라 바뀌지 않는다**:
- **기본값 OFF 인 boolean** → "체크하면 켜집니다 (ON)" 질문 — 체크 = true.
- **기본값 ON 인 boolean** → "체크하면 꺼집니다 (OFF)" 질문 — 체크 = false. 체크하지 않으면 ON 기본값이
  유지된다. (미리 체크된 박스를 사용자가 해제해 끄는 것과 화면상 동등하다.)

boolean 이 아닌 것(int/long/duration/string): "어떤 것을 설정할지" 다중 선택 후, 고른 것마다 값을 묻는다(타이핑) —
체크는 "이 기본값을 덮어쓰고 싶다"는 뜻일 뿐이고, 그다음 값을 수집한다. enum: 허용값 중에서 고르는 선택
(기본값을 문구에서 미리 표시).

### 7. 검증 + 의존성 해소

모든 선택(step 3–6)이 끝나면, 아무것도 쓰기 전에 확정된 전체 집합에 대해 **검증 패스**를 돌린다. 각 항목을
확인하고, 고치거나 멈춘다:

- **requires 충족** — 선택된 모든 옵션/capability 의 `requires` 가 만족되는지. 동반 옵션을 강제로 켜거나,
  빠진 필수 값을 묻는다(예: `gate.signature.required` ⇒ `gate.signature.keys` 가 제공돼야 함,
  `worker.db.auto-provision` ⇒ dialect + admin 자격증명, 커스텀 툴 ⇒ `mcp.enabled`).
- **requires_when 충족** — `requires_when` 을 가진 모든 옵션에 대해 각 규칙을 평가한다. 그 `when` 조건이 모두
  성립하면 `needs` 키가 빈 값이 아니어야 한다. 자동으로 채울 수 없다(환경별 경로/식별자다) →
  **타이핑으로 묻고, 그래도 비어 있으면 생성을 차단한다.**
  **capability 에 선언된 옵션도 여기 포함된다** — `amoeba.auth.service-client-id` 는
  `amoeba.auth.service-client-secret` 을 요구한다. `EmbeddedAuthServerConfig` 가 둘 다 비어있지 않을 때만 그
  클라이언트를 등록하고, 아니면 **아무 말 없이 등록하지 않기** 때문이다. 자격증명 쌍의 한쪽만 채워진 경우가
  여기서 유일하게 **에러가 전혀 나지 않는** 사례라, CI 가 처음 401 을 받을 때가 아니라 생성 시점에 잡아야 한다.
- **enum 범위** — 모든 enum 값이 그 `allowed` 안에 있는지.
- **sidecar worker runtime 은 트랙별 아티팩트가 필요하다** — `protean.worker.runtime=sidecar` 는 bootJar 를
  펼치는 embed 런타임을 외부 아티팩트로 대체하며, 필요한 키가 격리 모드에 따라 다르다:
  `worker`(프로세스 트랙) ⇒ **`worker.sidecar.jar`**(flat `-worker` uber-jar. Boot fat jar 는 동작하지 않는다 —
  릴리스가 `worker` classifier 아티팩트로 하나를 게시하므로 사용자가 shadow 로 직접 빌드할 필요는 없다),
  `container` ⇒ **`worker.sidecar.image`**(`ghcr.io/htcom-code/protean-worker:<ver>`, 예: `:0.0.1`). 다른 쪽 키는
  해당 트랙에서 inert 다. Protean 은 이 값을 startup 이 아니라 **첫 worker spawn(첫 배포)** 시점에 해소하며,
  값이 없으면 그 자리에서 `IllegalStateException` 을 던진다. 그러니 여기서 검증하고, 배포 전에 `setup.sh` 가 다시
  확인하게 한다. `worker.sidecar.shared-api`(프로세스 트랙 전용)는 선택이지만, 설정했다면 실제 존재하는 jar 여야
  한다. `runtime=sidecar` + `container` 조합에서는 bootJar 단계를 **스캐폴딩하지 말 것** — 이미지가 앱 +
  shared-api 를 함께 담고 있다.
- **충돌 없음** — 예: 데이터 접근 / 공유 빈 / 라이브러리 모듈을 `isolation.mode` = worker/container 와 함께
  (그 모드에서는 호스트 빈을 주입할 수 없다). 격리가 in-process 인데 `worker.*`/`bridge.*` 값이 설정된 경우
  (inert — 경고).
- **auto-provision = SCOPE 모델 (worker/container 전용)** — `protean.worker.db.auto-provision=true` 는
  `isolation.mode` ∈ {worker, container} 를 요구한다. in-process 에서는 **차단**한다. `worker.db.dialect` ∈
  {mysql, postgresql, <custom id>} + admin 자격증명이 필요하다(MySQL 은 CREATE DATABASE/USER + GRANT, Postgres 는
  CREATE SCHEMA/ROLE). auto-provision 아래에서는 **배포되는 모든 모듈이 `scope` 를 선언해야** 하며, 그 scope 는
  알려진 ACTIVE scope 여야 한다 — `worker.db.scopes` 로 seed 하거나(비어 있으면 암묵적 `default`) scope admin
  API 로 만든다. scope 없는 모듈, 알 수 없거나 닫힌 scope, 또는 **in-process** 로 라우팅된 scoped 모듈은
  deploy/reconcile 단계에서 거부된다. "auto-provision 이 capacity=1 을 강제한다"는 동작을 스캐폴딩하지 말 것 —
  패킹은 scope 단위로 `worker.modules-per-worker`(기본 128)까지 이뤄진다. scope 정리는 운영자 주도다
  (detach/destroy). deprovision-on-undeploy 플래그는 없고, undeploy 는 절대 scope 를 tear down 하지 않는다.
- **jdbc module-store 는 벤더 적응형이다** — `protean.module-store.backend=jdbc` 는 DataSource 가 필요하다.
  store DDL 은 이제 `ModuleStoreDialect` SPI 로 벤더 적응형이다(내장 **h2 / mysql / postgresql**. DB product
  name 으로 자동 감지되거나 `protean.module-store.dialect` 로 강제). 따라서 H2/MySQL/PostgreSQL 은 그대로 동작하고,
  잘못된(VARCHAR 로 절단하는) dialect 는 startup self-check 가 거부한다. 다른 벤더(예: Oracle)라면 사용자가
  `ModuleStoreDialect` 빈을 등록한다. (더 이상 H2 전용이 아니다 — CLOB 제약은 protean 에서 수정됐다.)
- **타입** — 타이핑된 숫자/duration 값이 파싱되는지. 이름이 적절히 `[a-z0-9_.-]` 에 맞는지.
- **패키지 유효** — `{{PKG}}` 가 적법한 Java 패키지인지: 점으로 구분된 `[a-z_][a-z0-9_]*` 세그먼트이고, 어떤
  세그먼트도 Java 예약어가 아닐 것.
- **모듈 대면 의존성 충족** — 선택된 모든 `module_classpath` 엔트리의 `requires` 가 만족되는지. `mybatis` 는
  `data_access` capability 가 필요하다(MyBatis 는 호스트 DataSource 에 바인딩된다) — 없으면 **차단**. 또한
  모듈 대면 의존성이 `implementation` 이 아닌 다른 것으로 쓰이려 하면 경고한다: `compileOnly` 는
  `java.class.path` 에 오르지 않으므로, 모듈이 startup 이 아니라 첫 배포에서 컴파일에 실패한다.
  **`requires` 는 반대 방향으로도 흐른다**: capability 가 `module_classpath` 엔트리를 지목할 수 있고, 그러면 그
  엔트리는 **묻지 말고 강제**한다. `interface_spec_validator` 가 `swagger_annotations` 를 요구하는 이유는 생성기가
  자기가 쓰는 모든 DTO·컨트롤러에 `@Schema`/`@Operation` 을 무조건 넣고, 승진 게이트 ② 규칙이 그것이 없는 필드를
  거부하기 때문이다 — 그 jar 가 없으면 `amoeba.define_interface` 로 배포되는 모든 모듈이 첫 배포에서 컴파일에
  실패한다. 이 해소는 step 5 가 `module_classpath` 를 묻기 **전에** 끝내고, 해당 엔트리는 선택지가 아니라
  강제되었음을 알린다.
- **애노테이션과 그것을 요구하는 규칙** — **경고** 2건(절대 차단 아님. 규칙이 무엇을 검사할지는 작성자만 안다):
  - `code_rule` 을 선택하고 `swagger_annotations` 를 **선택하지 않은** 경우 — 그 규칙이 결국
    `@Operation`/`@Schema` 를 요구하게 되면, 아무것도 만족시킬 수 없는 규칙이 된다: 그 애노테이션을 담은 모듈
    소스는 jar 없이는 애초에 컴파일되지 않으므로, 배포가 규칙이 아니라 컴파일 게이트에서 실패한다. 그 사실을
    알리고 jar 를 제안한다.
  - `swagger_annotations` 를 선택하고 `code_rule` 을 **선택하지 않은** 경우 — 애노테이션이 장식으로 남는다.
    아무것도 그것을 요구하지 않는다. 기본으로 제공되는 규칙은 `ForbiddenApiRule`(금지 호출 4개, 문서화에 대해서는
    아무 말도 하지 않음)뿐이기 때문이다. 문서화된 인터페이스를 보장하는 것이 목적이었다면 `CodeRule` 이 함께
    와야 한다.

  둘 다 켰을 때도 그 조합이 사주는 것을 과장하지 말 것: 바이트코드 규칙은 애노테이션의 **존재**를 요구할 수
  있지만, 그 설명 텍스트가 다른 데 게시된 문서와 일치하는지는 대조하지 않는다.
- **authorizer 는 인증을 필요로 한다** — `authorizer` capability 를 선택했는데 호출자를 인증하는 것이 아무것도
  없으면(`mcp.authorization.resource` 없음 ⇒ `SecurityConfig` 없음, security starter 없음, `issuer-uri` 없음)
  **경고**한다: 모든 호출자가 `caller == null` 로 도착하므로 프래그먼트의 `DEPLOY`/`UPDATE`/`DELETE`/`APPROVE`
  분기가 전부 거부하고, 모듈 배포가 조용히 멈춘다. 두 가지 탈출구를 제시한다 — 인증을 붙이거나
  (`mcp.authorization.resource` 를 설정하면 issuer 프롬프트가 강제된다), 로컬 데모라면 `authorize()` 를
  `Decision.allow()` 로 완화한다. 차단이 아니라 경고다: "전부 거부"는 로컬 샘플에서 정당한 안전 기본값이다.

짧은 **검증 리포트**(OK / 경고 / 차단)를 **한국어로** 낸다 — 단, 문제를 일으킨 키·값·클래스명·파일 경로는
원문 그대로 인용해 사용자가 조치할 수 있게 한다. 차단 오류가 있으면 생성하지 말고 돌아가 수정을 요청한다. 그다음
`build_deps` 와 `fragment` 를 수집하고, DB 서브플로우를 해소하고, **최종 확정 구성을 echo** 한다(옵션 집합 +
강제된 동반 옵션 + 의존성 + 쓰일 파일들) — 키·값·경로의 원문 목록을 한국어 서술이 감싸는 형태로.

### 8. 생성 (Generate)

`{{NAME}}`, `{{PKG}}`(step 1 에서 입력받은 패키지), `{{PKG_PATH}}`(=`{{PKG}}` 의 `.`→`/`), `{{COORD}}`,
`{{VERSION}}`, 그리고 DB 토큰 `{{DB}}`/`{{PW}}` 를 치환한다. 엔진:

- **`application.yml`** — `templates/application.yml.template`(최소 베이스)에서 시작해, **설정된 모든
  `protean.*` 키**를 `protean:` 아래에 묶어 주입하고, 선택한 벤더의 `spring.datasource` 블록을 더한다.
  `protean.*` 가 **아닌** `requires_when` 의 `needs` 키는 자기 최상위 블록으로 들어가며 절대 `protean:` 아래로
  가지 않는다 — 예: `spring.security.oauth2.resourceserver.jwt.issuer-uri` 는 `spring.security` 아래에 놓인다.
  **capability 의 `options:` 도 같은 규칙을 따른다**: `embedded_auth` 의 키는 `amoeba.auth.*` 이므로 최상위
  `amoeba:` 블록을 이룬다. `protean:` 아래에 넣으면 아무것도 바인딩되지 않는다 —
  `@ConfigurationProperties("amoeba.auth")` 가 조용히 기본값만 보게 되어 embedded auth 는 꺼진 채로 남고, 앱은
  멀쩡해 보이는 상태로 기동한다.
  그 키는 `${OAUTH_ISSUER_URI}` 로 **fallback 없이** 쓴다(값이 없으면 기동이 중단돼야 한다). 반면 *광고되는*
  placeholder 는 모두 fallback 을 유지한다. 광고되는 값에 host 나 port 를 하드코딩하지 말 것:
  `mcp.authorization.resource` 는 `http://${SERVER_HOST:localhost}:${SERVER_PORT:8080}/platform/mcp` 로 쓰고,
  템플릿의 `server.port: ${SERVER_PORT:8080}` 를 유지해 바인드 포트와 광고 포트가 어긋나지 않게 한다
  (`SERVER_PORT` 는 Spring 이 `server.port` 로 relaxed-binding 하는 정확한 이름이다 — 템플릿 주석 참조).
  설정되지 않은 키는 생략한다(라이브러리 기본값) — 가장 관련 있는 것들은 주석 처리된 편집 지점으로 남겨도 좋다.
- **`build.gradle`** — 템플릿에서: 항상 `org.htcom:protean:<ver>` + `spring-boot-starter-web`. 여기에 수집된
  `build_deps` 를 각각 더한다(예: jdbc + 벤더 드라이버, strict-schema 용 networknt, OAuth 용 security).
  `module_classpath` 의존성은 템플릿의 **별도 `[module-facing host classpath]` 블록**에 유지하고, 호스트 앱의
  목록에 섞지 말 것 — 읽는 사람이 "이 앱이 쓰는 것"과 "배포된 모듈이 import 하는 것"을 구별할 수 있어야 한다.
  모듈 대면 의존성은 전부 `implementation` 으로 쓴다(`compileOnly` 는 절대 안 된다 — `java.class.path` 에
  오르지 않는다).
  `isolation.mode=container` **이면서 `worker.runtime=embed`** 일 때는
  `tasks.named('bootJar') { archiveClassifier = 'boot' }` 의 주석을 해제한다(container 트랙이
  `build/libs/*-boot.jar` 를 그 리터럴 접미사로 자동 탐지한다). `runtime=sidecar` 면 bootJar 를 쓰지 않는다 —
  사용자가 flat `-worker` sidecar jar 를 직접 빌드하는 경우에만 shadow 플러그인을 대신 추가한다.
- **공통 지원 패키지 (항상)** — `templates/support/*.template` 5개를 모두 클래스명을 유지한 채
  `src/main/java/{{PKG_PATH}}/support/` 로 복사한다. 이들은 capability 로 게이팅되지 **않는다**: 모든 샘플이
  받으며 네 동작 전부 비어 있거나 패스스루다. 나중에 공통 처리를 넣을 때 배선 작업이 아니라 한 파일 편집으로
  끝나게 하기 위한 것이다.
  - `BaseService`(abstract, 빈)와 `BaseMapper`(interface, 빈) — 배포된 모듈의 service 와 Mapper 가 상속하는
    상위 타입. 이들은 **호스트 앱**에 있어야 한다: 모듈은 소스로 배포되고 `RuntimeCompiler` 가
    `java.class.path` 를 상속하므로, 모듈이 이름을 부른 상위 타입은 거기서 해소돼야 한다. 모듈 소스에서 이들을
    상속하라고 사용자에게 알리고 — `worker.runtime=sidecar` 아래에서는 이 패키지가 curated shared-api jar 에
    들어 있어야 한다고 경고한다.
  - `CommonFilter`(`OncePerRequestFilter`, `@Order(HIGHEST_PRECEDENCE + 20)`) — protean 의
    `CorrelationIdFilter`/`RequestTraceFilter` 뒤, Spring Security **앞**에 자리한다. 그래서 security 가 거절하는
    요청까지 포함해 모든 요청을 보지만 Principal 은 없다.
  - `CommonInterceptor`(`HandlerInterceptor`) + `WebSupportConfig`(그것을 등록하는 `WebMvcConfigurer`) — MVC
    계층의 상대편이다: 인증 후에 돌아 Principal 과 매칭된 핸들러를 보며, **배포된 모듈 라우트에 닿는다**.
    `DynamicEndpointRegistrar` 가 그것들을 호스트의 `RequestMappingHandlerMapping` 빈에 등록하기 때문이다.
    protean 은 `WebMvcConfigurer` 를 제공하지 않으므로 충돌할 것이 없다 — 그리고 `@EnableWebMvc` 는 절대 추가하지
    말 것. Boot 의 MVC 자동설정을 꺼버린다.
  - `<<fragment-checks>>` 에 `Class.forName("{{PKG}}.support.BaseService")` 한 줄을 추가한다.
- **fragment** — 선택된 `templates/fragments/*.template` 를 각각 `src/main/java/{{PKG_PATH}}/` 로 복사하고,
  실제 클래스명으로 이름을 바꾸고, 이름들을 치환한다.
- **fragment bundle** — `fragment_bundle` 을 가진 capability 는 `templates/fragments/<dir>/` 전체를 한 번에
  내보낸다. 규칙 4개, 각각 단일 fragment 의 정반대다:
  - 각 멤버는 자기 `to:` 에 따라 `src/<main|test>/java/{{PKG_PATH}}/<sub-package>/` 로 간다.
    `{{PKG_PATH}}/` 에 **평평하게** 두지 않는다.
  - **클래스명을 바꾸지 말 것.** 멤버끼리 이름과 import 로 서로를 참조하므로, 이름을 바꾸면 번들이 깨진다.
    `rename: false` 가 그것을 명시한다.
  - `{{PKG}}` 를 `package` 줄과 멤버 간 import(`{{PKG}}.<sub>.X`) 양쪽에서 치환한다.
  - `when:` 이 충족되지 않은 멤버는 **건너뛰고, 나머지는 그대로 내보낸다** — 번들이 통째로 빠지는 대신
    의존성 없는 코어로 축소된다.

  번들마다 `<<fragment-checks>>` 에 `Class.forName` 한 줄을 추가하고(대표 클래스. 예:
  `{{PKG}}.interfacedef.InterfaceSpecValidator`), 번들의 테스트 멤버가 `ConfigMatchesSelectionTest` 와 함께
  `./gradlew test` 로 돌아간다는 점을 기억한다.
- **infra** — DB docker 경로: `templates/db/*` 에서 `docker-compose.yml`. 그 `init/*.sql` 은 DataSource 의
  **용도**에 따라 다르다: **데이터 접근**용 DataSource 는 `init/01-schema.sql`(`items` 테이블)을 받고,
  **jdbc module-store** 만 받치는 DataSource 는 받지 않는다(Protean 이 자체 store 테이블을 만든다) — items init 을
  생략한다. H2 데이터 접근: `schema.sql`. existing/other: 없음.
- **프로비저닝 admin (D5)** — `worker.db.auto-provision=true` 이고 DB 가 docker 로 관리될 때,
  `init/00-provision-admin.sql` 을 생성해 `worker.db.admin-username`/`admin-password` 계정을 만든다. MySQL 은
  CREATE DATABASE/USER + GRANT, Postgres 는 CREATE SCHEMA/ROLE — 그래야 배포 시점에 프로비저닝이 동작한다.
  기존 서버라면 대신 admin 계정에 필요한 정확한 GRANT 문을 출력한다. 대상 DB 에 존재하지 않는 admin 자격증명을
  절대 남기지 말 것.
- **scope seed + 배포 안내 (auto-provision)** — `application.yml` 의 `protean.worker.db.scopes` 에 최소 하나의
  seed scope(예: `[default]`)를 설정해, 모듈이 바인딩할 ACTIVE scope 가 있게 한다. README 의 배포 절에는
  모든 모듈 배포가 seed 된/ACTIVE scope 를 지목하는 **`scope`** 를 반드시 넘겨야 한다는 점(deploy-arg /
  `module.yaml` 의 `scope:`)을 보여주고, scope admin 표면을 문서화한다(`protean.scope_*` MCP 툴 +
  `/platform/scopes` REST: create/open/close/detach/destroy. destroy 는 `worker.db.allow-destroy` +
  `confirm=<name>` 필요). 패킹도 적는다: 같은 scope 의 모듈은 `modules-per-worker`(128)까지 worker 를 공유하며,
  엄격한 격리를 원하면 1 로 설정한다.
- **wrapper** — 새 디렉토리에서 `gradle wrapper --gradle-version 8.14.5` 로 준비한다(또는 기존 것을 복사).
- **`README.md`**(템플릿에서 — 선택된 capability 를 나열), **`.gitignore`**, **`Application.java`**.
- **`setup.sh`**(항상 — **마지막** 산출물) — `templates/setup.sh.template` 에서 만들고 `chmod +x`. 이 구성
  그대로를 위한 Linux/Ubuntu 설치·실행 스크립트다: preflight(javac 로 JDK 21 확인, gradlew, SNAPSHOT 이면
  mavenLocal 의 protean jar, docker DB 면 Docker 데몬 + compose, `worker.runtime=sidecar` 면 sidecar 아티팩트,
  포트 사용 가능 여부) → `docker compose up -d --wait`(docker DB 인 경우) → `./gradlew run`.
  `{{IS_SNAPSHOT}}`(버전이 `-SNAPSHOT` 로 끝나는지), `{{HAS_DB_DOCKER}}`(데이터 접근 또는 jdbc-store DataSource 가
  선택되고 연결 방식이 docker), `{{ISOLATION}}`(격리 모드 — `container` 일 때 스크립트가 Docker 를 확인한다),
  그리고 sidecar 3종 `{{WORKER_RUNTIME}}`(`embed`|`sidecar`. in-process 면 `embed`), `{{SIDECAR_JAR}}`,
  `{{SIDECAR_IMAGE}}`, `{{SIDECAR_SHARED_API}}`(미설정 시 각각 공백 — 그러면 스크립트가 이 트랙에 필요한
  아티팩트를 확인하고, `runtime=sidecar` 아래에서는 bootJar 빌드를 건너뛴다)를 채운다. `{{OAUTH}}`
  (`mcp.authorization.resource` 가 설정됐으면 `true`)도 채운다 — 이것이 issuer preflight 블록을 게이팅하며,
  `OAUTH_ISSUER_URI` 가 설정되지 않았을 때 앱이 스택 트레이스로 죽게 두는 대신 `--check` 에서 실패하게 하고,
  `SERVER_HOST`/`SERVER_PORT` 로 조립한 광고 `RESOURCE_URL` 을 출력한다. `./setup.sh --check` 를 지원한다.
- **자기검증 테스트**(항상) — `templates/fragments/ConfigMatchesSelectionTest.java.template` 에서
  `src/test/java/{{PKG_PATH}}/ConfigMatchesSelectionTest.java` 를 만든다. `<<assertions>>` 에는 선택된
  `protean.*` 키마다 `assertEquals(<value>, cfg.get("<protean.key>"))` 한 줄, `<<fragment-checks>>` 에는 선택된
  fragment 마다 `Class.forName` 확인 한 줄, `<<module-classpath-checks>>` 에는 선택된 `module_classpath` 엔트리마다
  `Class.forName` 한 줄(각 엔트리가 문서화한 대표 FQCN)을 채운다. 마지막 블록이 모듈 대면 의존성에 대한 유일한
  자동 방어선이다 — 없으면 jar 누락이 **첫 배포**에서 모듈 컴파일 에러로만 드러난다. `build.gradle` 은 이미
  `testImplementation spring-boot-starter-test` 를 추가한다. 이 테스트는 `application.yml` 을 로드해 선택과
  일치하는지 단언하며, 서버를 기동하지 않는다.

### 9. 검증 (출력만, 실행하지 않음)

Linux/Ubuntu 서버용 원커맨드 설치를 앞세우고, 그다음 수동 등가물을 보여준다. **각 단계를 한국어로 설명하고,
모든 명령은 한 바이트도 바꾸지 말고 출력한다** — 번역하거나 "정돈한" 명령은 사용자가 붙여넣을 수 없는 명령이다.

- **`./setup.sh`** — 환경과 전제조건을 preflight 하고, (있다면) DB 를 띄우고, 서버를 실행한다.
  `./setup.sh --check` 는 검사만 한다. (이것이 마지막으로 생성되는 산출물이다.)
- (mavenLocal 경로) `cd <protean repo> && ./gradlew publishToMavenLocal`.
- (DB docker) `docker compose up -d`.
- `./gradlew run` (JDK 21).
- (MCP) `curl -s localhost:8080/platform/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`.
- 배포된 모듈 엔드포인트를 호출해 본다. 상태는 `curl localhost:8080/platform/modules`.
- 서버 없이도 사용자가 돌릴 수 있는 sanity check: `./gradlew compileJava`(protean jar 를 대상으로 컴파일)와
  `./gradlew test`(`ConfigMatchesSelectionTest` 실행 — 생성된 설정이 선택과 일치하는지 단언).

## 참고 (Notes)

- MCP 는 RCE 표면이다(제출된 소스를 컴파일·핫로드한다) — 기본은 off. 샘플에서 켜는 것은 로컬 데모이며, README 가
  경고하고 인증(Bearer/OAuth + `ModuleActionAuthorizer`)을 가리켜야 한다.
- 모듈은 런타임에 `javac` 로 컴파일된다 → 서버는 **JRE 가 아니라 JDK 21** 에서 돌아야 한다.
- `worker` 는 예약된 Spring 프로파일이다 → worker 데모 프로파일이 필요하면 `worker-demo` 를 쓴다.
- 데이터 접근 / 공유 빈 / 라이브러리 모듈은 **in-process 전용**이다.

## 모듈 작성 규칙 (생성되는 README 에 넣을 것)

생성된 프로젝트가 그 안에 배포되는 모듈에 부과하는 관례다. README 의 모듈 절에 적는다 — 모듈 작성자가 읽는 것은
이 파일이 아니라 그쪽이다.

### 계층 — 공통 지원 베이스 타입을 상속한다

MVC 형태로 작성된 모듈은 Controller → Service → Mapper 이고, **Service 와 Mapper 는 환경이 이미 제공하는 베이스
타입을 상속한다**:

```java
public class OrdersService extends {{PKG}}.support.BaseService { ... }

@Mapper
public interface OrdersMapper extends {{PKG}}.support.BaseMapper { ... }
```

둘은 현재 비어 있다. 상속하는 데 지금 드는 비용은 없고, 나중에 추가되는 공통 처리가 모든 모듈에 닿게 만드는 것이
바로 이것이다 — 그러지 않으면 공통 처리를 하나 넣을 때 그동안 배포된 모든 모듈을 고쳐야 한다. Controller 는
아무것도 상속하지 않는다: 그쪽의 공통 처리 지점은 `CommonInterceptor` 이고, 이미 모듈 라우트를 포함한다.

### `@Transactional` — Service 에만, 그리고 모듈이 활성화한 뒤에만

**배치: Service. Mapper 는 절대, Controller 도 절대 아니다.**
- Mapper — MyBatis Mapper 는 `MapperFactoryBean` 이 만든 JDK 프록시다. 그 인터페이스에 붙인 `@Transactional` 은
  반영되지 않는다. 트랜잭션 경계처럼 읽히지만 경계가 아니다.
- Controller — 여기에 경계를 두면 요청 파싱과 직렬화가 트랜잭션 안에 들어가, 교환 내내 커넥션을 붙잡는다.
- Service — 작업 단위가 메서드와 일치하는 유일한 자리.

**기본 상태로는 동작하지 않으며, 조용히 실패한다.** 데이터 접근이 선택될 때마다 이것을 경고한다:
모듈은 **자식** `ApplicationContext` 에서 돌고(`ModuleContainer.createChild` → `setParent` + ClassLoader +
`ProteanTaskExecutor`, 그 외에는 없다), 트랜잭션 어드바이저는 `@EnableTransactionManagement` / Boot 의
자동설정에서 오는데 둘 다 **호스트** 컨텍스트에서 실행됐다. BeanPostProcessor 는 BeanFactory 단위이므로 호스트의
어드바이저는 모듈 빈을 보지 못한다 — `setParent` 는 빈 *해소*를 공유하지, 후처리를 공유하지 않는다. 그래서
애노테이션이 없는 것처럼 `@Transactional` 메서드가 트랜잭션 없이 그냥 실행된다. protean 은 자체
`PlatformTransactionManager` 를 선언하지 않는다(소스에 0건).

탈출구 두 가지, 둘 다 모듈이 직접 해야 한다:

1. **선언적** — 모듈의 `@Configuration` 이 `@EnableTransactionManagement` 와 `PlatformTransactionManager` 를
   추가한다(호스트의 것을 주입해도 되고, 자기 `DataSource` 위에 하나를 만들어도 된다).
2. **프로그래밍적** — 호스트의 `PlatformTransactionManager` 를 주입해 `TransactionTemplate` 을 쓴다. 자식
   컨텍스트 인프라가 필요 없으므로 조용히 no-op 될 여지가 없다.

**트랜잭션이 덮는 범위**(guide `07-data-access.md`): in-process + 호스트의 공유 `DataSource` + 호스트 트랜잭션
매니저 → 호스트 트랜잭션에 참여한다(같은 커넥션, 같은 경계). in-process + 모듈이 직접 만든 DataSource →
독립된 트랜잭션. worker/container → 별도 프로세스이므로 **항상** 격리된다. 그 경계를 넘어 묶으려면 공유
트랜잭션이 아니라 RPC 브릿지를 쓴다.
