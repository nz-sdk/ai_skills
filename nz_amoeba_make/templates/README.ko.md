[English](README.md) | **한국어**

> 사람이 읽기 위한 번역본입니다. 내용이 어긋나면 [README.md](README.md) 가 기준입니다.
> 식별자에 해당하는 것(토큰·파일명·속성 키·명령어)은 번역하지 않고 원문 그대로 둡니다.

# 템플릿

스킬이 `prototype/<name>/` 을 생성할 때 가져다 쓰는 원본 템플릿입니다. **그대로 복사되지 않습니다** — 생성
엔진이 플레이스홀더를 치환하고, 선택된 `protean.*` 키를 주입하고, 선택된 capability 에 해당하는 블록만
포함시킵니다. 옵션 표면 자체는 `../reference/protean-options.yaml`(설정 키),
`../reference/db-vendors.yaml`(데이터베이스 서브플로우), `../reference/auth-stores.yaml`(사용자 저장소
서브플로우) 에 있습니다.

## 플레이스홀더

| Token | 의미 | Example |
|---|---|---|
| `{{NAME}}` | prototype 폴더명 / 앱 이름 (`[a-z0-9_-]+`) | `orders` |
| `{{PKG}}` | Java 패키지 — **사용자가 직접 입력** (기본값 `prototype.<name>`, `-`→`_`) | `prototype.orders` |
| `{{PKG_PATH}}` | `{{PKG}}` 를 경로로 (`.`→`/`) | `prototype/orders` |
| `{{COORD}}` | Protean group:artifact | `org.htcom:protean` |
| `{{VERSION}}` | Protean 버전 | `0.0.1` |
| `{{DB}}` | 데이터베이스/스키마 이름 (기본값 = `<name>`) | `orders` |
| `{{PW}}` | DB 비밀번호 (기본값 = `<DB>1234`) | `orders1234` |

`[OPTIONAL ...]` / `[CAPABILITY: ...]` 로 표시된 블록은 해당 항목이 선택됐을 때만 포함됩니다.
`[advanced ...]` 는 Advanced 티어를 뜻합니다. `application.yml.template` 안의 `<<datasource>>` 와
`<<protean-options>>` 는 엔진이 옵션·벤더 스펙에서 채우는 주입 지점입니다.

## 파일

- `build.gradle.template` · `settings.gradle.template` · `Application.java.template` — 프로젝트 골격.
- `application.yml.template` — **최소 베이스**. 엔진이 선택된 `protean.*` 키와 datasource 를 주입합니다.
- `README.md.template` — 생성되는 샘플의 README. `gitignore.template` → `.gitignore` 로 씁니다.
- `setup.sh.template` — 마지막 산출물. Linux/Ubuntu 설치·실행 스크립트(환경·전제조건 preflight → DB 기동 →
  서버 실행)를 `setup.sh` 로 생성하고 `chmod +x` 합니다. 플레이스홀더는 `{{IS_SNAPSHOT}}`,
  `{{HAS_DB_DOCKER}}`, `{{ISOLATION}}`, 그리고 sidecar 3종 `{{WORKER_RUNTIME}}` / `{{SIDECAR_JAR}}` /
  `{{SIDECAR_IMAGE}}` / `{{SIDECAR_SHARED_API}}`(미설정 시 공백).
- `isolation-worker.yml.template` / `isolation-container.yml.template` — 격리 모드가 `worker` / `container` 일 때
  병합되는 `protean:` 블록.
- `db/` — 벤더별 데이터베이스 템플릿 (`db-vendors.yaml` 로 선택):
  - `docker-compose.{mysql,postgres}.yml.template` + `init.{mysql,postgres}.sql.template` — docker 연결 방식.
    `init.*` 데이터 스키마는 **데이터 접근용** DataSource 에만 해당합니다 — jdbc module-store 만 받치는
    DataSource 는 items init 을 받지 않습니다(Protean 이 자체 store 테이블을 만듭니다).
  - `init.provision-admin.{mysql,postgres}.sql.template` → `init/00-provision-admin.sql`. docker 로 관리되는 DB 에서
    `worker.db.auto-provision=true` 일 때만 생성되며, scope 를 프로비저닝할 admin 계정을 만듭니다.
  - `schema.h2.sql.template` → 임베디드 H2 용 `src/main/resources/schema.sql`(서버·docker 없음).
  - (기존 서버 / "other" 벤더 → datasource 만, compose 없음.)
- `support/*.java.template` — 공통 지원 패키지. **항상 생성**되며 클래스명을 유지한 채
  `src/main/java/{{PKG_PATH}}/support/` 로 들어갑니다. `BaseService` / `BaseMapper`(배포된 모듈의 service 와
  Mapper 가 상속하는 빈 상위 타입)와 `CommonFilter` / `CommonInterceptor` / `WebSupportConfig`(등록만 되어 있고
  아무 일도 하지 않는 패스스루 훅)입니다. capability 로 게이팅되지 않습니다 — 나중에 공통 처리를 넣을 때
  한 파일만 고치면 되게 하는 것이 목적입니다.
- `fragments/*.java.template` — 코드 capability 하나당 하나. 선택된 것만 포함하며, 실제 클래스명으로 이름을
  바꿉니다. 각 프래그먼트 헤더에 의존 조건이 적혀 있습니다(예: `mcp.enabled` 필요).
- `fragments/<dir>/` — **프래그먼트 번들**. 여러 파일을 서브패키지로 한꺼번에 내보내며, 클래스명을 유지하고
  (멤버끼리 서로를 참조하므로) 일부 멤버는 테스트 소스셋을 대상으로 할 수 있습니다. `fragments/interfacedef/`
  가 그 예이며 `interface_spec_validator` capability 가 이를 구동합니다. `../reference/protean-options.yaml` 의
  `fragment_bundle` 을 보세요.

## Gradle wrapper

바이너리 + 보일러플레이트라서 템플릿화하지 않습니다. 새로 만든 샘플 디렉토리에서 준비하세요:

```bash
cd prototype/<name>
gradle wrapper --gradle-version 8.14.5
```

시스템에 Gradle 이 없으면, 아무 Gradle 프로젝트에서 wrapper 파일 4개를 복사해 오세요.
