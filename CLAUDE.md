# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This is a solution to the Ambulnz backend challenge (https://github.com/AmbulnzLLC/backend-challenge): a
pizza-ordering application built as a pair-programming assessment.

The repo is a pnpm workspace + Turborepo monorepo:

- `apps/api` — Express + TypeScript JSON API. Auth (JWT) and orders CRUD are implemented.
- `apps/web` — Astro + React frontend. Scaffolded; the actual homepage (order list) and "Create Order" screen are
  a follow-up PR, not yet built.
- `packages/shared` — types shared between `api` and `web`. Currently a placeholder; gets populated as the
  frontend starts needing concrete request/response shapes.

Orchestrated by Docker Compose: `web` (nginx serving the Astro build + reverse-proxying `/api`, or the Astro dev
server directly in dev), `api`, `db` (MySQL), and a one-shot `migrate` service — with dev/staging/prod overrides
layered on a base `docker-compose.yml`.

### Required scope (from the challenge spec)

**Data model** — three entities:
- `PizzaType`: name, price
- `Order`: has many order items
- `OrderItem`: references a pizza type, has a quantity

All three exist in `apps/api/src/db/schema.ts` (Drizzle ORM, MySQL).

**JSON API:**
- List all orders — `GET /api/orders` (done, paginated, scoped to the authenticated user)
- Retrieve a single order's details — `GET /api/orders/:id` (done)
- `GET /api/pizza-types` — not yet built; needed before the frontend's pizza picker can work

**UI:**
- Homepage listing orders with calculated totals — not yet built (`apps/web` is a stub)
- "Create Order" screen: pick pizzas, set quantities, show a running total, submit — not yet built

**Optional/stretch:** input validation (done, Zod), auth (done, JWT), automated tests (done, Vitest, `apps/api`
only), discount logic (not started), CI/CD (not started).

## Commands

Root scripts delegate to Turborepo, which fans a task out across every workspace package. Use `pnpm --filter
@pizza/api <script>` or `pnpm --filter @pizza/web <script>` to run one package's script directly.

- Install deps: `pnpm install` (run at the repo root — this is a single workspace, not independent installs
  per app)
- Type-check every app: `pnpm typecheck` (→ `turbo run typecheck`)
- Build every app: `pnpm build` (→ `turbo run build`)
- Run every app in dev/watch mode: `pnpm dev` (→ `turbo run dev`)
- Tests: `pnpm test` (→ `turbo run test`) runs `apps/api`'s Vitest suite (the only package with tests right now).
  `pnpm --filter @pizza/api test:watch` / `test:coverage` for the other Vitest modes.
- DB migrations: `pnpm db:generate` / `pnpm db:migrate` (both delegate straight to `pnpm --filter @pizza/api`,
  bypassing Turborepo on purpose — these mutate a live database and must never be cached or task-graph-scheduled)
- Docker (dev): `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`
- Docker (staging/prod): swap in `docker-compose.staging.yml` / `docker-compose.prod.yml`; run the one-shot
  `migrate` service explicitly against whichever compose stack you're targeting — see `README.md`
- Lint: no linter is configured yet.

`apps/api`'s own `tsx --env-file=.env` (host) vs. `dev:docker` / `start:docker` (no `--env-file`, since Compose
supplies env vars via `env_file:` for the containerized paths) — use the plain `dev`/`start` scripts outside
Docker, the `:docker` variants are for the container `CMD`s only.

## Commit messages

Format: `<fix|feature|chore|release|hotfix>: <description>`

## Test file location

Test files live in a `__tests__` directory inside the directory holding the code they test
(e.g. `apps/api/src/modules/auth/controller/__tests__/auth.controller.test.ts`), never as flat siblings of the
source file and never collected in a top-level `tests/` directory.

## Architecture

- `apps/api/src/app.ts` — API entrypoint; creates the Express app and starts the HTTP listener on `PORT`.
- `apps/api/src/middlewares/` — Express middleware (auth, validation, centralized error handling).
- `apps/api/src/modules/{auth,order}/` — one module per domain area: routes, controller, service, repository,
  DTOs/validation, colocated `__tests__`.
- `apps/api/src/db/` — Drizzle schema (`schema.ts`) and DB client.
- `apps/web/src/` — Astro pages + React islands (islands architecture: static by default, hydrated only where
  interactive). Output is static (`astro build` → `dist/`), so the API base URL is always the literal `/api` — no
  `PUBLIC_API_URL`, no CORS, because nginx (or the Vite dev proxy, in dev) puts both apps on one origin.
- `packages/shared/src/index.ts` — JIT internal package (ships TS source, no build step); both `apps/api` and
  `apps/web` declare it as a `workspace:*` dependency so Turborepo's task graph has a `transit` edge to it,
  independent of whether either app actually imports from it yet.
- `docker/{api,web}.Dockerfile` — each stage-builds via `turbo prune <pkg> --docker` so an app image only carries
  its own dependency subtree, not the whole monorepo. `docker/nginx/default.conf` is the reverse-proxy config
  used by `web`'s `production` target.
- Module system: `nodenext` (ESM) in `apps/api` and `packages/shared` — keep new code in those packages
  strict-compliant and using explicit `.js` extensions in relative imports. `apps/web` uses Astro's own
  `moduleResolution: "bundler"` preset instead (extends `astro/tsconfigs/strict`, not the repo's
  `tsconfig.base.json`) because Vite's resolution differs from `tsc`'s.
- Package manager is pnpm (`packageManager` pinned in the root `package.json`); use `pnpm`, not `npm`/`yarn`.
  `pnpm.onlyBuiltDependencies` (needed for `bcrypt`'s native build) must stay in the **root** `package.json` — pnpm
  only reads it there, not from `apps/api/package.json`.
