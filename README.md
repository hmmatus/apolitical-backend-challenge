# Apolitical Backend Challenge

Solution to the [Ambulnz backend challenge](https://github.com/AmbulnzLLC/backend-challenge): a pizza-ordering
application (pizza types, orders, order items) built with Express, TypeScript, Astro, and MySQL.

**Status:** API (auth + orders CRUD) is implemented. This is a pnpm workspace + Turborepo monorepo:
`apps/api` (Express), `apps/web` (Astro + React, frontend features coming in a follow-up PR), and
`packages/shared` (types shared between the two).

## Layout

```
apps/
  api/      Express API — src/, drizzle migrations, its own .env
  web/      Astro + React frontend
packages/
  shared/   Types shared between api and web
```

## Running locally (without Docker)

Requires Node 24+ and pnpm.

```bash
cp apps/api/.env.example apps/api/.env   # first time only
pnpm install
pnpm dev     # turbo run dev — starts every app in watch/dev mode
```

To run just one app: `pnpm --filter @pizza/api dev` or `pnpm --filter @pizza/web dev`.

The API reads `PORT` / `NODE_ENV` from `apps/api/.env` and listens on whatever `PORT` is set to
(see `apps/api/.env.example`).

## Running with Docker

Compose files layer a base graph with per-environment overrides:

```bash
cp apps/api/.env.example apps/api/.env   # first time only
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

This starts:
- `web` — Astro dev server on `http://localhost:4321` (its own Vite dev proxy forwards `/api` to `api` for the
  frontend's own use; the two run on separate ports in dev)
- `api` — Express on `http://localhost:3000`
- `db` — MySQL 8.4, host-mapped to `127.0.0.1:3306`

Staging and prod build both `web` and `api` from their `production` targets — `web`'s target bakes
the Astro build into an `nginx:alpine` image that serves the static assets at `/` and reverse-proxies
`/api` to the `api` service, so both apps share one origin and there's no CORS to configure:

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml up --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

Staging/prod need `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` in the
shell environment (for the `db` service) and `apps/api/.env.staging` / `apps/api/.env.prod` (copy
from the matching `.example` file) for the API's own config, including a per-environment
`JWT_SECRET`.

```bash
docker compose down      # stop
docker compose down -v   # stop and wipe the MySQL volume
```

## Database migrations

Schema is defined with [Drizzle ORM](https://orm.drizzle.team) in `apps/api/src/db/schema.ts`,
config in `apps/api/drizzle.config.ts`. Migrations don't run automatically when a container starts —
they run through a dedicated one-shot `migrate` service, invoked explicitly:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db   # MySQL must be running first
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
```

Substitute the staging/prod compose files to migrate those environments instead.

Outside Docker, after changing `apps/api/src/db/schema.ts`:

```bash
pnpm db:generate   # diff schema.ts against apps/api/drizzle, write a new SQL migration file
pnpm db:migrate    # apply pending migration files to the database
```

Other available commands (run with `pnpm --filter @pizza/api <script>`):

- `db:push` — push `schema.ts` straight to the database, skipping migration files (dev-only, don't use once
  migrations are shared/deployed)
- `db:studio` — browse the database in Drizzle Studio

## Scripts

Root scripts delegate to Turborepo, which runs the task across every workspace package:

- `pnpm build` — build every app
- `pnpm dev` — run every app in dev/watch mode
- `pnpm test` — run every app's test suite
- `pnpm typecheck` — typecheck every app
- `pnpm db:generate` / `pnpm db:migrate` — see [Database migrations](#database-migrations)

Run a script for a single package with `pnpm --filter @pizza/api <script>` or
`pnpm --filter @pizza/web <script>`.
