# Remaining Tasks

Tracking what's left on the Ambulnz pizza-ordering challenge (see `CLAUDE.md`) plus
infra/tooling asks. Check off as completed.

## Required scope (CLAUDE.md)

- [ ] `PizzaType` read endpoint(s) — `GET /api/pizza-types` (list). Needed so the UI can populate
      the pizza picker on "Create Order"; not yet built (only `Order` CRUD exists). PR 2 of the
      monorepo migration stack (see `docs/plans/monorepo-migration.md`).
- [ ] Homepage UI — list orders with calculated totals. `apps/web` is a stub (Astro + React
      scaffold only); the actual page is PR 3 of the migration stack.
- [ ] "Create Order" screen UI — pick pizzas, set quantities, running total, submit against
      `POST /api/orders`. Also PR 3.
- [x] Decide + wire up frontend approach — Astro (static output) + React islands, in a pnpm
      workspace + Turborepo monorepo (`apps/api`, `apps/web`, `packages/shared`), served behind
      nginx in staging/prod so there's no CORS. See `docs/plans/monorepo-migration.md`.

## Optional/stretch (CLAUDE.md)

- [x] Input validation (quantity > 0, valid pizza type refs) — done in `order.validation.ts` /
      `order.service.ts`.
- [x] Auth (JWT-based, `authMiddleware`) — done.
- [x] Automated tests (auth + order modules, Vitest) — done.
- [ ] Discount logic based on order totals — not started, explicitly out of scope in
      `docs/plans/orders.md`.
- [ ] CI/CD — not started (see below).

## Infra / tooling (requested)

- [x] Monorepo structure (pnpm workspace + Turborepo, `apps/api`/`apps/web`/`packages/shared`,
      Docker Compose with dev/staging/prod overrides, nginx reverse proxy) — PR 1 of
      `docs/plans/monorepo-migration.md`. Zero behavior change to the API's own logic.
- [ ] Rate limiting middleware (e.g. `express-rate-limit`) — apply at least to `/api/auth` routes
      (login/register brute-force) and consider a looser global limit.
- [ ] GitHub Actions CI/CD for both envs (staging + prod) — build, typecheck, test on PR; deploy
      pipeline per env. No `.github/workflows/` exists yet. Explicitly deferred by the monorepo
      migration spec.
- [ ] Agent/skill that generates Swagger/OpenAPI docs for new endpoint modules automatically
      (Swagger is already wired up manually for `auth`; `order` module has no swagger annotations
      yet — needs doing regardless of whether it's automated).

## Bugs found

- [ ] **Pre-existing, not migration-caused**: `apps/api/src/middlewares/validate.middleware.ts:13`
      (`req[part] = result.data`) throws `TypeError: Cannot set property query of
      #<IncomingMessage> which has only a getter` when validating query params under Express 5 —
      hits any route using `validate(schema, "query")`, e.g. `GET /api/orders`. Never caught
      before because there's no supertest/integration coverage for the order routes (see below);
      only surfaced when PR 1's Docker verification made the first real end-to-end HTTP call
      against a live server. Fix: mutate `req.query` in place (e.g. `Object.assign(req.query,
      result.data)`) instead of reassigning it, for the `"query"` case.

## Notes

- `order` module has no HTTP/route-level tests (no `supertest` or equivalent in the repo yet) —
  flagged by `tester` during the orders CRUD build; only service + validation layers are covered.
  This is exactly the gap that let the query-validation bug above go undetected.
