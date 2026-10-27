# Changelog

이 repo 의 변경 이력은 **사람이 갱신한다**(release-please 를 쓰지 않는다).

- PR 마다 아래 「Unreleased」의 맞는 섹션에 한 줄을 더한다 — `**<스킬명>:** 무엇 (#PR)`.
- Release 를 만들 때 「Unreleased」를 그 버전 · 날짜 제목으로 바꾸고 빈 「Unreleased」를 새로 둔다.
- 스킬별 버전은 각 `SKILL.md` 의 `version` 이다. 이 파일의 버전은 repo 전체의 Release 다.
- 섹션 이름은 bridge-web · bridge-api · bridge-auth 의 CHANGELOG 와 같다(기능 · 버그 수정 · 문서 · 빌드 · 설정 …).

## [Unreleased]

### 기능

* **nz_amoeba_make:** 생성되는 리소스 서버가 액세스 토큰의 `aud` 를 검증한다 ([#5](https://github.com/nz-sdk/ai_skills/pull/5))
* **nz_amoeba_make:** capability `db_metadata_tools` — 스키마 · 테이블 조회 MCP 도구 ([#7](https://github.com/nz-sdk/ai_skills/pull/7))
* **nz_amoeba_make:** `db_metadata_tools` 에 `database` 인자 — 계정이 보는 다른 DB 조회 ([#8](https://github.com/nz-sdk/ai_skills/pull/8))
* **nz_amoeba_make:** `interface_spec_validator` 에 deprecation 표시(오퍼레이션 · 파라미터 · 필드)와 호환성 게이트 `amoeba.compat-gate.enabled` — 같은 major 안에서는 추가만, `Deprecation` · `Sunset` · `Link` 응답 헤더, OpenAPI `x-sunset`, 웹훅 `{{deprecations}}` ([#10](https://github.com/nz-sdk/ai_skills/pull/10))
* **create-frontend:** API 호환 장치 — 새 버전 안내(`version.json`), 청크 실패 1회 새로고침, 개발 빌드 Deprecation 경고, (조건부) OpenAPI → TS 타입 생성과 CI 타입 동기화 · oasdiff ([#10](https://github.com/nz-sdk/ai_skills/pull/10))


### 버그 수정

* **nz_amoeba_make:** 생성되는 서버에 VS Code MCP 클라이언트가 붙지 못하던 문제 — path-appended protected resource metadata 와 401 의 `resource_metadata`(RFC 9728) ([#10](https://github.com/nz-sdk/ai_skills/pull/10))
* **nz_amoeba_make:** 생성 CI 가 bootjar(~35 MB)를 커밋마다 artifact 로 올려(14일 보관) 무료 플랜 조직 Actions 저장 한도(500 MB)를 채우던 문제 — 업로드를 뺀다 ([#11](https://github.com/nz-sdk/ai_skills/pull/11))


### 문서

* **nz_amoeba_make:** 생성 README 에 MCP 클라이언트 연결 절 ([#6](https://github.com/nz-sdk/ai_skills/pull/6))
* 공용 문서 `reference/api-compatibility.md` — FE · BE API 호환 정책(create-frontend · nz_amoeba_make 가 가리킨다) ([#10](https://github.com/nz-sdk/ai_skills/pull/10))

## [1.0.0](https://github.com/nz-sdk/ai_skills/releases/tag/v1.0.0) (2026-09-14) — 최초 등록

Release 노트는 「최초 등록」 한 줄이다. 아래는 그때까지의 `main` 이력을 이 파일을 만들며 옮긴 것이다.

### ⚠ BREAKING CHANGES

* **nz_amoeba_make:** `embedded_auth` 를 걷어냈다 — 생성 서버는 리소스 서버 전용이고, 그것을 테스트로 못박는다 ([#3](https://github.com/nz-sdk/ai_skills/pull/3))


### 기능

* **nz_amoeba_make:** 스킬 추가 — Protean 설정을 안내에 따라 고르면 실행 가능한 샘플 서버를 생성한다 (2026-08-28)
* **nz_amoeba_make:** `InterfaceSpecValidator` 가 컬럼 설명의 내용 기준을 지키게 한다 (2026-08-28)
* **nz_amoeba_make:** 선언한 상태코드를 실제로 내고, 파괴적 probe 를 멈추고, 스켈레톤 표준을 고정한다 (2026-08-29)
* **scaffold-shadcn-app · create-frontend · appcontext-architecture · add-shadcn-existing:** 프론트엔드 스킬 4종 추가 (2026-09-03)
* **nz_amoeba_make:** HTTP 포트를 생성 시점에 입력받는다 ([#3](https://github.com/nz-sdk/ai_skills/pull/3))
* **nz_amoeba_make:** 배포 인프라를 템플릿화하고 6 단계로 고른다 ([#3](https://github.com/nz-sdk/ai_skills/pull/3))
* **nz_amoeba_make:** 배포 완료 웹훅 ([#4](https://github.com/nz-sdk/ai_skills/pull/4))


### 버그 수정

* **nz_amoeba_make:** 생성 모듈 결함 2건 — mapper ClassLoader · 파라미터 format (2026-08-28)
* **nz_amoeba_make:** 생성되는 배포 래퍼가 검증계획 경로를 거른다 ([#2](https://github.com/nz-sdk/ai_skills/pull/2))
* **nz_amoeba_make:** nz_dinos 생성에서 드러난 결함 10건 ([#3](https://github.com/nz-sdk/ai_skills/pull/3))
* **nz_amoeba_make:** 아티팩트 갱신 중 확인된 문서 결함 2건 ([#3](https://github.com/nz-sdk/ai_skills/pull/3))


### 문서

* **readme:** 스킬 목록 · 아티팩트 표, repo 를 스킬 디렉토리로 링크하는 방법 (2026-08-28 ~ 08-31)
* **nz_amoeba_make:** 비밀번호 결함의 실제 영향 범위 · 이미지 크기 주석 실측값 ([#3](https://github.com/nz-sdk/ai_skills/pull/3))


### 빌드 · 설정

* **nz_amoeba_make:** `version` · `license` · `compatibility` 메타데이터 — `version` 을 metadata 로 옮기고 0.2.0 ([#2](https://github.com/nz-sdk/ai_skills/pull/2), [#3](https://github.com/nz-sdk/ai_skills/pull/3))
