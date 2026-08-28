**English** | [한국어](README.ko.md)

# Templates

Source templates the skill adapts when generating `prototype/<name>/`. They are **not** copied verbatim — the
generation engine substitutes placeholders, injects selected `protean.*` keys, and includes only the blocks for
selected capabilities. The option surface itself lives in `../reference/protean-options.yaml` (config keys),
`../reference/db-vendors.yaml` (database sub-flow) and `../reference/auth-stores.yaml` (user-store sub-flow).

## Placeholders

| Token | Meaning | Example |
|---|---|---|
| `{{NAME}}` | prototype folder / app name (`[a-z0-9_-]+`) | `orders` |
| `{{PKG}}` | Java package — **typed by the user** (default `prototype.<name>`, `-`→`_`) | `prototype.orders` |
| `{{PKG_PATH}}` | `{{PKG}}` as a path (`.`→`/`) | `prototype/orders` |
| `{{COORD}}` | Protean group:artifact | `org.htcom:protean` |
| `{{VERSION}}` | Protean version | `0.0.1` |
| `{{DB}}` | database/schema name (default = `<name>`) | `orders` |
| `{{PW}}` | DB password (default = `<DB>1234`) | `orders1234` |

Blocks tagged `[OPTIONAL ...]` / `[CAPABILITY: ...]` are included only when selected. `[advanced ...]` = Advanced
tier. In `application.yml.template`, `<<datasource>>` and `<<protean-options>>` are injection points the engine
fills from the option/vendor specs.

## Files

- `build.gradle.template` · `settings.gradle.template` · `Application.java.template` — core project.
- `application.yml.template` — **minimal base**; the engine injects the selected `protean.*` keys + datasource.
- `README.md.template` — the generated sample's README. `gitignore.template` → write as `.gitignore`.
- `setup.sh.template` — the final artifact: a Linux/Ubuntu install-and-run script (preflight env/prereq checks →
  DB up → server run) generated as `setup.sh` (chmod +x). Placeholders `{{IS_SNAPSHOT}}`, `{{HAS_DB_DOCKER}}`,
  `{{ISOLATION}}`, and the sidecar trio `{{WORKER_RUNTIME}}` / `{{SIDECAR_JAR}}` / `{{SIDECAR_IMAGE}}` /
  `{{SIDECAR_SHARED_API}}` (empty when unset).
- `isolation-worker.yml.template` / `isolation-container.yml.template` — `protean:` blocks merged when the
  isolation mode is `worker` / `container`.
- `db/` — per-vendor database templates (selected via `db-vendors.yaml`):
  - `docker-compose.{mysql,postgres}.yml.template` + `init.{mysql,postgres}.sql.template` — docker connection mode.
    The `init.*` data schema is for a **data-access** DataSource only — a DataSource that just backs the jdbc
    module-store gets no items init (Protean creates its own store tables).
  - `init.provision-admin.{mysql,postgres}.sql.template` → `init/00-provision-admin.sql`, only when
    `worker.db.auto-provision=true` on a docker-managed DB (creates the admin account that provisions scopes).
  - `schema.h2.sql.template` → `src/main/resources/schema.sql` for embedded H2 (no server/docker).
  - (existing-server / "other" vendor → datasource only, no compose.)
- `support/*.java.template` — the common-support package, **always generated** into
  `src/main/java/{{PKG_PATH}}/support/` with its class names kept: `BaseService` / `BaseMapper` (empty supertypes a
  deployed module's service and Mapper extend) and `CommonFilter` / `CommonInterceptor` / `WebSupportConfig`
  (pass-through hooks, registered and doing nothing). Not capability-gated — the point is that adding a
  cross-cutting concern later is a one-file edit.
- `fragments/*.java.template` — one per code-capability; include only the selected ones, renamed to a real class.
  Each fragment's header states its dependency (e.g. requires `mcp.enabled`).
- `fragments/<dir>/` — a **fragment bundle**: several files emitted together into a sub-package, class names kept
  (they reference each other) and a member may target the test source set. `fragments/interfacedef/` is one, driven
  by the `interface_spec_validator` capability. See `fragment_bundle` in `../reference/protean-options.yaml`.

## Gradle wrapper

Binary + boilerplate, so not templated. Provision in the new sample dir:

```bash
cd prototype/<name>
gradle wrapper --gradle-version 8.14.5
```

If no system Gradle, copy the four wrapper files from any Gradle project.
