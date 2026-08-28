# Protean Capability Reference

The authoritative catalog of protean capabilities a generated sample can include. The
`nz_amoeba_make` skill reads this file to (1) present selectable capabilities, (2) resolve their
dependencies, and (3) emit the right config, dependencies, and code fragments.

**Grounding:** derived from `protean/docs/guide/{03-configuration,05-isolation-modes,06-promotion-gates,07-data-access,08-mcp-integration,10-spi-extension,11-operations,12-security}.md`
and `org/htcom/protean/autoconfigure/ProteanProperties.java`. Guides exist as EN (`NN-*.md`) + KO (`NN-*.ko.md`) pairs.

Coordinate: `org.htcom:protean`, default `0.0.1` — released to Maven Central on 2026-08-09 (published set: plain
+ sources + javadoc + `worker` classifier; the sidecar image is `ghcr.io/htcom-code/protean-worker:0.0.1`). A
`0.0.1-SNAPSHOT` build from the protean repo (`-Pversion=<ver>` for a release) still resolves via `mavenLocal()`.
Modules are compiled at runtime with `javac` → the server **must run on a JDK 21, not a JRE**.

---

## Registration mechanisms

Every capability plugs in through one of eight mechanisms. Auto-configuration (`ProteanAutoConfiguration`)
component-scans `org.htcom.protean`, so consumer beans in any package are collected.

| # | Mechanism | How | Applies to |
|---|---|---|---|
| ① | Bean auto-collection (interface SPI) | `@Component`/`@Bean` implementing the SPI; collected via `List<T>`/`Map` | `McpTool`, `CodeRule`, `DbDialect` (keyed by `id()`), `IsolationStrategy` (keyed by `mode()`), `WorkerParentTierTarget` |
| ② | `@ConditionalOnMissingBean` override | Supply one bean to replace a default | `ModuleActionAuthorizer` (replaces permissive default) |
| ③ | `@ConditionalOnProperty` backend selection | A config value picks the active bean | `ModuleStore` (`module-store.backend`), `WorkerRuntimeProvider` (`worker.runtime`) |
| ④ | Runtime `McpDispatcher.registerTool()` | Inject the dispatcher bean, add/replace tools live (pushes `tools/list_changed`) | live tool add / built-in override |
| ⑤ | Config-property toggle | Enable/relax a capability in `application.yml` | `mcp.*`, `isolation.mode`, `gate.*`, `worker.*`, `module.shared-lib-*`, … |
| ⑥ | Classpath dependency (reflective) | Add a jar to the runtime classpath to activate a reflectively-loaded feature | `SchemaValidator` (networknt) under `strict-schema` |
| ⑦ | Trusted-key config | Populate a key map; sign artifacts client-side | signature gates (`gate.signature.keys`) |
| ⑧ | Deployed-module child-context bean | The deployed module declares beans in its own context | data-access (`@Autowired` host beans), `ModuleUnloadCallback` |

---

## Axis A — Isolation mode

SPI `org.htcom.protean.isolation.IsolationStrategy`; global key `protean.isolation.mode`, per-module
`ModuleDescriptor.isolationMode`.

| Capability | Selection / key | What it does | Mech | Generation impact |
|---|---|---|---|---|
| **in-process** (default) | `isolation.mode=in-process` | Same JVM, dedicated ClassLoader + child context; direct shared-bean access; lowest cost (`InProcessIsolation`) | ⑤ | Minimal. **Required** for data-access / shared beans / library modules |
| **worker** | `isolation.mode=worker` + `worker.runtime=embed\|sidecar` | Separate JVM via `ReverseProxy`; crash-isolated (502 on crash) (`WorkerProcessIsolation`) | ⑤③ | embed → `gradle bootJar`; sidecar → `worker.sidecar.{jar,image,shared-api}` |
| **container** | `isolation.mode=container` | One hardened Docker container per module (cgroup / read-only rootfs / cap-drop / seccomp); strongest. No pool, **no RPC bridge** (`ContainerWorkerIsolation`) | ⑤ | Docker daemon + `gradle bootJar` + `worker.container.*` |
| custom strategy | `IsolationStrategy` bean with unique `mode()` | User-defined execution mode | ① | advanced |

Worker runtime sub-SPI `WorkerRuntimeProvider` (`protean.worker.runtime`): `embed` (default, `matchIfMissing`) vs
`sidecar`. `worker.*` knobs: `modules-per-worker`(4), `min-warm`(0), `auto-restart`(false), `shutdown-grace-ms`(5000),
`rpc-bridge`(false).

> **Reserved profile caveat:** `worker` is a reserved Spring profile. A worker demo profile must be named
> `worker-demo` (per `examples/quickstart`), never `worker`.

---

## Axis B — MCP surface

The MCP adapter is an **RCE surface** (it compiles and hot-loads submitted sources), so it is **off by default**
(fail-safe). Transports: Streamable HTTP `POST/GET /platform/mcp` + optional stdio. Protocol pinned `2025-11-25`.

| Capability | Key / registration | Notes | Mech |
|---|---|---|---|
| Enable MCP | `mcp.enabled=true` | Exposes the deploy endpoint. **Requires a security posture** (localhost / Bearer / OAuth) — see §Security | ⑤ |
| stdio transport | `mcp.stdio=true` | Newline-delimited JSON-RPC for locally-spawned agents | ⑤ |
| session / notify | `mcp.session.enabled` (default true) | SSE `tools/list_changed`, message logs, `resources/updated` | ⑤ |
| debug tools | `mcp.debug.enabled=true` | JDI debug (Level 3: launch/breakpoint/evaluate/redefine). Needs `-g` compile; idle-timeout default 30m | ⑤ |
| strict schema | `mcp.strict-schema=true` + networknt jar | Full JSON-Schema validation of args + structured results at dispatch; degrades to zero-dep guard if jar absent | ⑤⑥ |
| OAuth metadata | `mcp.authorization.{resource,authorization-servers,scopes-supported,bearer-methods-supported}` | RFC 9728 protected-resource metadata (opt-in discovery only; auth still delegated) | ⑤ |
| **custom MCP tool** | `McpTool` bean | New tool listed alongside built-ins. Contract: `name`/`description`/`inputSchema`/`call` (+ optional `title`/`outputSchema`/`annotations`/`action`). Default `action()`=CUSTOM | ① |
| **override built-in tool** | same-name `McpTool` bean, or `McpDispatcher.registerTool()` | Replace one of the 21 built-ins (e.g. wrap `protean.module_metrics`). Delegate to keep real behavior | ①④ |

`McpTool` collection: `McpDispatcher` builds `Map<name, McpTool>` (last-write-wins → same name replaces). Every
call routes through `ModuleActionAuthorizer`; validated by `SchemaValidator` when `strict-schema=true`.

### Built-in MCP tools (override targets) — 21

Dot-names over raw JSON-RPC (`protean.deploy_module`); the MCP client uses underscores (`protean_deploy_module`).

| Group | Tools (action) |
|---|---|
| Query | `list_modules`(READ) `get_module`(READ) `get_module_source`(READ) `module_versions`(READ) |
| Observability | `module_metrics`(READ) `query_traces`(READ) |
| Deploy / modify | `deploy_module`(DEPLOY) `update_module`(UPDATE) `patch_module`(UPDATE) `reload_module_resources`(UPDATE) `rollback_module`(UPDATE) `uninstall_module`(DELETE) |
| Approval | `approve_module`(APPROVE) `reject_module`(APPROVE) |
| Shared-lib | `deploy_shared_lib`(CUSTOM) `list_shared_libs`(READ) `get_shared_lib`(READ) `remove_shared_lib`(CUSTOM) |
| Config | `config.list`(READ) `config.get`(READ) `config.set`(CUSTOM) — bare names, no `protean.` prefix |

Debug tools (only when `mcp.debug.enabled=true`): `debug.launch/set_breakpoint/await_stop/evaluate/redefine`.

---

## Axis C — Promotion gates

Pipeline: `(signature) → ① tests → ② review → (approval) → deploy → ③ verify → ACTIVE`
(`PromotionPipeline.runGates()`). Defaults are all on the safe side.

| Capability | Key / registration | Notes | Mech |
|---|---|---|---|
| tests gate | `gate.tests-enabled` (default true) | Bundled JUnit runs as the deploy gate; must pass to reach ACTIVE (false → passes even with no tests) | ⑤ |
| review gate | `gate.review-enabled` (default true) | `CodeRule` beans + built-in `ForbiddenApiRule` | ⑤ |
| custom CodeRule | `CodeRule` bean | Static bytecode inspection; non-empty violations = reject. Built-in `ForbiddenApiRule` bans `System.exit`, `Runtime.{halt,exec,addShutdownHook}`, `ProcessBuilder.start` | ① |
| signature gate | `gate.signature.required=true` + `gate.signature.keys` | Ed25519, runs first; every install must be signed by a trusted key or fail | ⑤⑦ |
| shared-lib signature | `gate.signature.shared-lib-required=true` | Uploaded jars (put-jar surface) must carry a valid Ed25519 signature | ⑤⑦ |
| approval gate | `gate.approval.required=true` | Passing installs stored as `PENDING_APPROVAL` (not served); promote via `POST /{id}/approve?approver=`. Unapproved stays unserved across restart | ⑤ |

### Checking a declared interface — three layers

When a module is built from a **declared interface** (a spec submitted over MCP rather than hand-written source),
the check splits into three layers that see different things. Each exists because the one before it is blind to
that class of error, so skipping the middle one is not "less strict", it is a specific gap: cross-field errors go
undetected until a human reads the generated document.

| Layer | Mechanism | Rejects | Sees |
|---|---|---|---|
| **L1 shape** | `mcp.strict-schema=true` + `com.networknt:json-schema-validator` | Misspelled type, missing required property, string where an object belongs | One field at a time, against the tool's declared `inputSchema` — cannot compare fields |
| **L2 meaning** | `interface_spec_validator` capability (`InterfaceSpecValidator`, consumer code) | Path variable with no matching parameter, description that repeats the field name, illegal Java identifier, two operations on one route | The whole spec at once |
| **L3 bytecode** | `CodeRule` bean at review gate ② | What the compiled class actually is | Every deploy path, admin REST included — but code, not intent |

L1 is off by default and **degrades silently** when the validator jar is absent (`McpConfiguration` logs a warning
and validation becomes a no-op) — see the dependency-rules table. L2 returns `List<String>` deliberately, matching
the `CodeRule` shape, so one call reports every violation instead of one per retry. A loose `inputSchema` on the
submitting tool does not lose checks, it moves them from L1 to L2.

Keys client-side: generate with `ModuleSigning.generateKeyPair()`, publish public key to
`gate.signature.keys.<keyId>` = Base64(X.509 Ed25519 public key).

---

## Streaming & long-lived endpoints

Nothing in protean or in this skill restricts a module to plain request/response. Gate ② forbids exactly four calls
(`ForbiddenApiRule`: `System.exit`, `Runtime.{halt,exec,addShutdownHook}`, `ProcessBuilder.start`) — no rule about
threads, sockets, or streaming. The `module_classpath` entries in `protean-options.yaml` only *add* jars; leaving
one off is not a prohibition.

### SSE — supported

| Fact | Where |
|---|---|
| protean streams with `SseEmitter` itself — MCP session stream, `/platform/traces/stream`, `tools/call` progress frames (`text/event-stream`) | `mcp/session/McpSessionRegistry` (`openStream`), guide `04-rest-api.md` |
| Registration ignores the return type — the registrar builds a `RequestMappingInfo` and calls `handlerMapping.registerMapping(info, handler, method)` | `dynamic/DynamicEndpointRegistrar` |
| `module.request-timeout-ms` does **not** kill a stream — `ModuleTimeoutFilter` is a `OncePerRequestFilter`, which skips ASYNC dispatches; the initial dispatch returns as soon as async starts, so the watchdog deregisters immediately | `runtime/ModuleTimeoutFilter` |

Four pitfalls to surface whenever a user asks for streaming:

1. **worker/container + SSE → events can sit in the buffer.** `ReverseProxy.handle()` streams
   (`BodyHandlers.ofInputStream()` + `in.transferTo(out)`) but **never calls `flush()`**, so small SSE events may
   not reach the client until the container buffer fills. The copy is also blocking, so the stream holds one
   main-side request thread for its whole life. **in-process has neither problem — recommend it for streaming.**
   (This is a protean-side gap, not something the generated sample can fix.)
2. **Do not declare a verify probe on a streaming path.** `VerificationGate` probes with `BodyHandlers.ofString()`
   on the shared `HttpClient`, which sets only `connectTimeout(5s)` — there is no read timeout, so the gate blocks
   until the stream ends and the deploy hangs. Safe because the gate is opt-in: it returns immediately when
   `descriptor.verification()` is null.
3. **Close emitters on unload.** An open emitter pins the module `ClassLoader` and defeats the Metaspace
   reclamation protean otherwise guarantees. Register a `ModuleUnloadCallback`, and push from the injected
   `ProteanTaskExecutor` rather than a hand-rolled thread (it is reclaimed automatically on unload).
4. **`module.executor.pool-size` defaults to 2.** A handful of long-lived streams exhausts it.

### WebSocket / STOMP — not supported for module routes

Zero occurrences of websocket/STOMP/`ServerEndpoint` anywhere in protean's source or guides. The cause is the
registration mechanism, not a missing dependency: `DynamicEndpointRegistrar` can only register (and unregister) a
`RequestMappingInfo`, while WebSocket handlers live in a separate registry that has no runtime
register/deregister path. Adding `spring-boot-starter-websocket` changes nothing for a module. Turning the
`rest_mvc` module_classpath entry on or off is equally irrelevant. The only route is a WS endpoint in the **host
app**, which is ordinary Spring and outside what a module can hot-deploy.

---

## Axis D — Consumer SPIs + data / store

| Capability | FQN / key | What it does | Mech | Depends on |
|---|---|---|---|---|
| **data-access module** | child-context parent-first DI | A deployed `gen.*` controller `@Autowired`s host beans (`JdbcTemplate`, `DataSource`, services) | ⑧ | **in-process only** |
| module unload hook | `org.htcom.protean.module.ModuleUnloadCallback` | `onUnload(moduleId)` before child close | ⑧ | in-process |
| DB dialect | `org.htcom.protean.db.DbDialect` (keyed by `id()`) | Per-vendor **scope** provisioning: `createScope`/`detachScope`(data-safe, login-only)/`destroyScope`(irreversible)/`dropScope`/`scopedUrl`. Built-ins: mysql, postgres | ① | `worker.db.auto-provision=true` + `worker.db.dialect` + admin creds |
| scope admin | `protean.scope_*` MCP tools + `/platform/scopes` REST | Scope lifecycle (list/get/create/open/close/detach/destroy). MCP tools always listed (gated at call time); destroy needs `allow-destroy` + `confirm=<name>`. Not code — a runtime surface | ⑤ | `worker.db.auto-provision=true` |
| authorization policy | `org.htcom.protean.mcp.ModuleActionAuthorizer` | Per-call choke point over `ModuleAction{READ,DEPLOY,UPDATE,DELETE,APPROVE,DEBUG,CUSTOM}`. Default `PermissiveModuleActionAuthorizer` allows all | ② | identity is consumer's Spring Security |
| worker runtime | `org.htcom.protean.isolation.WorkerRuntimeProvider` | Supplies worker JVM/container launch prefix (embed/sidecar/custom) | ①③ | worker/container mode |
| module store backend | `org.htcom.protean.module.ModuleStore` | Durable descriptor store; startup reconcile reads `listActive()` to recompile/redeploy | ③ | `module-store.backend=filesystem\|jdbc`; jdbc needs a DataSource |
| module-store dialect | `org.htcom.protean.module.ModuleStoreDialect` (keyed by `id()`) | Per-vendor DDL for the jdbc store (large-text col + auto-increment). Built-in h2/mysql/postgresql; add a vendor or override by id | ① | `module-store.backend=jdbc`; selected by `module-store.dialect` or DB detection. Distinct from `db.DbDialect` |
| shared-lib (static seed) | `module.shared-lib-dir` | App-lifetime URLClassLoader from `*.jar` in the dir, inserted as module CL parent + added to compile classpath | ⑤ | in-process |
| shared-lib (live put-jar) | `SharedLibStore` + `deploy_shared_lib` tool | Runtime jar upload persisted under `module.shared-lib-store-dir`; folded on top of the seed into a new generation; survives restart | ⑤ | `@Profile("!worker")`; eager rebind via `module.eager-shared-lib-invalidation` (default true) |

Support injectables (not SPIs): `ProteanTaskExecutor` (sanctioned background-work executor; raw shutdown hooks are
banned by `ForbiddenApiRule`), `ModuleDescriptor.bridgedInterfaces` (RPC bridge, needs `worker.rpc-bridge=true`).

---

## Dependency rules (skill must enforce)

On each selection the skill auto-includes companions, asks follow-ups, or injects deps:

| Selected capability | Requires (auto) | Rationale |
|---|---|---|
| custom / override MCP tool | `mcp.enabled=true` | MCP config absent otherwise → tool never collected |
| `interface_spec_validator` | nothing (core is JDK + Jackson annotations only); its example MCP tool member is gated by `mcp.enabled=true` | Consumer code, not a protean SPI. Emitted as a fragment BUNDLE into `{{PKG}}.interfacedef` — members reference each other, so they are not renamed. See "Checking a declared interface" |
| `mcp.debug.enabled` | `mcp.enabled=true` (+ idle-timeout 30m default) | debug is a sub-gate of the MCP surface |
| `mcp.strict-schema` | `runtimeOnly 'com.networknt:json-schema-validator'` | core keeps it compileOnly; absent → silent degrade |
| `mcp.authorization.resource` | consumer `SecurityConfig` `permitAll` + 401 `resource_metadata` | protean does not implement auth; delegates |
| MCP enabled (any) | README security warning (RCE, no sandbox) | `12-security.md` |
| data-access / shared beans / library module | `isolation.mode=in-process` | worker/container cannot inject host beans (use RPC bridge) |
| module `@Transactional` | the MODULE's own `@Configuration` must add `@EnableTransactionManagement` + a `PlatformTransactionManager`, **or** use a `TransactionTemplate` over the host's manager | **Silent no-op otherwise.** `ModuleContainer.createChild` builds a child context with only `setParent` + ClassLoader + `ProteanTaskExecutor`; transaction advisors are BeanPostProcessors registered in the HOST context and are per-BeanFactory, so they never proxy a module bean. protean declares no `PlatformTransactionManager`. Place it on the Service — never the Mapper (a `MapperFactoryBean` proxy does not honour it) nor the Controller |
| module service / Mapper layering | extend `{{PKG}}.support.BaseService` / `BaseMapper` | The always-generated common-support seam: a cross-cutting concern added there later reaches every module without editing any module source. Host-side by necessity — `RuntimeCompiler` resolves a module's supertypes off `java.class.path` |
| SSE / long-lived streaming module route | recommend `isolation.mode=in-process`; never declare a verify probe on the streaming path | `ReverseProxy` streams but never flushes, so worker/container can buffer events; the verify probe has no read timeout and would hang the deploy — see "Streaming & long-lived endpoints" |
| WebSocket / STOMP module route | **not possible** — put it in the host app | `DynamicEndpointRegistrar` registers only `RequestMappingInfo`; WS handlers have no dynamic-registration path. Independent of the `rest_mvc` entry |
| DB auto-provision (scope model) | `isolation.mode=worker\|container` + `worker.db.dialect` + admin creds; each module declares a **`scope`** (ACTIVE, from `worker.db.scopes` seed or scope admin) | in-process rejects a scoped module; a scope-less module is rejected at deploy/reconcile under auto-provision; packing is by scope up to `modules-per-worker` (default 128) — NOT forced to 1 |
| signature gate | `gate.signature.keys` populated | no key → every install fails |
| approval gate | document `POST /{id}/approve?approver=` flow | unapproved unserved even after restart |
| `isolation.mode=worker` | `worker.*` block; profile named `worker-demo` | `worker` is a reserved Spring profile |
| `worker.runtime=sidecar` | `worker.sidecar.{jar,image,shared-api}` + shadow/GHCR artifact | process-track sidecar runtime |
| `worker.rpc-bridge=true` | `bridge.url` (+auth), `bridgedInterfaces` | remote shared-bean calls |
| `isolation.mode=container` | Docker daemon + `gradle bootJar` + `worker.container.*` | OS-level sandbox per module |
| `module-store.backend=jdbc` | a DataSource | descriptor persistence backend |
| `bridge.auth-mode=hmac` | `bridge.hmac-window-ms` (clock skew) | replay/tamper defense |

---

## Scope model (DB auto-provisioning) — 2026-07-24 redesign

When `protean.worker.db.auto-provision=true`, deploy means **"select a scope"**, not "isolate every module". A
**scope** is a tenant/domain grouping and is the unit of BOTH DB provisioning AND worker/container packing.

- **Provisioning per scope** — the admin connection creates a dedicated DB/schema + user/role + scoped GRANT once
  per scope; the scoped `spring.datasource.{url,username,password}` is injected into that scope's worker(s).
  Same-scope modules SHARE it; different scopes are isolated. (MySQL = DB+USER per scope; PostgreSQL = SCHEMA+ROLE
  per scope in one DB.)
- **Module declares a scope** — deploy-arg / `module.yaml` key / `ModuleDescriptor` field **`scope`**. Under
  auto-provision it is **required** and must name a **known, ACTIVE** scope. Rejections: no scope → *"must declare
  a scope"*; unknown → *"declare it in worker.db.scopes or create via the scope admin API"*; CLOSED/DETACHED →
  *"reopen it"*; declared on **in-process** isolation → rejected (must be worker/container). auto-provision OFF +
  scope → ignored (warn).
- **Seed vs create** — `protean.worker.db.scopes` = startup seed allowlist (empty → single implicit `default`,
  which must still be named explicitly at deploy). Deployers only *select*; operators *create* (seed or admin API).
- **Packing** — same-scope modules pack into a shared worker/container up to `worker.modules-per-worker`
  (default **128**); boundary = scope. `=1` for strict one-per-module. The old "auto-provision forces capacity=1"
  is **no longer true**.
- **Lifecycle (operator-driven)** — `create → ACTIVE → close → CLOSED → open`; `detach` = data-safe (drop login
  only, keep DB+data, reversible); `destroy` = irreversible DROP CASCADE, gated by `worker.db.allow-destroy` +
  `confirm=<name>`. Undeploy never tears down a scope (there is no `deprovision-on-undeploy` flag — teardown is only detach/destroy).
  Surface: REST `/platform/scopes/*` + MCP `protean.scope_{list,get,create,open,close,detach,destroy}`.
- **Custom vendor** — register a `DbDialect` bean (`createScope`/`detachScope`/`destroyScope`/`scopedUrl`); `id()`
  overrides a built-in. Admin JDBC driver must be on the host/app classpath.

---

## Config namespace summary (`protean.*`)

Full reference: `03-configuration.md` (each key carries a mutability tier: `live` | `future` | `restart`;
runtime change via `PATCH /platform/config` or the `config.set` tool). Groups:

`admin.*` · `mcp.*` (+ `mcp.authorization.*`, `mcp.debug.*`, `mcp.session.*`) · `bridge.*` · `gate.*`
(+ `gate.signature.*`, `gate.approval.*`) · `isolation.*` · `module.*` (+ `module.executor.*`) ·
`module-store.*` · `reconcile.*` · `trace.*` (+ `trace.metrics.*`) · `worker.*`
(+ `worker.{admin-auth,datasource,container,db,sidecar}.*`).

Common non-axis toggles: `admin.enabled`(true, `/platform/*` REST), `trace.enabled`(true) /
`trace.metrics.enabled`(false, per-module metrics), `module.request-timeout-ms`(0), `reconcile.compile-parallelism`(0).

---

## Security posture (must surface when MCP is enabled)

- Trust model: **all submitted source is trusted-developer**; there is **no sandbox** (deliberate non-goal).
- MCP is off by default because enabling it is an RCE surface. Enabling it in a generated sample is for **local
  demo**; production requires authentication (Bearer / OAuth) via the consumer's Spring Security, plus a
  `ModuleActionAuthorizer` policy.
- Admin REST (`/platform/*`) is unauthenticated by default; `worker.admin-auth.enabled` (hmac/token) hardens the
  worker control plane — chiefly for the container track whose port is more exposed.

## Jar consumption (build.gradle shape)

- `repositories { mavenLocal(); mavenCentral() }` — mavenLocal resolves the locally-published SNAPSHOT;
  mavenCentral once a release exists.
- `implementation 'org.htcom:protean:<version>'` + `spring-boot-starter-web` + (data-access) `-jdbc` + a JDBC
  driver (`runtimeOnly`, host-bundled — modules are source-only) + (strict-schema) networknt validator.
- JDK 21 toolchain pinned for `run` (runtime `javac`).
- Artifacts: plain jar = the library dependency; `-worker` classifier jar = sidecar process track (GitHub
  Packages); `protean-worker` OCI image = sidecar container track (GHCR). The sidecar `shared-api` jar is
  consumer-curated, not a protean artifact.
