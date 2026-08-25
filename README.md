# Apolitical Backend Challenge

Solution to the [Ambulnz backend challenge](https://github.com/AmbulnzLLC/backend-challenge): a pizza-ordering
application (pizza types, orders, order items) built with Express, TypeScript, and MySQL.

**Status:** base project skeleton only — the data model, API endpoints, and UI described in the challenge spec are
still being built.

## Running locally (without Docker)

Requires Node 24+ and pnpm.

```bash
cp .env.example .env   # first time only
pnpm install
pnpm dev     # runs with --watch, auto-restarts on file changes
pnpm start   # single run, no watch
```

The app reads `PORT` / `NODE_ENV` from `.env` and listens on whatever `PORT` is set to (see `.env.example`).

## Running with Docker

```bash
cp .env.example .env   # first time only
docker compose up --build
```

This starts the app (`http://localhost:$PORT`, per `.env`) and a MySQL 8.4 database (`127.0.0.1:3306`). DB name/user/
password and the app's `PORT` all come from `.env` — see `.env.example` for the full list of variables and their
defaults.

```bash
docker compose down      # stop
docker compose down -v   # stop and wipe the MySQL volume
```

## Database migrations

Schema is defined with [Drizzle ORM](https://orm.drizzle.team) in `src/db/schema.ts`, config in `drizzle.config.ts`.
These commands run on the host (not inside Docker) and connect via `MYSQL_HOST=localhost` / `MYSQL_PORT=3306` from
`.env` — that's the host-mapped port for the `db` container, distinct from the `MYSQL_HOST=db` used *inside* the
`app` container.

MySQL must be running first:

```bash
docker compose up -d db
```

Then, after changing `src/db/schema.ts`:

```bash
pnpm db:generate   # diff schema.ts against ./drizzle, write a new SQL migration file
pnpm db:migrate    # apply pending migration files to the database
```

Other available commands:

- `pnpm db:push` — push `schema.ts` straight to the database, skipping migration files (dev-only, don't use once
  migrations are shared/deployed)
- `pnpm db:studio` — browse the database in Drizzle Studio

## Scripts

- `pnpm build` — type-check only (`tsconfig.json` has `noEmit: true`, so this doesn't emit JS)
- `pnpm dev` — run with file-watch auto-restart
- `pnpm start` — run once
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:push` / `pnpm db:studio` — see [Database migrations](#database-migrations)
