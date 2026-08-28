# Monorepo Migration + Astro Frontend — Spec

Date: 2026-08-28

Turn the current single-package Express API into a pnpm workspace monorepo containing the API, an
Astro + React frontend, and a shared types package — orchestrated by one Docker Compose stack with
per-environment overrides (dev / staging / prod).

Delivered as a **stack of PRs**, not one drop. Two goals, deliberately separated:

- **Goal 1 — Structure**: monorepo layout, Docker/Compose/nginx, environment matrix. Zero product
  behaviour change.
- **Goal 2 — Frontend**: Astro + React UI for listing orders and creating one.

## Decisions (confirmed)

| Decision | Choice | Consequence |
|---|---|---|
| Topology | Separate `web`, `api`, `db` services behind nginx | Not literally one container; one Compose stack |
| Rendering | Astro `output: 'static'` + React islands | Backend auth unchanged — JWT bearer stays as-is |
| Environments | Compose override files + env files | No CI/CD, no hosting target in this spec |
| Layout | `apps/*` + `packages/shared` | Frontend gets API types/Zod schemas for free |
| Build system | Turborepo over pnpm workspaces | Task graph, caching, `turbo prune` for Docker |

### Why no CORS

nginx is the only public origin. It serves the built Astro assets at `/` and reverse-proxies `/api`
to the `api` service. The browser therefore never makes a cross-origin request, so no CORS
middleware is added. In dev, the Astro dev server's Vite proxy plays the same role. The API base URL
is the literal string `/api` in every environment — there is no `PUBLIC_API_URL` to configure.

If someone later needs to hit the API directly from a different origin (a mobile client, a separate
frontend host), CORS becomes a real requirement — out of scope here, and it should be an explicit
decision rather than a default.

---

# Goal 1 — Monorepo structure (pnpm workspaces + Turborepo)

## Target layout

```
pnpm-workspace.yaml
turbo.json                   # task graph: build, dev, test, typecheck, transit
package.json                 # private root: delegates to `turbo run`, devDep `turbo` only
tsconfig.base.json           # strict + nodenext, shared compiler options
docker-compose.yml           # base: service graph
docker-compose.dev.yml       # bind mounts, hot reload, exposed db port
docker-compose.staging.yml   # built images, no mounts
docker-compose.prod.yml      # built images, no mounts, no db port exposure
docker/
  api.Dockerfile
  web.Dockerfile             # build Astro -> nginx:alpine serving dist/
  nginx/default.conf         # / -> static, /api -> api:3000
apps/
  api/
    package.json             # @pizza/api
    turbo.json               # extends "//": test outputs, dev persistent
    tsconfig.json            # extends ../../tsconfig.base.json
    vitest.config.ts
    drizzle.config.ts
    drizzle/                 # migrations, moved verbatim
    .env / .env.example      # api runtime env lives WITH the api
    src/                     # current src/, moved verbatim
  web/
    package.json             # @pizza/web
    turbo.json               # extends "//": build outputs dist/**, dev persistent
    astro.config.mjs
    tsconfig.json
    src/{pages,components,lib,layouts}/
packages/
  shared/
    package.json             # @pizza/shared
    src/index.ts
```

`pnpm-workspace.yaml` declares `apps/*` and `packages/*`. Root `package.json` carries exactly one
devDependency — `turbo` — plus the existing `packageManager` pin and `pnpm.onlyBuiltDependencies`.

The API move is `git mv src apps/api/src` — history is preserved, and **no file inside `src/` is
edited** in this goal. If a source file needs changing, that is a signal the migration is wrong.

## Turborepo pipeline

Every task lives as a script in the package that owns it. Root `package.json` contains no task logic
— it only delegates, and always with `turbo run` (never the `turbo <task>` shorthand, which is for
interactive use):

```jsonc
// package.json (root)
{
  "private": true,
  "scripts": {
    "build":      "turbo run build",
    "dev":        "turbo run dev",
    "test":       "turbo run test",
    "typecheck":  "turbo run typecheck",
    "db:generate":"pnpm --filter @pizza/api db:generate",
    "db:migrate": "pnpm --filter @pizza/api db:migrate"
  },
  "devDependencies": { "turbo": "^2" }
}
```

The `db:*` scripts stay direct `pnpm --filter` calls: they mutate a live database, so they must never
be cached or scheduled by the task graph.

### `turbo.json`

```jsonc
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    // Transit node: creates dependency edges for cache invalidation without
    // forcing sequential execution. Needed because @pizza/shared is JIT —
    // there is no build output to wait on, but its source still belongs in
    // the hash of anything that imports it.
    "transit": { "dependsOn": ["^transit"] },

    "build":     { "dependsOn": ["^build"], "outputs": [] },
    "typecheck": { "dependsOn": ["transit"], "outputs": [] },
    "test":      { "dependsOn": ["transit"], "outputs": [] },
    "dev":       { "cache": false, "persistent": true }
  }
}
```

Per-package overrides live next to the code they affect, not as `pkg#task` entries in the root file:

```jsonc
// apps/web/turbo.json
{ "extends": ["//"], "tasks": { "build": { "outputs": ["dist/**"] } } }

// apps/api/turbo.json
{ "extends": ["//"], "tasks": { "test": { "outputs": ["coverage/**"] } } }
```

### Why several tasks declare no outputs

- **`apps/api` has no build.** It runs from source under `tsx`; its `build` script is
  `tsc --noEmit`, and the current `tsconfig.json` sets neither `incremental` nor `composite`, so no
  `.tsbuildinfo` is written. Empty `outputs` is correct, not an oversight. If `incremental` is ever
  turned on, `outputs` must gain the `.tsbuildinfo` path or the cache will restore nothing.
- **`packages/shared` has no build** — see the JIT decision below.
- **`apps/web` does** emit, so it overrides with `dist/**`.

### Environment variables and the hash

Turborepo runs in strict env mode by default: a task only sees variables it declares.

- **The web build declares none.** Because the API base URL is the literal `/api` in every
  environment, no `PUBLIC_*` variable enters the Astro build. The same `dist/` is therefore valid
  for staging and prod, and one cached build artifact can be promoted between them rather than
  rebuilt per environment. This is a direct payoff of the no-CORS decision.
- **The API's variables are runtime, not build-time.** `MYSQL_*`, `JWT_*`, `PORT`, `NODE_ENV` are
  read by a running process, never by a cached task, so they belong in `passThroughEnv` on `dev`,
  not in any task's `env` hash. Putting them in `env` would invalidate caches on every environment
  switch for no benefit.
- **No root `.env`.** A repo-root env file couples every package to every variable and makes cache
  invalidation repo-wide. Env files live in the package that reads them (`apps/api/.env`), and
  Compose loads them per service via `env_file:` rather than through root interpolation.

### Where Turborepo does and does not run

Turbo orchestrates on the host, in `turbo prune` during image builds, and later in CI. It does
**not** run inside the service containers: each container runs its own package's script directly
(`pnpm --filter @pizza/api dev`), because a container is already scoped to one package and adding a
task runner inside it buys nothing but an extra layer to debug. `docker compose up` remains the dev
entrypoint; `turbo run dev` is for running without Docker.

`turbo run build --affected` is the obvious CI win later, but CI is a non-goal here (see below).

## Known breakages, and the fix for each

These are the things that actually break on a move like this. Each one is a checklist item, not a
hope.

1. **`pnpm.onlyBuiltDependencies: ["bcrypt"]`** is read from the **workspace root only**. It must
   stay in the root `package.json` after the move, not travel into `apps/api/package.json`. If it
   moves, `bcrypt` silently skips its build script and fails at runtime, not install time.
2. **Dockerfile COPY paths, solved with `turbo prune`.** The current `COPY src ./src` no longer
   matches, and naively copying the whole repo into each image would break layer caching — any
   change to `apps/web` would bust the API image. Each Dockerfile gets a prune stage:

   ```dockerfile
   FROM node:24-alpine AS pruner
   WORKDIR /repo
   RUN corepack enable && pnpm add -g turbo
   COPY . .
   RUN turbo prune @pizza/api --docker
   # -> /repo/out/json  (package.json files + lockfile: the dependency layer)
   # -> /repo/out/full  (source of @pizza/api and only its workspace deps)
   ```

   The `--docker` flag splits the output precisely so `out/json` can be copied and installed in its
   own layer before `out/full` is copied. Dependencies then re-install only when a manifest actually
   changes. Build context stays the repo root; `apps/web` churn no longer invalidates the API image.
3. **Compose bind mounts vs. pnpm symlinks.** The current `volumes: [.:/app, /app/node_modules]`
   pattern breaks under a workspace: pnpm links `apps/api/node_modules/*` into the **root**
   `node_modules/.pnpm` store, so masking one app's `node_modules` leaves dangling symlinks. Fix:
   mount the repo root (`.:/repo`), set `working_dir: /repo/apps/api`, and mask with **named**
   volumes for both `/repo/node_modules` and `/repo/apps/api/node_modules`. This applies to
   `docker-compose.dev.yml` only — staging/prod use baked images with no mounts.
4. **`drizzle.config.ts` and `vitest.config.ts`** use paths relative to their own location, so they
   work unchanged once moved alongside `src/`. Verify, don't assume.
5. **`tsx --env-file=.env`** resolves relative to CWD. With `working_dir` at `apps/api`, the env
   file is supplied by Compose instead — drop `--env-file` from the container command, keep it in
   the host-run script for people not using Docker.
6. **`tsconfig`.** Split into `tsconfig.base.json` (strict, `nodenext`, the current settings
   verbatim) plus a thin per-app `tsconfig.json` extending it. The API keeps `noEmit: true`; the web
   app uses Astro's own preset extending the base.

## `packages/shared` — the one real risk

The API is `nodenext` ESM and writes `.js` extensions in relative imports (per CLAUDE.md). Vite —
which Astro uses — resolves that convention differently from `tsc`. A shared package that imports
across multiple internal files could resolve under `tsx` and fail under Vite, or vice versa.

**Decision:** `packages/shared` is a **JIT (Just-In-Time) internal package** — it ships TypeScript
source and its consumers transpile it; there is no compile step and no `dist/`. Concretely it is a
**single file**, `src/index.ts`, with no internal relative imports:

```jsonc
// packages/shared/package.json
{ "name": "@pizza/shared", "type": "module", "exports": { ".": "./src/index.ts" } }
```

`tsx` transpiles it for the API; Vite transpiles it for the web app (add
`vite.optimizeDeps.exclude: ['@pizza/shared']` if it is pre-bundled and goes stale). One file has no
extension-resolution problem to have.

Both `apps/api` and `apps/web` declare `"@pizza/shared": "workspace:*"` as a real dependency. That
declaration is what makes the `transit` edge exist — without it, turbo has no idea the packages are
related and changing shared source would leave stale cache entries.

**Fallback if JIT still fights:** convert it to a **compiled** package — add a `tsc` build emitting
`dist/`, point `exports` at `dist/index.js`, and give it `outputs: ["dist/**"]` in its own
`turbo.json`. Consumers' `build`/`typecheck` then depend on `^build` instead of `transit`. Costs a
build step in dev; removes the resolution ambiguity entirely.

Initial contents: the Zod schemas and inferred types the API already defines for auth and order
request/response shapes, re-exported so the frontend and API cannot drift.

## Service graph

Three long-running services, plus one on-demand:

- **`web`** — the only published port. In staging/prod it is `nginx:alpine` serving the prebuilt
  Astro `dist/` and reverse-proxying `/api` to `api`. In dev the same service instead runs
  `astro dev`, whose Vite proxy forwards `/api` to `api`. nginx is not a separate fourth service; it
  is what `web` *is* outside dev, which is why the origin is identical in every environment.
- **`api`** — Express on `:3000`, reachable only on the Compose network.
- **`db`** — MySQL 8.4, healthchecked, `api` waits on `service_healthy` as it does today.
- **`migrate`** — one-shot, `profiles: ["migrate"]`, never started by `up`.

## Environment matrix

Overrides layer on top of that base graph:

| | dev | staging | prod |
|---|---|---|---|
| Images | built `dev` target | built, tagged | built, tagged |
| Source mounts | yes | no | no |
| Astro | `astro dev` w/ Vite proxy | prebuilt `dist/` in nginx | prebuilt `dist/` in nginx |
| `db` port | published to `127.0.0.1` | not published | not published |
| `NODE_ENV` | development | production | production |
| Secrets | `apps/api/.env` | `apps/api/.env.staging` | `apps/api/.env.prod` |

Env files live under `apps/api/`, not at the repo root, and each service loads its own via Compose
`env_file:`. Committed examples: `apps/api/.env.example`, `.env.staging.example`,
`.env.prod.example`. Real env files stay gitignored. Variables: `PORT`,
`MYSQL_HOST/PORT/DATABASE/USER/PASSWORD`, `MYSQL_ROOT_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
`REFRESH_TOKEN_EXPIRES_IN`, `NODE_ENV`. The `web` service needs no env file at all — its build is
environment-independent.

Because there is no root `.env`, the override files carry environment-specific values literally
rather than through `${VAR}` interpolation. One less layer of indirection, and no ambient shell
variable can silently change what a Compose command does.

`JWT_SECRET` must differ per environment and must never be committed. Staging and prod env files are
operator-supplied.

**Migrations** do not run implicitly at container start. A one-shot `migrate` service
(`profiles: ["migrate"]`) runs `pnpm db:migrate` against the target env, invoked explicitly:
`docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate`. An app container
that silently mutates a production schema on restart is a footgun; this keeps it a deliberate act.

## Verification for Goal 1

Done means all of:

- `pnpm test` (→ `turbo run test`) passes with the **same** test count and results as `7b62ccb`.
- `pnpm typecheck` (→ `turbo run typecheck`) clean.
- Running `pnpm build` twice in a row: the second run reports `FULL TURBO` for unchanged packages.
- Editing `packages/shared/src/index.ts` invalidates `@pizza/web` and `@pizza/api` typecheck — the
  transit edge proves itself. Verify with `turbo run typecheck --dry=json` if a cache hit looks
  suspicious.
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` serves the API and the Astro
  dev server; hot reload works on both.
- `curl localhost/api/orders` through nginx returns 401 without a token, and data with one.
- `git log --follow apps/api/src/app.ts` shows history from before the move.
- No diff inside `apps/api/src/` beyond the path move itself.

---

# Goal 2 — Frontend

Astro static site with React islands. Two screens, both from the challenge spec.

## Missing prerequisite

`GET /api/pizza-types` **does not exist** (TASKS.md, still open). The create-order screen cannot
populate its picker without it. It ships as its own thin PR between the two goals — list endpoint,
public or authenticated, following the existing `order` module layering.

## Screens

**Homepage — order list.** Fetches `GET /api/orders`, renders each order with its computed total
(the API already computes totals server-side; the frontend displays, it does not recalculate). Empty
state and error state both rendered, not left blank.

**Create order.** Fetches pizza types, lets the user set a quantity per type, shows a running total
computed client-side for feedback, submits `POST /api/orders`. Quantity input is constrained to
integers ≥ 1, but the client-side running total and the client-side constraint are **UX, not
validation** — the API's Zod schemas remain the only authority, and their errors are surfaced
verbatim in the UI.

**Login / signup.** Needed to obtain a token. A React island posting to `/api/auth/login`.

## Auth on the client

Access token (1h) and refresh token (1d) come from the existing endpoints. The frontend stores them
in `sessionStorage` and sends `Authorization: Bearer <access>`.

A single `lib/api.ts` fetch wrapper is the only place that talks to the API. On a `401` it attempts
`POST /api/auth/refresh` **once**, replays the original request, and on a second failure clears
storage and redirects to login. Concurrent 401s share one in-flight refresh promise so a page with
several islands does not fire several refreshes and lose the rotation race — the existing auth
design rotates the refresh token, so a double refresh invalidates the session.

**Client-side route guards are UX only, not a security boundary.** A static page redirecting an
unauthenticated visitor to `/login` is a convenience; `authMiddleware` and the per-user ownership
scoping in the order service are what actually protect data, and they already do.

Storing tokens in JS-readable storage is XSS-exposed by construction. Accepted here because the
static-output decision rules out httpOnly cookies without a server-rendered session layer. Mitigate
with a strict CSP header from nginx and no `dangerouslySetInnerHTML`. If this ever becomes a real
product rather than a challenge, revisit with the Astro-SSR + cookie option.

## Structure

React islands stay small and single-purpose, hydrated only where interactivity is needed:
`OrderList`, `OrderForm`, `LoginForm`. Astro pages own layout and static chrome. Types come from
`@pizza/shared`.

## Verification for Goal 2

- Log in, land on the homepage, see orders with correct totals matching `GET /api/orders`.
- Create an order end to end; it appears in the list on reload.
- Quantity `0` and quantity `-1` are rejected, and the API's error message is what the user sees.
- Expired access token triggers exactly one refresh and the request succeeds transparently.
- No CORS errors in the console in any environment.

---

## PR stack

| PR | Scope | Gate |
|---|---|---|
| 1 | Monorepo layout, pnpm workspace + Turborepo pipeline, `packages/shared`, Docker/Compose/nginx, env matrix | Goal 1 verification passes; zero behaviour change |
| 2 | `GET /api/pizza-types` | Endpoint tested, Swagger-annotated |
| 3 | Astro web app: login, order list, create order | Goal 2 verification passes |

Each PR is stacked on the previous and independently reviewable.

## Non-goals

Explicitly not in this spec: CI/CD pipelines and GitHub Actions; any hosting target or managed
database; Astro SSR or cookie sessions; discount logic; rate limiting; e2e/browser tests; frontend
unit tests. Several of these remain open in `TASKS.md` and are unaffected by this work.

## Docs to update as part of PR 1

`CLAUDE.md` (every path in it changes), `README.md` (setup/run instructions per environment), and
`TASKS.md` (close the "decide frontend approach" item, add the ones this spec defers).
