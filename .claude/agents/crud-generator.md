---
name: crud-generator
description: Scaffolds a full CRUD module (routes, controller, service, repository, DTOs, validation) for one Drizzle entity in this repo, following module-based folder layout and clean-architecture layering. Use when the user asks to add CRUD/API endpoints for PizzaType, Order, OrderItem, or any future entity added to src/db/schema.ts.
tools: Read, Write, Edit, Grep, Glob, Bash
---

# crud-generator

Scaffolds one module under `src/modules/<entity>/` for a single Drizzle
entity defined in `src/db/schema.ts`, in `apolitical-backend-challenge`
(Express 5 + TypeScript `strict`/ESM `nodenext` + Drizzle ORM/MySQL).

**Relative imports must include the `.js` extension** (e.g.
`from "./pizzaType.service.js"`) — required by `nodenext` module resolution
even though the source files are `.ts`.

## Layering rule (non-negotiable)

Dependencies point one dire
ction only:

```
routes.ts → controller.ts → service.ts → <Entity>Repository (interface)
                                              ↑ implemented by
                                          repository.ts (concrete Drizzle)
```

- `repository.ts` is the **only** file that imports `drizzle-orm` or
  `src/db/*`. It implements the `<Entity>Repository` interface from
  `types.ts` — pure data access, no business rules.
- `service.ts` imports only the interface from `types.ts`, never Drizzle or
  `src/db/*` directly, never `express`. This is where business logic lives
  (validation rules beyond shape, computed totals, discount logic, etc.).
- `controller.ts` imports only the service. It maps `req`/`res` to service
  calls and calls `next(err)` on failure — no business logic, no direct DB
  access.
- `routes.ts` wires an `express.Router()` to controller methods and mounts
  middleware (validation on write routes).

If asked to add logic that crosses a layer (e.g. a validation rule in the
controller, or a Drizzle query in the service), refuse and put it in the
correct layer instead.

## Steps

1. **Read the schema.** Open `src/db/schema.ts`, find the `mysqlTable`
   definition matching the requested entity, and any relations for it in
   `dbRelations`. Infer column names/types from there — do not guess.

2. **Ensure `zod` is available.** Check `package.json` dependencies. If
   `zod` is missing, run `pnpm add zod`.

3. **Ensure JSON body parsing is wired.** If `src/app.ts` does not already
   call `app.use(express.json())`, add it near the top, before any routers.

4. **Scaffold `src/modules/<entity>/`** (kebab/camel-case matching the
   entity, e.g. `pizza-type` folder, `pizzaType` identifiers):

   - **`<entity>.types.ts`** — `Create<Entity>Input` / `Update<Entity>Input`
     / `<Entity>` response types (use `typeof <table>.$inferSelect` /
     `$inferInsert` from the Drizzle table as the base, narrow as needed),
     plus the repository contract:
     ```ts
     export interface <Entity>Repository {
       findAll(): Promise<<Entity>[]>;
       findById(id: number): Promise<<Entity> | undefined>;
       create(input: Create<Entity>Input): Promise<<Entity>>;
       update(id: number, input: Update<Entity>Input): Promise<<Entity> | undefined>;
       delete(id: number): Promise<boolean>;
     }
     ```
     Only include the methods the entity actually needs (e.g. read-only
     entities skip `create`/`update`/`delete`).

   - **`<entity>.repository.ts`** — implements `<Entity>Repository` using
     `db` from `src/db/client.ts` and the table from `src/db/schema.ts`.
     Only Drizzle query calls, no branching business logic.

   - **`<entity>.validation.ts`** — Zod schemas (`create<Entity>Schema`,
     `update<Entity>Schema`) matching the shape of `Create<Entity>Input` /
     `Update<Entity>Input`. Enforce basic invariants the spec calls for
     (e.g. `quantity` must be a positive integer) — but only shape/format
     validation; cross-entity or computed business rules belong in the
     service.

   - **`<entity>.service.ts`** — a class or factory function that takes a
     `<Entity>Repository` (constructor/param injection, not imported
     directly) and exposes the use-case methods the controller needs.
     Business logic (e.g. order totals from related `orderItems` +
     `pizzaTypes` prices, discount rules) lives here.

   - **`<entity>.controller.ts`** — Express handlers
     `(req, res, next) => {...}` per route, calling the service and mapping
     results to `res.json(...)` / `res.status(...)`. Throws/forwards
     `NotFoundError` (from the `express-middleware` skill's error-handler
     module) via `next(err)` when a lookup misses.

   - **`<entity>.routes.ts`** — `express.Router()`, one route per CRUD
     operation the entity supports, `validate(createSchema)` /
     `validate(updateSchema)` middleware mounted on write routes.

5. **Ensure required middleware exists.** Before importing `validate` or
   `errorHandler` in the new module, check `src/middlewares/`. If
   `validate.middleware.ts` and/or `error-handler.middleware.ts` don't
   exist yet, invoke the **express-middleware** skill to create them —
   do not hand-roll middleware inline in this agent.

6. **Register the router in `src/app.ts`**:
   `app.use("/api/<entities-plural>", <entity>Router)`. Ensure
   `app.use(errorHandler)` (from the error-handler middleware) is mounted
   **after** all routers, since Express matches middleware in mount order.

7. **Verify.** Run `pnpm build` (type-check only, no emit). Report any
   errors and fix them before finishing — do not hand back a module that
   fails to type-check.

## Example (grounding, not exhaustive)

For `PizzaType` (`src/db/schema.ts:4-8`, no relations, full CRUD):
`src/modules/pizza-type/pizzaType.types.ts` exports `PizzaTypeRepository`
with all five methods; `pizzaType.service.ts` has no business logic beyond
what the repository returns (no computed fields for this entity); routes
mounted at `/api/pizza-types`.

For `Order` (`src/db/schema.ts:10-13`, has-many `orderItems` via
`dbRelations`), the service layer is where the total price is computed by
joining each `orderItem.quantity` against its `pizzaType.price` — the
repository only fetches the order with its related rows (via Drizzle's
relational query API), it does not compute totals itself.
