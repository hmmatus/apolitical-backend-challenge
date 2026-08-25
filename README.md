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

## Scripts

- `pnpm build` — type-check only (`tsconfig.json` has `noEmit: true`, so this doesn't emit JS)
- `pnpm dev` — run with file-watch auto-restart
- `pnpm start` — run once
