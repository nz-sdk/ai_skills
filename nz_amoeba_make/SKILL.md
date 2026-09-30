---
name: nz_amoeba_make
description: 'Scaffold a runnable Protean-consuming sample server from scratch under prototype/<name>. Walks the user through the FULL Protean option surface (every protean.* setting + every consumer extension point + a database sub-flow) and generates the matching build, config, code, infra, and README. Built for users who do not know Protean — any setting can be configured through the skill, with defaults and plain explanations. Use when someone wants to create a new Protean sample/example server, try a capability, or bootstrap a downstream Protean integration. Triggers: "make a protean sample", "scaffold a protean server", "new protean example", "protean sample 만들어".'
license: AGPL-3.0-only
compatibility:
  agents:
    - claude
metadata:
  version: 0.2.0
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

### 1. Target folder + Java package + HTTP port (typed)
Three typed inputs — ask **all three** here (the user types each; a default suggestion is allowed, but never offer
a name list).

1. **Folder name** — validate `[a-z0-9_-]+`; generate under `prototype/<name>/`; refuse if it exists.
2. **Java package** — default `prototype.<name>` (replace `-`→`_`). The user may type any package
   (e.g. `kr.newzen.amoeba.api`). Validate: dot-separated segments, each matching `[a-z_][a-z0-9_]*`, and no
   segment may be a Java reserved word. This becomes `{{PKG}}`; `{{PKG_PATH}}` = `{{PKG}}` with `.`→`/`.
3. **HTTP port** — default `8080`; validate 1024–65535. This becomes `{{PORT}}`.
   **Ask it rather than assuming**, because samples are generated into the same `prototype/` tree and run on the
   same machine: a fixed default means the second one cannot start next to the first, and the collision surfaces
   as a `BindException` at run time rather than a question at generation time. Tell the user which ports their
   other samples already use if you can see them.
   It only ever appears as the DEFAULT in `${SERVER_PORT:{{PORT}}}` — never as a bare literal — so an operator can
   still override it per deployment without touching the generated files. That is the ONE port concept: the same
   variable drives the bind port and the advertised discovery address, so the two cannot drift.

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
  prompt in step 8 and pulls in the security starters. No ⇒ the MCP surface is open — a local demo only, and the
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
having to find the `advanced` key `mcp.authorization.resource` in step 7, and its `requires` bare key means you
must ask for that value (which in turn forces the JWT issuer prompt in step 8). `scope_admin` is documentation-only.
An entry may instead carry a **`fragment_bundle`** (several files into a sub-package) — offer those exactly like
the rest. Never re-emit a fragment a capability points at indirectly — `secured_mcp` pulls `SecurityConfig` in
through the option, so emitting it once is correct.

**Two are already decided in step 3 — do not ask them again here:** `data_access` (step 3's "Data access") and
`secured_mcp` (step 3's "MCP OAuth"). Carry each step 3 answer straight through — a yes on MCP OAuth still asks for
`mcp.authorization.resource` and chains to the issuer prompt in step 8, exactly as if it had been picked here.

**A selected capability that carries `options:` is not finished until you have walked them.** A capability owning a
whole configuration namespace declares it as an `options:` list in the same record shape a group uses, and those
keys are asked HERE — step 7 walks `groups:`, and these are not in a group, so skipping them here means they are
never asked at all. Same rules as step 7: show each option's **full property key + default**, translate only the
`desc`, split into ≤4-option questions, and honour `advanced`/`requires`/`requires_when`. Run it after any
`subflow:` the capability also declares, so the sub-flow's answer is already known.
**One capability carries `options:` today.** Recount in the yaml rather than trusting this list — it goes
stale the moment a second is added, which is the same failure mode rule 4 below exists to prevent.
- `interface_spec_validator` — ten `options:` under `amoeba.skeleton.*`, `amoeba.interface.*` and
  `amoeba.deploy-callback.*`. Four decide the generated shape: the service-layer shape, the skeleton's data
  access, whether a spec may override either, and the L3 rule's kill switch.
  `amoeba.skeleton.service-interface` is the project's service-layer standard, and its note says to write it out
  **even when the answer is the default** — so it is not one you may quietly leave unset.
  The other six are the **deploy-time webhook**: ask `amoeba.deploy-callback.enabled` first and ask the remaining
  five ONLY on a yes — they are meaningless while it is off, and its default is off. The class ships either way
  (SpecBearingDeployTool takes it as a constructor argument), so "no" costs one disabled bean, not a code branch.

AskUserQuestion caps 4 options per question, so make the offering **deterministic** rather than improvising a
split — that is what keeps an entry from silently vanishing:

1. Walk `capabilities:` **in file order** and keep those whose `requires` this configuration satisfies.
2. Drop `data_access` and `secured_mcp` (decided in step 3).
3. Ask the remainder in **chunks of 4, in that order**.
4. **State the total and the position up front** — "Extension capabilities that apply here — 6 of them, 1/2".
   Without the count the user cannot tell whether anything is still coming, which is the only real guard against
   dropping one.

Worked example, in-process + MCP enabled + data access (the common case): eight survive — `custom_mcp_tool`,
`builtin_tool_override`, `module_source_tools`, `db_metadata_tools`, `code_rule`, `authorizer`,
`interface_spec_validator`, `unload_callback` → two questions, 4 + 4. (`db_metadata_tools` needs `data_access`,
so without data access it drops out → 4 + 3. `db_dialect`/`scope_admin` need `worker.db.auto-provision`,
`module_store_dialect` needs the jdbc module-store backend, so all three are filtered out.)

Recount this list against the yaml rather than trusting the number written here — the count moves whenever a
capability is added, and a stale total is exactly the failure mode rule 4 exists to prevent.

### 6. Deployment infrastructure (one selection)
Ask **how far the generated project should carry its own deployment**. One question, four levels, each a
superset of the one before. Default **`container`** — it assumes nothing about the user's organisation or
hardware, and an image plus a compose file is useful anywhere.

| Level | Emits (all from `templates/infra/`) |
|---|---|
| `none` | nothing. `setup.sh` on a host is the whole story |
| `container` | `Dockerfile` · `docker-compose.yml` · `.env.example` · `.dockerignore` · `.gitattributes` · `docs/docker.md` |
| `container + CI` | the above + `.github/workflows/ci.yml` · `docs/ci-cd.md` |
| `full` | the above + `.github/workflows/deploy.yml` · `.github/runner/{docker-compose.yml,.env.example}` · `docs/secrets.md` |

**Say what the last level commits them to before they pick it.** `full` is not merely "more files": it deploys
to a **self-hosted runner's own host Docker**, and on a free-plan private repository there is **no approval
gate available** (branch protection, rulesets and Environment protection rules all return
`403 Upgrade to GitHub Pro`), so a green CI reaches production with no human confirmation. Offer the
`workflow_dispatch`-only variant — delete the `workflow_run:` block — to anyone who does not want that.

`full` needs two more typed inputs, asked only at that level:
- **repository URL** → `{{REPO_URL}}` (e.g. `https://github.com/<owner>/<repo>`). The runner registers against it.
- **deploy-host runner name** → the value the operator must store as the `DEPLOY_RUNNER_NAME` Actions variable.
  Do not invent it; explain that `deploy.yml` compares it to `$RUNNER_NAME` and refuses to deploy on a mismatch,
  and that it is set in the GitHub UI, not in a generated file.

Two things this step CHANGES elsewhere, both easy to miss:

1. **`docker-compose.yml` means the APP once this level is ≥ `container`.** At `none`, a docker DB keeps
   today's behaviour and writes the vendor compose from `templates/db/` as `docker-compose.yml`. At
   `container` or above that name belongs to the app, so the database moves to `docker-compose.local-db.yml`
   using `templates/infra/docker-compose.local-db.<vendor>.yml.template` — an OVERLAY that patches
   `depends_on` and `DB_HOST` onto the app service. Never emit both under the same name.
2. **`.gitignore` gains `.env`/`.env.local`** (already marked `[OPTIONAL infra]` in `templates/gitignore.template`).

Skip the question entirely when it cannot apply: `h2` in-memory with no MCP surface has nothing to deploy.
Emitting infra is also independent of `protean.isolation.mode` — `worker`/`container` isolation describes where
MODULES run, not how the app itself is shipped.

### 7. Advanced options — WALK the surface, one functional GROUP at a time (interactive)
This step walks **`groups:` only**. A capability's own `options:` (e.g. `interface_spec_validator`'s
`amoeba.skeleton.*`) were
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

### 8. Validation + dependency resolution
After all selections (steps 3–6), run a **validation pass** over the full resolved set before writing anything.
Check, and fix or stop on each:
- **requires satisfied** — every selected option/capability's `requires` is met; force the companion on, or prompt
  for a missing required value (e.g. `gate.signature.required` ⇒ `gate.signature.keys` must be provided;
  `worker.db.auto-provision` ⇒ dialect + admin creds; custom tool ⇒ `mcp.enabled`).
- **requires_when satisfied** — for every option carrying `requires_when`, evaluate each rule: when all its `when`
  conditions hold, the `needs` key must be set to a non-empty value. It cannot be auto-filled (it is an
  environment-specific path/identifier) → **prompt for it (typed), and block generation if still empty.**
  Options declared on a **capability** count here too, not just those under `groups:`. Watch credential pairs in
  particular (`protean.worker.db.admin-username` / `admin-password`): half a pair is the one case here that can
  produce **no error at all** — the feature registers nothing, silently — so it has to be caught at generation
  rather than when CI first gets a 401.
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
  its first deploy. Resolve these before step 7 asks about `module_classpath` (it is the LAST thing step 7's group
  walk presents, not a step 5 question), and say the entry was forced rather
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
  caller (no `mcp.authorization.resource` ⇒ no `SecurityConfig`, no security starters, no `issuer-uri`, no
  audience check), **warn**:
  every caller arrives as `caller == null`, so the fragment's `DEPLOY`/`UPDATE`/`DELETE`/`APPROVE` branch denies
  them all and module deployment silently stops working. Offer the two ways out — add authentication (set
  `mcp.authorization.resource`, which forces the issuer prompt), or relax `authorize()` to `Decision.allow()` for
  a local demo. Warning, not blocking: "deny everything" is a legitimate safe default for a local sample.

Produce a short **validation report** (OK / 경고 / 차단) **in Korean** — but quote every offending key, value,
class name and file path exactly as written, so the user can act on it. On a blocking error, do not generate —
go back and prompt for the fix. Then collect `build_deps`, `fragment`s, resolve the DB sub-flow, and **echo the
final resolved configuration** (option set + forced companions + deps + files to be written) for confirmation —
Korean prose around a verbatim list of keys, values and paths.

### 9. Generate
Substitute `{{NAME}}`, `{{PKG}}` (the package typed in step 1), `{{PKG_PATH}}` (=`{{PKG}}` with `.`→`/`),
`{{PORT}}` (the port typed in step 1), `{{COORD}}`, `{{VERSION}}`, and DB tokens `{{DB}}`/`{{PW}}`.

**★ `{{COORD}}` IS `group:artifact` — WITHOUT THE VERSION.** Step 2 asks the user for a *coordinate* that
includes it (`org.htcom:protean:0.0.1`), so the two are not the same string and you must split before
substituting: `{{COORD}}` = `org.htcom:protean`, `{{VERSION}}` = `0.0.1`. Templates combine them themselves —
`build.gradle.template` writes `'{{COORD}}:{{VERSION}}'`, and `setup.sh.template` re-splits `{{COORD}}` with
`${COORD%%:*}` / `${COORD##*:}` to locate the mavenLocal pom. Substituting the full three-part coordinate yields
`org.htcom:protean:0.0.1:0.0.1` in `build.gradle` and a broken mavenLocal path in `setup.sh`.

**★ Placeholders the generator must fill that are NOT typed by the user**, listed here because each is a boolean
the templates branch on and an unset one silently reads as "false": `{{NAME_KEBAB}}`, `{{IS_SNAPSHOT}}`,
`{{HAS_DB_DOCKER}}`, `{{HAS_DB_EXTERNAL}}` (data access whose connection mode is `existing` or `other` — this is
what arms `setup.sh`'s external-DB preflight), `{{ISOLATION}}`, `{{WORKER_RUNTIME}}`, `{{SIDECAR_*}}`,
`{{OAUTH}}`, `{{REPO_URL}}`.

Engine:
- **`application.yml`** — start from `templates/application.yml.template` (minimal base) and **inject every set
  `protean.*` key** grouped under `protean:`, plus the `spring.datasource` block for the chosen vendor. A
  `requires_when` `needs` key that is **not** `protean.*` goes into its own top-level block, never under
  `protean:` — e.g. `spring.security.oauth2.resourceserver.jwt.issuer-uri` lands under `spring.security`.
  **The same rule governs a capability's `options:`**: `interface_spec_validator`'s keys are `amoeba.skeleton.*` /
  `amoeba.interface.*`, so they form a top-level `amoeba:` block. Putting them under `protean:` binds nothing —
  the `@Value`/`@ConfigurationProperties` lookups would silently see defaults and the app would start looking
  correct. Write the issuer
  as `${OAUTH_ISSUER_URI}` **with no fallback** (an unset value must abort startup) while every
  *advertised* placeholder keeps a fallback.
  **★ `spring.datasource.password` FOLLOWS THE CONNECTION MODE, and getting it wrong commits a live credential.**
  docker ⇒ `${DB_PASSWORD:{{PW}}}` (a value the skill generated and also wrote into the compose file — throwaway,
  and the two must agree). **existing / other ⇒ `${DB_PASSWORD}` with NO fallback**, because there `{{PW}}` is the
  password the USER TYPED for a server that already exists. `prototype/nz_trilo` was generated with
  `password: "${DB_PASSWORD:trilo1234!}"` while `prototype/nz_ammon` — same skill, same `existing` path — got
  `${DB_PASSWORD}`. One spec, two results, which is what `db-vendors.yaml`'s note now closes. (Nothing leaked:
  nz_trilo is not a git repository and nz_ammon, which is tracked, carries the safe form. The point is that which
  form you get was left to judgment.)
  ⚠ And do NOT present no-fallback here as the OAUTH_ISSUER_URI guarantee: `spring.datasource.*` is bound by the
  `@ConfigurationProperties` Binder, which leaves an unresolved `${...}` as a literal string, and Hikari connects
  lazily — so an unset `DB_PASSWORD` starts the app cleanly and fails at the FIRST QUERY. Say that wherever you
  write the key. Never hardcode a host or port into an advertised value: write
  `mcp.authorization.resource` as `http://${SERVER_HOST:localhost}:${SERVER_PORT:{{PORT}}}/platform/mcp`, and keep
  the template's `server.port: ${SERVER_PORT:{{PORT}}}` so the bind port and the advertised port cannot drift
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
  to a real class, substitute names. A key carrying **`test_fragment`** also emits that one into
  `src/test/java/{{PKG_PATH}}/` — **keep its class name** (unlike a main fragment): the test asserts a structural
  guarantee, not a project-specific policy, so there is nothing to rename it after. Today that is
  `protean.mcp.authorization.resource` → `ResourceServerOnlyTest`, which pins that this app **verifies tokens and
  never issues them** — a guarantee that lives in what the app does not carry, so no reading of the main sources
  can confirm it.
- **`emit` instructions** — a key or capability carrying `emit` names config that must be written even though its
  library default is empty. `secured_mcp` requires `scopes-supported: [mcp.read, mcp.write, mcp.admin]` and
  `bearer-methods-supported: [header]`: `SecurityConfig` gates on exactly those three scope names, so leaving them
  unadvertised ships a discovery document a client cannot act on. `ResourceServerOnlyTest` fails if you skip it.
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
- **DB infra** — DB docker path: `docker-compose.yml` from `templates/db/*`. Its `init/*.sql` depends on the
  DataSource's PURPOSE: a **data-access** DataSource gets `init/01-schema.sql` (the `items` table); a DataSource
  that only backs the **jdbc module-store** does NOT (Protean creates its own store tables) — omit the items init.
  H2 data-access: `schema.sql`. existing/other: none.
  ⚠ **Only when step 6 chose `none`.** At `container` or above, `docker-compose.yml` is the APP's file, so the
  database is written as `docker-compose.local-db.yml` from
  `templates/infra/docker-compose.local-db.<vendor>.yml.template` instead. That overlay carries no `init/`
  mount (see its comment on why a directory bind breaks the entrypoint) — put seed SQL in a single-file mount.
- **deployment infra (step 6)** — copy from `templates/infra/` per the chosen level, mapping filenames:
  `Dockerfile.template` → `Dockerfile`, `dockerignore.template` → `.dockerignore`,
  `gitattributes.template` → `.gitattributes`, `env.example.template` → `.env.example`,
  `docker-compose.app.yml.template` → `docker-compose.yml`, `workflows/*.template` → `.github/workflows/*`,
  `runner/docker-compose.yml.template` → `.github/runner/docker-compose.yml`,
  `runner/env.example.template` → `.github/runner/.env.example`, `docs/*.md.template` → `docs/*.md`.
  Substitute `{{NAME}}`, `{{NAME_KEBAB}}` (= `{{NAME}}` with `_`→`-`; it names containers, volumes and the
  compose project), `{{PKG}}`, `{{PORT}}`, `{{DB}}`, and at the `full` level `{{REPO_URL}}`.
  Four things to get right:
  - **★ PRUNE EVERY `[OPTIONAL local-db]` BLOCK WHEN NO OVERLAY IS EMITTED.** `docker-compose.local-db.yml` is
    written only for a **docker-managed** database at infra ≥ `container`. For an existing server, `h2`, `other`,
    or no data access at all, the overlay does not exist — but four templates reference it anyway, and they are
    marked `[OPTIONAL local-db]` so you can find them: `workflows/deploy.yml.template`,
    `docker-compose.app.yml.template`, `env.example.template`, `docs/docker.md.template` (each carries the
    replacement text in its own comment). **`deploy.yml` is the one that is not merely cosmetic**: the reference
    is a `type: choice` OPTION, so it is selectable, and an operator who picks it runs `docker compose -f
    docker-compose.yml -f docker-compose.local-db.yml` against a missing file — the deploy fails at the compose
    step, on the production host, after CI went green. Delete that option line.
  - **★ RENAMED FRAGMENTS MUST BE RENAMED EVERYWHERE, NOT JUST IN THEIR OWN FILE.** A single `fragment` is
    renamed to a real class (step 9), but other templates refer to those classes in prose and in
    `<<fragment-checks>>`. After emitting, grep the generated tree for the template placeholder names
    (`ExampleTool`, `ExampleAuthorizer`, `ExampleCodeRule`, `ExampleUnloadCallback`, `ExampleToolOverride`) and
    replace each with the name you actually used — `README.md`, `SecurityConfig.java` and the
    `module_source_tools` bundle's tests all mention the authorizer or the custom tool. A leftover placeholder
    name is a reference to a class that does not exist. (`fragment_bundle` members are the opposite: `rename:
    false`, so never touch those.)
  - **`{{...}}` is not always a placeholder.** `ci.yml` contains `{{.State.Health.Status}}`, which is docker
    inspect's Go template. Skill placeholders are `{{UPPER_SNAKE_CASE}}` only — copy anything else verbatim.
  - **Do not "simplify" the load-bearing parts.** Each is a comment explaining a failure that is otherwise
    silent: no `java -jar`, `jmods` removed in the build stage, no `services:`/`--network host` in CI,
    `overwrite: true` on the artifact uploads, the deploy-host label plus `$RUNNER_NAME` self-check, the smoke
    hitting `SERVER_HOST` rather than `localhost`, and identical numbers on both sides of `ports`.
  - **Tell the user what only a human can do**: `git update-index --chmod=+x gradlew setup.sh` (a mode bit
    `.gitattributes` cannot fix), and — at `full` — registering the Actions Secrets/Variables listed in
    `docs/secrets.md`, including `DEPLOY_RUNNER_NAME`.
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
- **`settings.gradle`** (always) — from `templates/settings.gradle.template`. Easy to forget because nothing else
  references it, and the cost is not just `rootProject.name`: it carries the **foojay toolchain resolver**, which
  is what provisions JDK 21 on a machine that does not have one. Omit it and `setup.sh`'s JDK 21 preflight fails
  on exactly the fresh-clone case the resolver exists for.
- **README.md** (from template — list the selected capabilities), **`.gitignore`**, **`Application.java`**.
- **setup.sh** (always — the FINAL artifact) — from `templates/setup.sh.template`, `chmod +x`. A Linux/Ubuntu
  install-and-run script for this exact configuration: preflight (JDK 21 via javac, gradlew, protean jar in
  mavenLocal when SNAPSHOT, Docker daemon + compose when a docker DB, sidecar artifact when
  `worker.runtime=sidecar`, free port) → `docker compose up -d --wait` (if docker DB) → `./gradlew run`. Fill
  `{{IS_SNAPSHOT}}` (version ends with `-SNAPSHOT`) and `{{HAS_DB_DOCKER}}` (data access OR jdbc-store DataSource
  selected AND connection = docker), **`{{HAS_DB_EXTERNAL}}`** (the same but connection = `existing`/`other` —
  arms the external-DB preflight: `DB_PASSWORD` present, `DB_HOST` not silently falling back to `localhost`, a
  TCP probe, and the reminder that no tool runs DDL. That block is what
  `docker-compose.app.yml.template` means when it says "setup.sh's check", so the two must not drift),
  `{{ISOLATION}}` (the isolation mode — the script checks Docker when it is
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

### 10. Verify (print, do not run)
Lead with the one-command install for a Linux/Ubuntu server, then the manual equivalents. **Explain each step in
Korean; print every command byte-for-byte** — a translated or "tidied" command is one the user cannot paste.
- **`./setup.sh`** — preflight-checks the environment and prerequisites, brings up the DB (if any), and runs the
  server. `./setup.sh --check` runs the checks only. (This is the final generated artifact.)
- (mavenLocal path) `cd <protean repo> && ./gradlew publishToMavenLocal`.
- (DB docker) `docker compose up -d`.
- `./gradlew run` (JDK 21).
- (MCP) `curl -s localhost:{{PORT}}/platform/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`.
- Hit a deployed module endpoint; `curl localhost:{{PORT}}/platform/modules` for state.
- Sanity checks that need no running deployment: `./gradlew compileJava` (compiles against the protean jar) and
  `./gradlew test` (runs `ConfigMatchesSelectionTest` — asserts the generated config matches the selection; plus
  `ResourceServerOnlyTest` when the MCP surface is secured, and both fragment bundles' tests).
  **Do not describe this as "without the server".** `ConfigMatchesSelectionTest` starts nothing, but
  `ResourceServerOnlyTest` is `@SpringBootTest(webEnvironment = RANDOM_PORT)` and brings up a real Tomcat — on a
  random port, so it cannot clash with a running instance, and against an `.invalid` issuer, so no Authorization
  Server has to exist. Say what is actually true: the suite is **offline** and needs no AS and no reachable
  database. And say why the database part is not a guarantee — the DataSource is fully wired and Hikari merely
  connects lazily, so a green `./gradlew test` proves nothing about the DB. That is what `./setup.sh --check` is
  for.
- **(step 6 ≥ `container`) the container path**, printed as its own short block:
  ```
  cp .env.example .env          # fill in the required values — OAUTH_ISSUER_URI has no default
  docker compose up -d --build
  docker compose ps             # wait for STATUS to read (healthy)
  ```
  With the sidecar overlay:
  `docker compose -f docker-compose.yml -f docker-compose.local-db.yml up -d --build`.
  Say that `down` keeps the module-store volume and `down -v` discards every deployed module.
- **(step 6 = `full`) what a human must do before CI can work** — this is setup, not verification, so print it
  as a checklist rather than as commands to paste blindly: `git update-index --chmod=+x gradlew setup.sh`;
  register the runner (`cd .github/runner && cp .env.example .env && docker compose up -d`); add the Actions
  Secrets/Variables from `docs/secrets.md`, `DEPLOY_RUNNER_NAME` included; and add the `deploy-host` label to
  exactly one runner **in the GitHub UI** — labels are fixed at registration time, so editing the compose file
  afterwards changes nothing.

## Notes
- MCP is an RCE surface (compiles + hot-loads submitted sources) — off by default. Enabling it in a sample is a
  local demo; the README must warn and point at auth (Bearer/OAuth + `ModuleActionAuthorizer`).
- Modules compile at runtime with `javac` → the server runs on a **JDK 21, not a JRE**.
- `worker` is a reserved Spring profile → use `worker-demo` for any worker demo profile.
- Data access / shared beans / library modules are **in-process only**.
- The generated `application.yml` turns on `spring.mvc.problemdetails`, so a deployed module's
  `ResponseStatusException` message reaches the caller. Say what it costs: every error response app-wide becomes
  `application/problem+json` (RFC 9457) with the text under `detail`. A module cannot arrange this itself — its
  controller is generated, and a `@RestControllerAdvice` in a child context is never collected.

## Deploying modules into the generated server (put these in the generated README too)

Learned from five modules built against a generated server, where the same module was rewritten three times.

### Ask the server before writing anything

The project standard lives in `application.yml` and **changes which files the author writes**. So the first step of
a new module is not reading documentation, it is two calls:

1. `tools/list` → read `amoeba.define_interface`'s `inputSchema.$defs.interfaceSpec`. Under a pinned skeleton
   (`spec-overrides-allowed: false`) `dataAccess` and `serviceInterface` are **absent**, and sending either is
   rejected.
2. `amoeba.define_interface` with a minimal spec → read `files[].serverOwned`. That, not any table and not the file
   headers, is what says which files are yours.

### Run the server's own checks locally before deploying

An install failure arrives without its cause (see the deploy tool's `installFailureHint`), so bisecting a failed
deploy is expensive. Everything the server rejects can be run locally first:

| Step | What it reproduces |
|---|---|
| Extract the running server's `-cp` into a file | the exact host classpath the module compiles against |
| Drop `files[]` into a javac tree by their `package` lines | the module compile |
| Run the contract test with the JUnit Platform Launcher | promotion gate 1 |
| Call `MapperConsistencyChecker` and `InterfaceContractRule` directly | L2 + promotion gate 2 |

**Use the generated sources, not hand-written stubs.** Stubs miss `@Schema` and bury the real violation under
dozens of false ones; with the real files "0 violations" is a clean signal.

### Keep only the inputs in the repository

The deployed module is the source of truth (`amoeba.export_module_source` reads it back). A module directory holds
what the deployment does *not* contain: the spec, the deploy script, a smoke script, the DDL, a README, and the
author-owned sources. Copies of generated files drift — if you keep them, re-deploy after every edit.

**Editing only the mapper XML still needs a redeploy**: `protean.reload_module_resources` is a no-op for it,
because the XML is parsed once at initialisation.

Put guards in the deploy script — a generator regression is silent otherwise: the generated MyBatis config must
contain `setContextClassLoader`, a list operation's Mapper must contain its `count<Op>`, `needsSharedBeans` must be
what you expect, and `replacedFiles`/`seededFiles` must be checked as *fields*, not eyeballed.

### DDL is executed by a human

There is no tool that runs DDL: `protean.scope_create` provisions per-scope databases for worker isolation (and
needs `worker.db.auto-provision`), and `debug.evaluate` requires a suspended breakpoint. Generate `<mod>-ddl.sql`
as an artifact and say in its header that **the unique key is the only thing enforcing duplicate detection**,
because the module catches `DuplicateKeyException` rather than pre-reading.

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
