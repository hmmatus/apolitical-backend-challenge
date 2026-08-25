# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This is a solution to the Ambulnz backend challenge (https://github.com/AmbulnzLLC/backend-challenge): a pizza-ordering
application built as a pair-programming assessment. The repo currently contains only the base project skeleton
(Express + TypeScript); the actual feature (data model, API endpoints, UI) has not been implemented yet.

### Required scope (from the challenge spec)

**Data model** — three entities:
- `PizzaType`: name, price
- `Order`: has many order items
- `OrderItem`: references a pizza type, has a quantity

**JSON API:**
- List all orders
- Retrieve a single order's details

**UI:**
- Homepage listing orders with calculated totals
- "Create Order" screen: pick pizzas, set quantities, show a running total, submit

**Stack constraint:** the spec calls for MySQL as the database. No ORM, migration tool, or DB connection exists in
this repo yet — pick and wire one up (e.g. Prisma, TypeORM, or Sequelize) rather than assuming one is already there.

**Optional/stretch (mentioned in the spec, not yet started):** input validation (quantity > 0), discount logic based
on order totals, auth, automated tests, CI/CD.

## Commands

- Install deps: `pnpm install`
- Type-check (no emit — `tsconfig.json` has `noEmit: true`): `pnpm build`
- Run the app: `pnpm start` (runs `src/app.ts` directly via Node's native TypeScript support — no separate compile
  step; requires Node 24+, which is what's installed here)
- Tests: Vitest is configured (`vitest.config.ts`). `pnpm test` runs the suite once, `pnpm test:watch` runs in watch
  mode, `pnpm test:coverage` runs with v8 coverage (text/html/lcov). Passes with exit code 0 even with zero test
  files, so it won't break CI before tests are written.
- Lint: no linter is configured yet.

## Commit messages

Format: `<fix|feature|chore|release|hotfix>: <description>`

## Architecture

- `src/app.ts` — entrypoint; creates the Express app and starts the HTTP listener on port 3000. Currently a single
  `GET /` route returning "Hello World".
- `src/middlewares/` — exists but empty; intended location for Express middleware as it's added.
- Module system: `nodenext` (ESM), TypeScript `strict` mode is on — keep new code strict-compliant.
- Package manager is pnpm (`packageManager` pinned in `package.json`); use `pnpm`, not `npm`/`yarn`.
