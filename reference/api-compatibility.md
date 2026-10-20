# API 호환 정책 — FE 와 BE 를 따로 배포할 때

화면(FE)과 API(BE)를 각자 배포하면 둘이 어긋나는 순간이 반드시 생긴다. 이 문서는 그 어긋남을 막는 **규칙 · 순서 · 표시**를 정한다.
코드 없이도 오늘부터 지킬 수 있는 규칙이 먼저이고, 도구(타입 생성 · 호환성 게이트 · 헤더)는 그 규칙을 기계가 지키게 하는 보조다.

- 이 문서는 skill 공용이다. `create-frontend` 와 `nz_amoeba_make` 가 이 문서를 가리킨다.
- 생성한 프로젝트에는 이 문서를 `docs/api-compatibility.md` 로 복사하고, 「정할 것」에서 고른 값을 채운다.

## 어긋남 세 가지

| | 상황 | 증상 |
|---|---|---|
| (a) BE 먼저 | 새 BE 가 옛 FE 가 쓰는 것을 지우거나 바꿨다 | 열려 있는 화면 · 아직 배포 안 된 FE 가 깨진다 |
| (b) FE 먼저 | FE 가 아직 배포되지 않은 API 를 부른다 | 404 · 400, 필드가 비어 있다 |
| (c) 옛 화면 | 배포 뒤에도 열려 있던 탭이 옛 번들로 돈다 | 옛 요청 형식, 사라진 청크 파일(빈 화면) |

## 정책

### 1. 버전 규칙

- 같은 major 안에서는 **추가만** 한다. 깨는 변경이 필요할 때만 새 major 를 낸다.
- 판 번호에 뜻을 준다(SemVer). minor · patch = 호환 변경 = 같은 경로. major = 깨는 변경 = **새 경로를 옛 경로와 나란히** 둔다(`/v2/...`).
- 이미 있는 무버전 경로는 v1 로 본다. 일괄로 `/v1/...` 로 옮기는 것 자체가 깨는 변경이므로 하지 않는다.
- FE 는 **Tolerant Reader** 로 받는다 — 타입에 없는 응답 필드는 무시하고, enum 에는 모르는 값에 대비한 기본 분기를 둔다.
- 버전을 경로 · 헤더 · 쿼리 중 어디에 둘지는 플랫폼이 정한다. 같은 메서드 + 경로를 두 번 선언할 수 없는 플랫폼(Protean `InterfaceSpec` 등)이면 경로뿐이다.

### 2. 깨는 변경 체크리스트

하나라도 해당하면 같은 major 안에서 그냥 하지 않는다. Expand → Contract 로 풀거나(프로세스 1) 새 major 로 낸다(정책 3).

| 구분 | 깨는 변경 ❌ | 호환 변경 ✅ |
|---|---|---|
| 경로 · 메서드 | 경로 · 메서드 삭제나 변경 | 새 경로 추가 |
| 요청 | 파라미터 · 필드 삭제, 이름 변경, 선택 → **필수**, 새 필수 입력, 타입 변경, 허용 값 축소 | **선택** 파라미터 · 필드 추가, 허용 값 확대 |
| 응답 | 필드 삭제, 이름 변경, 타입 변경, 필수 → nullable, enum 값 추가(FE 가 모든 값을 분기하는 경우) | 필드 추가, nullable → 필수 |
| 의미 | 같은 필드의 단위 · 형식 · 의미 변경(예: 원 → 천 원, `yyyyMMdd` → ISO) | 문서 · 설명 보강 |
| 목록 | 나중에 페이징 도입, 기본 정렬 변경 | — |
| 오류 | 상태코드 변경, 화면이 분기하는 오류 `code` 변경 | 새 `code` 추가(FE 에 기본 분기가 있을 때) |

### 3. 새 major 가 필요한 시점

같은 이름(경로 · 필드)에 **옛 화면과 새 화면이 서로 다른 것을 기대할 때만** 새 major 를 낸다.
새 이름으로 나란히 둘 수 있으면 깨는 변경이라도 같은 major 안에서 Expand → Migrate → Contract 로 푼다.

| 변경 | 처리 | 경로 · 판 |
|---|---|---|
| 호환 변경(필드 · 경로 · 선택 파라미터 추가) | 그대로 배포(BE 먼저) | 같은 경로 · minor |
| 새 이름으로 나란히 둘 수 있는 깨는 변경(필드 이름 변경, 엔드포인트 분할) | Expand → Migrate → Contract | 같은 경로 · minor |
| 같은 이름의 의미 · 단위 · 형식이 바뀐다 | 새 major | 새 경로 · major |
| 응답 구조가 통째로 바뀐다(배열 → `{items, total}`) | 새 major | 새 경로 · major |

- 새 major 를 내면 옛 major 는 Sunset 까지 나란히 둔다. 옛 major 제거도 정책 4 의 제거 조건을 따른다.
- 어느 경우든 새 것을 쓰는 FE 는 BE 보다 나중에 나간다.

### 4. Deprecation · 제거 규칙

- deprecate 하는 오퍼레이션 · 파라미터 · 필드는 **스펙과 응답 헤더**에 표시한다.

  ```http
  HTTP/1.1 200 OK
  Deprecation: @1793491200
  Sunset: Tue, 01 Dec 2026 00:00:00 GMT
  Link: <https://example.com/notices/123>; rel="deprecation"; type="text/html"
  ```

  - `Deprecation: @<유닉스 초>`(RFC 9745) · `Sunset: <HTTP-date>`(RFC 8594) · `Link: <공지>; rel="deprecation"`.
  - **Sunset 은 Deprecation 보다 앞설 수 없다.** OpenAPI 에는 `deprecated: true` 와 `x-sunset: YYYY-MM-DD` 를 단다(oasdiff 가 읽는다).
- Deprecation 부터 Sunset 까지의 최소 유예 기간을 정한다(「정할 것」).

**제거 조건** — 무엇을 지우느냐에 따라 다르다.

| 지우는 것 | 제거해도 되는 조건 | 확인 방법 |
|---|---|---|
| 엔드포인트 · 요청 필드 | 그것을 쓴 요청이 0 이고 Sunset 이 지났다 | 경로별 호출 지표, 옛 요청 필드가 들어오면 남기는 로그 |
| 응답 필드 | FE 코드에 참조가 없고, 되돌리기 대상 Release 에도 없고, Sunset 이 지났다 | FE repo 와 직전 Release 태그에서 필드 이름 검색 |
| 옛 major 경로 전체 | 호출이 0 이고 FE 되돌리기 기간이 끝났다 | 경로별 호출 지표 |

서버는 FE 가 응답 필드를 실제로 읽는지 알 수 없다(엔드포인트 호출은 계속 있다). 그래서 응답 필드는 호출 수가 아니라 **코드 참조**로 판단한다.

### 5. 계약(스펙) 규칙

- 계약의 정본은 BE 가 판마다 내는 스펙(OpenAPI)이다. FE 는 손으로 타입을 맞추지 않고 그 스펙으로 타입을 생성한다.
- 🔴 **기본 브랜치에 들어가는 FE 타입은 「배포된 판」의 스펙으로만 만든다**(draft 스펙은 브랜치에서만). 그러면 아직 없는 API 를 부르는 FE 가 빌드되지 않아 (b) 도 막는다.
- 같은 major 안의 깨는 변경은 사람 눈이 아니라 **게이트**가 막는다 — BE 는 배포 시점 비교, FE 는 CI 의 스펙 diff(oasdiff).

## 프로세스

### 1. 배포 순서: Expand → Migrate → Contract

깨는 변경은 한 번에 하지 않고 **호환되는 배포 세 번으로 쪼갠다.** 새 major 도 같은 순서다(새 경로 추가가 Expand, 옛 경로 제거가 Contract).

| 단계 | 누가 | 무엇 | 넘어가는 조건 |
|---|---|---|---|
| ① Expand | BE | 새 필드 · 새 경로를 **추가만** 한다. 옛 것은 그대로(minor) | 옛 화면이 정상이다 |
| ② Migrate | FE | 새 것으로 바꾼다 | FE 배포 완료 |
| ③ 대기 | — | 옛 것을 deprecate 하고 공지한다 | 정책 4 의 제거 조건 |
| ④ Contract | BE | 옛 것을 지운다 | 오류 로그가 깨끗하다 |

- 🔴 **BE 먼저, FE 나중.** FE 가 먼저 나가야 하면 feature flag 로 숨겨 두고, BE 를 배포한 뒤 켠다.
- 🔴 **되돌리기를 고려한다.** FE 를 옛 Release 로 되돌리면 옛 화면이 다시 나간다. ④ 는 「직전 Release 로 되돌릴 일이 없다」고 판단한 뒤에 한다.
- 흔한 실패는 ④ 를 하지 않는 것이다 — 같은 일을 하는 길이 둘 남고 아무도 지우지 못한다. Sunset 날짜로 기한을 박는다.

### 2. 필드 이름 변경 예: `oldName` → `name`

| 단계 | 응답 | FE |
|---|---|---|
| Expand (BE) | `oldName` 과 `name` 을 같은 값으로 둘 다 준다 | 옛 화면은 `oldName` 을 읽는다 |
| Migrate (FE) | 둘 다 | 새 화면은 `name` 만 읽는다 |
| 대기 | 둘 다. `oldName` 은 deprecated + sunset | 옛 화면 · 되돌리기 대상 Release 가 사라지기를 기다린다 |
| Contract (BE) | `name` 만 | — |

요청 필드 이름이 바뀌면 서버가 두 이름을 모두 받고, 둘 다 오면 새 이름을 우선한다.

### 3. Deprecation 공지

공지는 아래 템플릿으로 한다. 채널은 「정할 것」에서 정한다. BE 의 배포 웹훅이 deprecation 목록을 실어 보내면(`nz_amoeba_make` 의 `{{deprecations}}`) 자동 알림의 바탕이 된다.

```markdown
[API deprecate] <모듈> v1.x — GET /orders/{id}
- 대체: GET /v2/orders/{id} (<모듈> 2.0.0, 배포 YYYY-MM-DD)
- 바뀌는 것: 응답 `oldName` → `name`, 페이징 추가
- Deprecation: YYYY-MM-DD · Sunset: YYYY-MM-DD
- FE 작업: <영향받는 파일 · 화면>
```

### 4. 스펙 게시

BE 를 배포한 뒤 그 판의 스펙을 게시하고, FE 는 그 스펙으로 타입을 다시 만든다. 게시 방법은 둘 중 하나를 고른다.

| 안 | 방법 | 장점 | 단점 |
|---|---|---|---|
| (가) FE repo 에 스냅샷 커밋 | 배포된 판의 스펙을 `src/shared/api/spec/<모듈>.openapi.json`(create-frontend §11-7 배치)으로 커밋한다 | 계약 이력이 git 에 남고, PR 에서 스펙 diff 가 보인다 | 가져오는 단계가 수동이다 |
| (나) BE 가 배포 때 자동 게시 | 배포 웹훅으로 FE repo 에 PR 을 올리거나 Release 자산으로 붙인다 | 사람 손이 필요 없다 | 수신 쪽을 만들어야 한다 |

### 5. 옛 화면(version skew) 대응

배포가 정적 파일을 통째로 바꾸는 SPA 라면 FE 에 두 가지를 넣는다(`create-frontend` §9-c · §9-d).

- **새 버전 안내** — 빌드가 `version.json` 을 내보내고, 열린 화면이 주기적으로 비교해 「새 버전 — 새로고침」을 띄운다.
- **청크 실패 새로고침** — 지연 로딩 청크를 받지 못하면(옛 해시 파일이 사라짐) 한 번만 새로고침한다.

## 게이트 두 개와 그 차이

| | BE 배포 게이트(`nz_amoeba_make` 의 `SpecCompatibility`) | FE CI 의 oasdiff |
|---|---|---|
| 언제 | 배포된 module 을 update 할 때, 컴파일 전에 | 스펙 스냅샷이 바뀐 PR |
| 무엇과 비교 | 배포돼 있는 판의 봉인된 스펙 | 기본 브랜치의 스펙 스냅샷 |
| sunset 지난 deprecated **오퍼레이션** 삭제 | 허용 | 허용 |
| sunset 지난 deprecated **required 응답 필드** 삭제 | 허용 | ⚠ **ERR**(`response-required-property-removed`) — 필드의 `x-sunset` 을 보지 않는다 |
| deprecated 아닌 **선택 응답 필드** 삭제 | 거부 | ⚠ 통과 |

둘 다 쓰면 응답 필드는 판정이 다르다. 필드를 지우려면 오퍼레이션째 교체(새 경로)하거나, 어느 규칙을 따를지 프로젝트에서 정한다(예: FE CI 에서 그 PR 만 oasdiff 예외 처리).

## 정할 것 — 프로젝트마다 묻는다

- [ ] **버전 위치** — `/v2/<경로>` 와 `/<경로>/v2` 중 무엇으로 할지, 기존 무버전 경로를 v1 로 볼지.
- [ ] **유예 기간 기본값** — 예: 「Sunset ≥ Deprecation + 30일, 그 사이 FE Release 2회 이상」.
- [ ] **공지 채널** — FE repo 의 이슈(라벨 `api-deprecation` 등)인지, 채팅인지.
- [ ] **스펙 게시 위치** — 프로세스 4 의 (가) 스냅샷인지 (나) 자동 게시인지.
- [ ] **계약 소유권** — 스펙(인터페이스 정의)을 누가 소유하는가. FE 가 서버 module 을 직접 정의 · 배포하는 구조(BFF 에 가깝다)인지, BE 가 소유하는지. 이것이 스펙 게시 방향을 정한다.

## 출처

- RFC 9745 — The Deprecation HTTP Response Header Field — <https://www.rfc-editor.org/rfc/rfc9745.html>
- RFC 8594 — The Sunset HTTP Header Field — <https://www.rfc-editor.org/rfc/rfc8594.html>
- Google AIP-185 — API Versioning — <https://google.aip.dev/185>
- Zalando RESTful API Guidelines (Compatibility · Deprecation) — <https://opensource.zalando.com/restful-api-guidelines/>
- Martin Fowler — Parallel Change — <https://martinfowler.com/bliki/ParallelChange.html>
- Martin Fowler — Tolerant Reader — <https://martinfowler.com/bliki/TolerantReader.html>
- Thoughtworks Technology Radar — API expand-contract — <https://www.thoughtworks.com/radar/techniques/api-expand-contract>
- oasdiff — <https://github.com/oasdiff/oasdiff>
- openapi-typescript — <https://openapi-ts.dev/>
