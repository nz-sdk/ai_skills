---
name: nz_amoeba_make
description: Scaffold a runnable Protean-consuming sample server from scratch under prototype/<name>. Walks the user through the FULL Protean option surface (every protean.* setting + every consumer extension point + a database sub-flow) and generates the matching build, config, code, infra, and README. Built for users who do not know Protean — any setting can be configured through the skill, with defaults and plain explanations. Use when someone wants to create a new Protean sample/example server, try a capability, or bootstrap a downstream Protean integration. Triggers: "make a protean sample", "scaffold a protean server", "new protean example", "protean sample 만들어".
---

# Amoeba Maker

<!-- The switcher must stay BELOW this heading: the skill loader takes the first body line after the frontmatter
     as the display name, so a line above the heading would replace "Amoeba Maker" in the skill list. -->
**English** | [한국어](SKILL.ko.md) — a translation for people to read. **This file is what runs**; you do not need
to open the Korean one, and it is not authoritative.

Generate a self-contained Protean-consuming server (Spring Boot app depending on the published
`org.htcom:protean` jar) under `prototype/<name>/`, configured with the capabilities and settings the user selects.

The user may not know Protean, so **every** `protean.*` setting and **every** consumer extension point must be
reachable through this skill — each with a sensible default and a one-line explanation. Do not expose only a
handful of choices. The full catalog is data-driven:

- **`reference/protean-options.yaml`** — every `protean.*` key: type, default, allowed values, description,
  `requires` (forced companions), `requires_when` (conditional requirement the user must supply — blocks when
  unmet), `build_deps`, `fragment`. **Walk this to drive the questions and generation.**
- **`reference/db-vendors.yaml`** — the database sub-flow (vendor + existing-server/docker/embedded).
- **`reference/auth-stores.yaml`** — the user-store sub-flow for the `embedded_auth` capability (`memory` |
  `jdbc`). Reached via `subflow: authstore`, exactly as `db-vendors.yaml` is reached via `subflow: db`.
  **`embedded_auth` puts the token signing key inside the MCP RCE surface** — quote its `security` note verbatim
  when offering it, and never present it as the default.
- **`reference/protean-capabilities.md`** — human narrative + the 8 registration mechanisms (background).
- **`templates/`** — file templates + per-capability code fragments + per-vendor DB templates.

Rules: generate everything from templates (assume no existing sample). All generated artifacts are in **English**
(see ## Language). Do not run or deploy anything unless asked — end by printing the run/verify commands.

## Language

**Talk to the user in Korean; write the generated project in English.** Two different audiences — the person
choosing options now, and whoever reads the repository later.

**Korean** — everything you say during the session: question wording, option labels and their descriptions, group
and step headings, progress lines ("적용 가능한 확장 기능 7개 중 1/2"), the validation report (OK / 경고 / 차단),
the final resolved-configuration echo, and the prose around the run/verify commands.

**Never translated, quoted exactly as written** — `protean.*` property keys, their values / enum members /
defaults, class · file · directory names, Maven coordinates, environment variable names (`OAUTH_ISSUER_URI`,
`SERVER_PORT`, …), shell commands, URLs, and capability `id`s. A user who is told `격리 모드` still has to find
`protean.isolation.mode` in the yaml — translate the explanation, never the identifier.

**The reference data stays English.** `protean-options.yaml` and `db-vendors.yaml` hold `desc` / `note` / `title`
text derived from `ProteanProperties.java` and `docs/guide/03-configuration.md`; it must stay diffable against
protean when the library changes. Read it and *render* it in Korean at question time — do not edit those files
into Korean.

**Generated artifacts stay English** — Java sources and their comments, `application.yml`, `README.md`,
`setup.sh`. This language rule governs the conversation only and does not override that; the sample is shared with
people who read protean's own English docs.

If the user writes to you in another language, follow theirs. Korean is the default, not a constraint on them.

## Input style (important)

- **Free-text (typed) inputs** — the user *types* the value; never a multiple-choice list. These are: folder
  name, **Java package**, coordinate/version, any **names/paths/identifiers** (custom tool name, class names, DB
  host/db/user/password, driver coordinate/URL for a custom vendor). Offer a default they can accept; the answer
  is their text.
- **Selections** — a fixed set of choices, presented as options (isolation mode, enable/disable a setting, DB
  vendor, connection mode, enum values).

When in doubt (a value that is a name/path/identifier) → treat it as free-text.

Both kinds are **asked in Korean** — the prompt and the default's explanation. What the user types back is their
own text and is taken verbatim; never translate or normalise an entered name, path, or password.

## Flow

### 1. Target folder + Java package (typed)
Two typed inputs — ask **both** here (the user types each; a default suggestion is allowed, but never offer a
name list).

1. **Folder name** — validate `[a-z0-9_-]+`; generate under `prototype/<name>/`; refuse if it exists.
2. **Java package** — default `prototype.<name>` (replace `-`→`_`). The user may type any package
   (e.g. `kr.newzen.amoeba.api`). Validate: dot-separated segments, each matching `[a-z_][a-z0-9_]*`, and no
   segment may be a Java reserved word. This becomes `{{PKG}}`; `{{PKG_PATH}}` = `{{PKG}}` with `.`→`/`.

### 2. Coordinate / version (typed) + maven-central check
Ask them to **type** the coordinate/version (default `org.htcom:protean:0.0.1` — the released version, live on
Maven Central since 2026-08-09). Then determine the dependency source:
- `-SNAPSHOT` → Central never hosts snapshots → **mavenLocal path**; tell them to `./gradlew publishToMavenLocal`
  in the protean repo first.
- else probe: `curl -sfI https://repo1.maven.org/maven2/org/htcom/protean/<ver>/protean-<ver>.pom` → 2xx =
  **Central path**; failure = mavenLocal path.
The generated `build.gradle` lists both repos regardless; the check only drives the guidance you print.

### 3. Core decisions (selections)
Ask the few decisions that shape everything else:
- **Isolation mode** — `protean.isolation.mode`: in-process / worker / container.
- **MCP surface** — `protean.mcp.enabled` on/off.
- **MCP OAuth** — protect `/platform/**` with an OAuth2 Resource Server? (only ask when MCP is on). Yes ⇒ same as
  selecting the `secured_mcp` capability: it asks for `mcp.authorization.resource`, which chains to the JWT issuer
  prompt in step 7 and pulls in the security starters. No ⇒ the MCP surface is open — a local demo only, and the
  README must say so.
- **Data access** — does a module need a database? (yes → the DB sub-flow in step 4; forces in-process).
- **Gate profile** — strict (`tests`+`review` on, default) / relaxed (`review` off) / custom (set each gate).

### 4. Database sub-flow (only if data access = yes)
Drive from `reference/db-vendors.yaml`:
1. **Vendor** (selection, with a typed "other"): `mysql` / `postgresql` / `h2` / other.
2. **Connection**:
   - server-backed (mysql/postgresql): **existing** (user *types* host/port/db/user/password → datasource only,
     no compose) or **docker** (generate `docker-compose.yml` + `init/01-schema.sql` from the vendor templates).
   - `h2` (embedded): ask `mem` or `file` — no server, no docker; write `src/main/resources/schema.sql`.
   - other: user *types* driver Maven coordinate, driver-class-name, JDBC URL, user/password — datasource + driver
     dep only, no compose.
Data access forces `protean.isolation.mode=in-process` (warn if they picked worker/container: those cannot inject
host beans).

### 5. Extension capabilities (opt-in selections)
Offer **every** entry in `protean-options.yaml` `capabilities:` whose `requires` this configuration can satisfy —
custom MCP tool (type a name), override a built-in tool, custom `CodeRule`, `ModuleActionAuthorizer`,
`ModuleUnloadCallback`, custom `DbDialect`, custom `ModuleStoreDialect`, **secured MCP control plane**,
**interface spec validator**. Apply each one's `requires` (e.g. custom tool → force `mcp.enabled`).

Most drop a `fragment`, but **not all do — do not filter the list to fragment-bearing entries.** A capability with
no `fragment` is a *gate*: `secured_mcp` exists so the user can choose "protect the MCP surface" here instead of
having to find the `advanced` key `mcp.authorization.resource` in step 6, and its `requires` bare key means you
must ask for that value (which in turn forces the JWT issuer prompt in step 7). `scope_admin` is documentation-only.
An entry may instead carry a **`fragment_bundle`** (several files into a sub-package) — offer those exactly like
the rest. Never re-emit a fragment a capability points at indirectly — `secured_mcp` pulls `SecurityConfig` in
through the option, so emitting it once is correct.

**Two are already decided in step 3 — do not ask them again here:** `data_access` (step 3's "Data access") and
`secured_mcp` (step 3's "MCP OAuth"). Carry each step 3 answer straight through — a yes on MCP OAuth still asks for
`mcp.authorization.resource` and chains to the issuer prompt in step 7, exactly as if it had been picked here.

**A selected capability that carries `options:` is not finished until you have walked them.** A capability owning a
whole configuration namespace declares it as an `options:` list in the same record shape a group uses, and those
keys are asked HERE — step 6 walks `groups:`, and these are not in a group, so skipping them here means they are
never asked at all. Same rules as step 6: show each option's **full property key + default**, translate only the
`desc`, split into ≤4-option questions, and honour `advanced`/`requires`/`requires_when`. Run it after any
`subflow:` the capability also declares, so the sub-flow's answer is already known.
`embedded_auth` is the case that exists today: `subflow: authstore` picks the user store, then its six `options:`
cover the rest of `amoeba.auth.*` — token lifetime, signing-key path, the two client registrations. Its
`enabled`/`store`/`users` are already settled (by the selection itself and by the sub-flow), so those three are the
only ones you do not ask.

AskUserQuestion caps 4 options per question, so make the offering **deterministic** rather than improvising a
split — that is what keeps an entry from silently vanishing:

1. Walk `capabilities:` **in file order** and keep those whose `requires` this configuration satisfies.
2. Drop `data_access` and `secured_mcp` (decided in step 3).
3. Ask the remainder in **chunks of 4, in that order**.
4. **State the total and the position up front** — "Extension capabilities that apply here — 6 of them, 1/2".
   Without the count the user cannot tell whether anything is still coming, which is the only real guard against
   dropping one.

Worked example, in-process + MCP enabled (the common case): seven survive — `custom_mcp_tool`,
`builtin_tool_override`, `module_source_tools`, `code_rule`, `authorizer`, `interface_spec_validator`,
`unload_callback` → two questions, 4 + 3. (`db_dialect`/`scope_admin` need `worker.db.auto-provision`,
`module_store_dialect` needs the jdbc module-store backend, so all three are filtered out.)

Recount this list against the yaml rather than trusting the number written here — the count moves whenever a
capability is added, and a stale total is exactly the failure mode rule 4 exists to prevent.

### 6. Advanced options — WALK the surface, one functional GROUP at a time (interactive)
This step walks **`groups:` only**. A capability's own `options:` (e.g. `embedded_auth`'s `amoeba.auth.*`) were
asked in step 5 with the capability that owns them — do not re-ask them here, the same way `data_access` and
`secured_mcp` are not re-offered in step 5.

Do not offer a single "accept all defaults" shortcut that skips the surface, and do not sample only a few groups.
**Walk EVERY applicable group** in `protean-options.yaml`, one group at a time, each headed by its own name — the
groups are the functional units (`ProteanProperties` nested classes). Keep each group's options within that group
(trace options under a "trace" question, mcp under "mcp", etc.); never mix groups into one question set.

Applicable groups, in order — cover all of them:
`admin` → `mcp` (sub-options + `debug`/`session`/`authorization`) → `bridge` → `gate` (details: approval,
signature) → `module` (+ `executor`) → `reconcile` → `module-store` → `trace` (+ `metrics`) → `worker`
(+ `container`/`db`/`sidecar`/`admin-auth`) **only if isolation is worker/container** (skip entirely otherwise)
→ **`module_classpath`** (always).
(`isolation` and the gate on/off + `mcp.enabled` + MCP OAuth were set in step 3; do not re-ask.)

**`module_classpath` is not a `protean.*` group.** It is the file's third top-level section: host jars that exist
for the DEPLOYED MODULES, because a module deploys as source and `RuntimeCompiler` inherits `java.class.path`.
Its entries are keyed by `id`, carry only `build_deps`, and **never write an `application.yml` key** — do not
inject them under `protean:`. Present it last, headed as "what your deployed modules may import", so the user
sees it is a different question from configuring the library.

Per group: present its options (each showing its full property key + default + desc, split into ≤4-option
questions as needed), collect values, then move to the next group. The user may skip a group wholesale, but you
must offer every applicable group — do not stop after a few.

**Every option shown to the user MUST display its full property key**, formatted:
`protean.<group>.<key> — <desc> (default: <default>)`. The key is the record key in `protean-options.yaml`.
**Only the `<desc>` half is Korean** — the key and the default are quoted exactly as the yaml has them, because
that is the string the user will search for when they open `application.yml`. Respect `advanced: true` (only
surfaced here) and each option's `requires`. (AskUserQuestion caps 4 options per question — split a group across
multiple questions/calls when it has more than 4 keys.)

**Boolean options — the checkbox IS the value (checked = ON/true), not "change from default".** AskUserQuestion
cannot pre-check options, so present booleans in two buckets so each checkbox has an unambiguous direction. The
on-screen wording is Korean; **the semantics below are the rule and do not change with the wording**:
- **default-OFF booleans** → a "체크하면 켜집니다 (ON)" question — checked = true.
- **default-ON booleans** → a "체크하면 꺼집니다 (OFF)" question — checked = false; unchecked keeps the ON
  default. (This is the on-screen equivalent of a pre-checked box the user un-checks to turn off.)
Non-booleans (int/long/duration/string): a "check which to set" multi-select, then ask each chosen one's value
(typed) — checking only means "I want to override this default", then you collect the value. Enums: a selection
of the allowed values (default preselected in wording).

### 7. Validation + dependency resolution
After all selections (steps 3–6), run a **validation pass** over the full resolved set before writing anything.
Check, and fix or stop on each:
- **requires satisfied** — every selected option/capability's `requires` is met; force the companion on, or prompt
  for a missing required value (e.g. `gate.signature.required` ⇒ `gate.signature.keys` must be provided;
  `worker.db.auto-provision` ⇒ dialect + admin creds; custom tool ⇒ `mcp.enabled`).
- **requires_when satisfied** — for every option carrying `requires_when`, evaluate each rule: when all its `when`
  conditions hold, the `needs` key must be set to a non-empty value. It cannot be auto-filled (it is an
  environment-specific path/identifier) → **prompt for it (typed), and block generation if still empty.**
  Options declared on a **capability** count here too — `amoeba.auth.service-client-id` requires
  `amoeba.auth.service-client-secret`, because `EmbeddedAuthServerConfig` registers that client only when both are
  non-blank and otherwise registers **nothing, silently**. Half of a credential pair is the one case here that
  produces no error at all, so it has to be caught at generation rather than when CI first gets a 401.
- **enum in range** — every enum value is one of its `allowed` values.
- **sidecar worker runtime needs its artifact (per track)** — `protean.worker.runtime=sidecar` replaces the
  bootJar-exploding embed runtime with an external artifact, and the required key differs by isolation mode:
  `worker` (process track) ⇒ **`worker.sidecar.jar`** (a flat `-worker` uber-jar; a Boot fat jar will not work —
  the release publishes one as the `worker` classifier artifact, so the user need not build it with shadow),
  `container` ⇒ **`worker.sidecar.image`** (`ghcr.io/htcom-code/protean-worker:<ver>`, e.g. `:0.0.1`). The other
  key is inert for that track. Protean resolves this at the **first worker spawn (first deploy)**, not at
  startup — a missing value throws
  `IllegalStateException` there, so validate it here and let `setup.sh` re-check it before anything is deployed.
  `worker.sidecar.shared-api` (process track only) is optional; if set it must be an existing jar. With
  `runtime=sidecar` + `container`, do **not** scaffold the bootJar step — the image already bundles app +
  shared-api.
- **no conflicts** — e.g. data access / shared beans / library modules with `isolation.mode` = worker/container
  (host beans can't be injected there); a `worker.*`/`bridge.*` value set while isolation is in-process (inert — warn).
- **auto-provision = the SCOPE model (worker/container-only)** — `protean.worker.db.auto-provision=true` requires
  `isolation.mode` ∈ {worker, container}; **block** it for in-process. It requires `worker.db.dialect` ∈
  {mysql, postgresql, <custom id>} + admin creds (CREATE DATABASE/USER + GRANT for MySQL, CREATE SCHEMA/ROLE for
  Postgres). Under auto-provision, **each deployed module MUST declare a `scope`** that names a known, ACTIVE
  scope — seed one via `worker.db.scopes` (empty ⇒ implicit `default`) or the scope admin API. A scope-less
  module, an unknown/closed scope, or a scoped module routed to **in-process** is rejected at deploy/reconcile.
  Do NOT scaffold the "auto-provision forces capacity=1" behavior — packing is by scope up to
  `worker.modules-per-worker` (default 128). Scope teardown is operator-driven (detach/destroy) — there is no
  deprovision-on-undeploy flag; undeploy never tears down a scope.
- **jdbc module-store is vendor-adaptive** — `protean.module-store.backend=jdbc` needs a DataSource; the store DDL
  is now vendor-adaptive via the `ModuleStoreDialect` SPI (built-in **h2 / mysql / postgresql**, auto-detected by
  DB product name or forced with `protean.module-store.dialect`). So H2/MySQL/PostgreSQL all work out of the box;
  a startup self-check rejects a wrong (VARCHAR-truncating) dialect. For another vendor (e.g. Oracle) the user
  registers a `ModuleStoreDialect` bean. (No longer H2-only — the CLOB limitation was fixed in protean.)
- **types** — typed numeric/duration values parse; names match `[a-z0-9_.-]` as appropriate.
- **package valid** — `{{PKG}}` is a legal Java package: dot-separated `[a-z_][a-z0-9_]*` segments, no segment is
  a Java reserved word.
- **module-facing deps satisfied** — every selected `module_classpath` entry's `requires` is met. `mybatis` needs
  the `data_access` capability (MyBatis binds to the host DataSource) — **block** without it. Also warn when a
  module-facing dep would be written as anything but `implementation`: `compileOnly` never reaches
  `java.class.path`, so the module fails to compile at its first deploy rather than at startup.
  **`requires` also runs the other way**: a capability may name a `module_classpath` entry, and then that entry is
  **forced on, not offered**. `interface_spec_validator` requires `swagger_annotations` because its generator emits
  `@Schema`/`@Operation` into every DTO and controller it writes, and its promotion-gate-2 rule then rejects a field
  that carries none — so without the jar every module deployed through `amoeba.define_interface` fails to compile at
  its first deploy. Resolve these before step 5 asks about `module_classpath`, and say the entry was forced rather
  than presenting it as still open.
- **annotations and the rule that requires them** — two **warnings** (never blocking; only the author knows what
  their rule will check):
  - `code_rule` selected **without** `swagger_annotations` — if that rule ends up requiring `@Operation`/`@Schema`,
    it becomes a rule nothing can satisfy: a module source that carries those annotations cannot compile at all
    without the jar, so the deploy fails at the compile gate rather than at the rule. Say so, and offer the jar.
  - `swagger_annotations` selected **without** `code_rule` — the annotations are then decoration. Nothing requires
    them, because the only rule shipped by default is `ForbiddenApiRule` (four banned calls, nothing about
    documentation). If the point was to guarantee documented interfaces, a `CodeRule` has to come with it.

  Do not overstate what the pair buys even when both are on: a bytecode rule can require an annotation to be
  **present**, but it does not compare the description text against any document published elsewhere.
- **authorizer needs authentication** — if the `authorizer` capability is selected but nothing authenticates the
  caller (no `mcp.authorization.resource` ⇒ no `SecurityConfig`, no security starters, no `issuer-uri`), **warn**:
  every caller arrives as `caller == null`, so the fragment's `DEPLOY`/`UPDATE`/`DELETE`/`APPROVE` branch denies
  them all and module deployment silently stops working. Offer the two ways out — add authentication (set
  `mcp.authorization.resource`, which forces the issuer prompt), or relax `authorize()` to `Decision.allow()` for
  a local demo. Warning, not blocking: "deny everything" is a legitimate safe default for a local sample.

Produce a short **validation report** (OK / 경고 / 차단) **in Korean** — but quote every offending key, value,
class name and file path exactly as written, so the user can act on it. On a blocking error, do not generate —
go back and prompt for the fix. Then collect `build_deps`, `fragment`s, resolve the DB sub-flow, and **echo the
final resolved configuration** (option set + forced companions + deps + files to be written) for confirmation —
Korean prose around a verbatim list of keys, values and paths.

### 8. Generate
Substitute `{{NAME}}`, `{{PKG}}` (the package typed in step 1), `{{PKG_PATH}}` (=`{{PKG}}` with `.`→`/`),
`{{COORD}}`, `{{VERSION}}`, and DB tokens `{{DB}}`/`{{PW}}`. Engine:
- **`application.yml`** — start from `templates/application.yml.template` (minimal base) and **inject every set
  `protean.*` key** grouped under `protean:`, plus the `spring.datasource` block for the chosen vendor. A
  `requires_when` `needs` key that is **not** `protean.*` goes into its own top-level block, never under
  `protean:` — e.g. `spring.security.oauth2.resourceserver.jwt.issuer-uri` lands under `spring.security`.
  **The same rule governs a capability's `options:`**: `embedded_auth`'s keys are `amoeba.auth.*`, so they form a
  top-level `amoeba:` block. Putting them under `protean:` binds nothing —
  `@ConfigurationProperties("amoeba.auth")` would silently see defaults, embedded auth would stay off, and the app
  would start looking correct. Write
  that one as `${OAUTH_ISSUER_URI}` **with no fallback** (an unset value must abort startup) while every
  *advertised* placeholder keeps a fallback. Never hardcode a host or port into an advertised value: write
  `mcp.authorization.resource` as `http://${SERVER_HOST:localhost}:${SERVER_PORT:8080}/platform/mcp`, and keep
  the template's `server.port: ${SERVER_PORT:8080}` so the bind port and the advertised port cannot drift
  (`SERVER_PORT` is the exact name Spring relaxed-binds to `server.port` — see the template's comment). Unset
  keys are omitted (library default) — optionally leave the most relevant as commented edit-points.
- **`build.gradle`** — from the template: always `org.htcom:protean:<ver>` + `spring-boot-starter-web`; add each
  collected `build_deps` (e.g. jdbc + vendor driver, networknt for strict-schema, security for OAuth). Keep the
  `module_classpath` deps in the template's **separate `[module-facing host classpath]` block**, not mixed into
  the host app's list — the reader must be able to tell "this app uses it" from "a deployed module imports it".
  Write every module-facing dep as `implementation` (never `compileOnly` — it would not reach `java.class.path`).
  For
  `isolation.mode=container` **with `worker.runtime=embed`**, uncomment `tasks.named('bootJar') { archiveClassifier
  = 'boot' }` (the container track auto-detects `build/libs/*-boot.jar` by that literal suffix). With
  `runtime=sidecar` the bootJar is not used — add the shadow plugin instead only if the user builds the flat
  `-worker` sidecar jar themselves.
- **common-support package (always)** — copy all five `templates/support/*.template` into
  `src/main/java/{{PKG_PATH}}/support/`, keeping their class names. These are **not** capability-gated: every
  sample gets them, all four behaviours empty/pass-through, so that adding a cross-cutting concern later is a
  one-file edit instead of a wiring exercise.
  - `BaseService` (abstract, empty) and `BaseMapper` (interface, empty) — supertypes a deployed module's service
    and Mapper extend. They must live in the HOST app: a module deploys as source and `RuntimeCompiler` inherits
    `java.class.path`, so a supertype it names has to resolve there. Tell the user to extend them from module
    sources — and warn that under `worker.runtime=sidecar` this package must be in the curated shared-api jar.
  - `CommonFilter` (`OncePerRequestFilter`, `@Order(HIGHEST_PRECEDENCE + 20)`) — sits after protean's
    `CorrelationIdFilter`/`RequestTraceFilter` and **before** Spring Security, so it sees every request including
    the ones security rejects, but has no Principal.
  - `CommonInterceptor` (`HandlerInterceptor`) + `WebSupportConfig` (`WebMvcConfigurer` that registers it) — the
    MVC-layer counterpart: runs after authentication, sees the Principal and the matched handler, and **reaches
    deployed module routes** because `DynamicEndpointRegistrar` registers them on the host's
    `RequestMappingHandlerMapping` bean. protean ships no `WebMvcConfigurer`, so there is nothing to conflict
    with — and never add `@EnableWebMvc`, which would switch off Boot's MVC autoconfiguration.
  - Add a `Class.forName("{{PKG}}.support.BaseService")` line to `<<fragment-checks>>`.
- **fragments** — copy each selected `templates/fragments/*.template` into `src/main/java/{{PKG_PATH}}/`, rename
  to a real class, substitute names.
- **fragment bundles** — a capability carrying `fragment_bundle` emits a whole `templates/fragments/<dir>/` at
  once. Four rules, each the opposite of a single fragment's:
  - each member goes to `src/<main|test>/java/{{PKG_PATH}}/<sub-package>/` per its `to:`, **not** flat into
    `{{PKG_PATH}}/`;
  - **do NOT rename the classes.** Members reference each other by name and by import, so a rename breaks the
    bundle. `rename: false` says so explicitly;
  - substitute `{{PKG}}` in both the `package` line and the cross-member imports (`{{PKG}}.<sub>.X`);
  - a member whose `when:` is unmet is **skipped, and the rest still emit** — the bundle degrades to its
    dependency-free core rather than dropping wholesale.

  Add one `Class.forName` line per bundle to `<<fragment-checks>>` (the representative class, e.g.
  `{{PKG}}.interfacedef.InterfaceSpecValidator`), and remember the bundle's test members run under
  `./gradlew test` alongside `ConfigMatchesSelectionTest`.
- **infra** — DB docker path: `docker-compose.yml` from `templates/db/*`. Its `init/*.sql` depends on the
  DataSource's PURPOSE: a **data-access** DataSource gets `init/01-schema.sql` (the `items` table); a DataSource
  that only backs the **jdbc module-store** does NOT (Protean creates its own store tables) — omit the items init.
  H2 data-access: `schema.sql`. existing/other: none.
- **provisioning admin (D5)** — when `worker.db.auto-provision=true` AND the DB is docker-managed, generate
  `init/00-provision-admin.sql` creating the `worker.db.admin-username`/`admin-password` account with
  CREATE DATABASE/USER + GRANT (MySQL) or CREATE SCHEMA/ROLE (Postgres), so provisioning works at deploy. For an
  existing server, instead print the exact GRANT the admin account needs. Never leave admin creds that don't
  exist on the target DB.
- **scope seed + deploy guidance (auto-provision)** — set `protean.worker.db.scopes` in `application.yml` to at
  least one seed scope (e.g. `[default]`) so modules have an ACTIVE scope to bind to. In the README's deploy
  section, show that every module deploy MUST pass a **`scope`** (deploy-arg / `module.yaml` `scope:`) naming a
  seeded/ACTIVE scope, and document the scope admin surface (`protean.scope_*` MCP tools + `/platform/scopes` REST:
  create/open/close/detach/destroy; destroy needs `worker.db.allow-destroy` + `confirm=<name>`). Note packing:
  same-scope modules share a worker up to `modules-per-worker` (128); set 1 for strict isolation.
- **wrapper** — provision with `gradle wrapper --gradle-version 8.14.5` in the new dir (or copy an existing one).
- **README.md** (from template — list the selected capabilities), **`.gitignore`**, **`Application.java`**.
- **setup.sh** (always — the FINAL artifact) — from `templates/setup.sh.template`, `chmod +x`. A Linux/Ubuntu
  install-and-run script for this exact configuration: preflight (JDK 21 via javac, gradlew, protean jar in
  mavenLocal when SNAPSHOT, Docker daemon + compose when a docker DB, sidecar artifact when
  `worker.runtime=sidecar`, free port) → `docker compose up -d --wait` (if docker DB) → `./gradlew run`. Fill
  `{{IS_SNAPSHOT}}` (version ends with `-SNAPSHOT`) and `{{HAS_DB_DOCKER}}` (data access OR jdbc-store DataSource
  selected AND connection = docker), `{{ISOLATION}}` (the isolation mode — the script checks Docker when it is
  `container`), and the sidecar trio `{{WORKER_RUNTIME}}` (`embed`|`sidecar`, `embed` when isolation is
  in-process), `{{SIDECAR_JAR}}`, `{{SIDECAR_IMAGE}}`, `{{SIDECAR_SHARED_API}}` (each empty when unset — the script
  then checks the artifact required for this track and skips the bootJar build under `runtime=sidecar`). Also fill
  `{{OAUTH}}` (`true` when `mcp.authorization.resource` is set) — that gates the issuer preflight block, which
  fails `--check` on an unset `OAUTH_ISSUER_URI` instead of letting the app die with a stack trace, and prints the
  advertised `RESOURCE_URL` built from `SERVER_HOST`/`SERVER_PORT`. Supports `./setup.sh --check`.
- **self-check test** (always) — `src/test/java/{{PKG_PATH}}/ConfigMatchesSelectionTest.java` from
  `templates/fragments/ConfigMatchesSelectionTest.java.template`. Fill its `<<assertions>>` with one
  `assertEquals(<value>, cfg.get("<protean.key>"))` per selected `protean.*` key, `<<fragment-checks>>` with a
  `Class.forName` check per selected fragment, and `<<module-classpath-checks>>` with one `Class.forName` per
  selected `module_classpath` entry (the representative FQCN each entry documents). That last block is the only
  automated guard on module-facing deps — without it a missing jar surfaces at the FIRST DEPLOY as a module
  compile error. `build.gradle` already adds `testImplementation spring-boot-starter-test`. This test loads
  `application.yml` and asserts it matches the selection — it does not start the server.

### 9. Verify (print, do not run)
Lead with the one-command install for a Linux/Ubuntu server, then the manual equivalents. **Explain each step in
Korean; print every command byte-for-byte** — a translated or "tidied" command is one the user cannot paste.
- **`./setup.sh`** — preflight-checks the environment and prerequisites, brings up the DB (if any), and runs the
  server. `./setup.sh --check` runs the checks only. (This is the final generated artifact.)
- (mavenLocal path) `cd <protean repo> && ./gradlew publishToMavenLocal`.
- (DB docker) `docker compose up -d`.
- `./gradlew run` (JDK 21).
- (MCP) `curl -s localhost:8080/platform/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`.
- Hit a deployed module endpoint; `curl localhost:8080/platform/modules` for state.
- Sanity checks the user can run without the server: `./gradlew compileJava` (compiles against the protean jar)
  and `./gradlew test` (runs `ConfigMatchesSelectionTest` — asserts the generated config matches the selection).

## Notes
- MCP is an RCE surface (compiles + hot-loads submitted sources) — off by default. Enabling it in a sample is a
  local demo; the README must warn and point at auth (Bearer/OAuth + `ModuleActionAuthorizer`).
- Modules compile at runtime with `javac` → the server runs on a **JDK 21, not a JRE**.
- `worker` is a reserved Spring profile → use `worker-demo` for any worker demo profile.
- Data access / shared beans / library modules are **in-process only**.

## Module authoring rules (put these in the generated README)

Conventions the generated project imposes on the modules deployed into it. State them in the README's module
section — the module author reads that, not this file.

### Layering — extend the common-support base types

A module written in the MVC shape is Controller → Service → Mapper, and **the Service and the Mapper extend the
base types the environment already provides**:

```java
public class OrdersService extends {{PKG}}.support.BaseService { ... }

@Mapper
public interface OrdersMapper extends {{PKG}}.support.BaseMapper { ... }
```

Both are empty today. Extending them costs nothing now and is what makes a cross-cutting concern added later
reach every module — without that, adding one means editing every module that was ever deployed. The Controller
extends nothing: its cross-cutting seam is `CommonInterceptor`, which already covers module routes.

### `@Transactional` — on the Service only, and only after the module enables it

**Placement: the Service. Never the Mapper, never the Controller.**
- Mapper — a MyBatis Mapper is a JDK proxy generated by `MapperFactoryBean`; `@Transactional` on that interface is
  not honoured. It reads as a transaction boundary and is not one.
- Controller — a boundary there wraps request parsing and serialisation in the transaction, holding the connection
  for the whole exchange.
- Service — the one place where a unit of work is a method.

**It does not work out of the box, and it fails SILENTLY.** Warn about this whenever data access is selected:
a module runs in a **child** `ApplicationContext` (`ModuleContainer.createChild` → `setParent` + ClassLoader +
`ProteanTaskExecutor`, nothing else), and transaction advisors come from `@EnableTransactionManagement` /
Boot's autoconfiguration, both of which ran in the **host** context. BeanPostProcessors are per-BeanFactory, so the
host's advisor never sees a module bean — `setParent` shares bean *resolution*, not post-processing. An
unannotated-looking `@Transactional` method therefore just runs without a transaction. protean declares no
`PlatformTransactionManager` of its own (zero occurrences in its source).

Two ways out, both the module's own doing:
1. **Declarative** — the module's `@Configuration` adds `@EnableTransactionManagement` and a
   `PlatformTransactionManager` (it may inject the host's, or build one over its own `DataSource`).
2. **Programmatic** — inject the host's `PlatformTransactionManager` and use a `TransactionTemplate`. No child-context
   infrastructure needed, so nothing can silently no-op.

**What the transaction covers** (guide `07-data-access.md`): in-process + the host's shared `DataSource` + the host
transaction manager → participates in the host transaction (same connection, same boundary). In-process + a
DataSource the module built itself → an independent transaction. worker/container → a separate process, so
**always** isolated; bind across it over the RPC bridge, not a shared transaction.
