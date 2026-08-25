---
name: add-drizzle-entity
description: Scaffold a new Drizzle ORM entity/table into src/db/schema.ts — asks how it relates to existing tables (FK, many-to-many junction, or standalone), generates the mysqlTable definition and dbRelations wiring, then runs pnpm db:generate and pnpm db:migrate. Use when the user asks to add a new entity, table, or model to the database, or add a field/relation that requires a new table.
---

# add-drizzle-entity

Adds one new table to `src/db/schema.ts` and gets it migrated into the database. Scope: schema file +
migrations only. Does **not** write repositories, routes, controllers, or DTOs — that's `crud-generator`'s
job, offered as a follow-up in Step 7.

## Conventions (from existing `pizzaTypes`/`orders`/`orderItems`)

- Table var: camelCase plural (`widgets`). SQL table name: snake_case plural string literal
  (`mysqlTable("widgets", {...})`).
- Standard PK: `id: int().primaryKey().autoincrement()`.
- Column name arg is omitted when it matches camelCase-of-snake_case by default. Pass the explicit
  snake_case string as the first arg only when it differs from the field name, e.g.
  `createdAt: timestamp("created_at").notNull().defaultNow()`.
- FK column: `xId: int("x_id").notNull().references(() => x.id)`.
- **All relations live in the single `dbRelations = defineRelations(...)` call at the bottom of the file.**
  Never add a per-table `relations()` call (that's the old Drizzle API, not used here).
- Relative imports use the `.js` extension (nodenext module resolution).

## Steps

1. **Ask for entity details** (skip this step if the caller already supplied them — see "When invoked by
   another agent" below):
   - Entity name (singular, e.g. `Topping`) and its columns (name, type, nullable/default).
   - Relation shape — one of:
     - **FK (one-to-many / many-to-one)** — which existing table it references, and the direction (e.g.
       `Topping` has many `OrderItem`, or `OrderItem` belongs to one `Topping`).
     - **Many-to-many** — which two existing tables it joins. Name the junction table
       `<a>_<b>` snake_case (e.g. `order_items_toppings`), sorted alphabetically for consistency.
     - **Standalone** — no FK to any existing table.

2. **Read `src/db/schema.ts` in full.** Confirm no name collision with the new table/columns, and see the
   exact current shape of `dbRelations` before editing it.

3. **Write the new `mysqlTable(...)` export** (plus a second junction-table export if many-to-many),
   inserted after the existing table exports, following Conventions above. Match existing formatting
   exactly (no added blank lines, same import grouping).

4. **Update the single `dbRelations` call.** Add the new table(s) to the first argument's object, and add
   `r.one.<table>({ from, to, optional })` / `r.many.<table>({ from, to })` entries to the second argument
   for every new relation, both directions where applicable — mirror the existing `orders`/`orderItems`
   two-way pattern:
   ```ts
   orders: {
     items: r.many.orderItems({ from: r.orders.id, to: r.orderItems.orderId }),
   },
   orderItems: {
     order: r.one.orders({ from: r.orderItems.orderId, to: r.orders.id, optional: false }),
   },
   ```
   For many-to-many, the junction table gets `r.one.<a>` and `r.one.<b>` entries, and each side table gets
   an `r.many.<junction>` entry.

5. **Type-check before touching migrations**: run `pnpm build`. Fix any error in `schema.ts` before
   proceeding — do not generate a migration from code that doesn't compile.

6. **Run migrations**: `pnpm db:generate` then `pnpm db:migrate`. Report the generated migration folder
   name (under `./drizzle/`) and a one-line summary of the SQL it contains.

7. **Offer to chain into `crud-generator`/`generate-crud`** for the new entity now that it exists in the
   schema. Ask the user; do not auto-invoke.

## When invoked by another agent/skill

If the caller already knows the entity name, columns, and relation shape, skip Step 1's interactive
question and take that data directly as input — still perform Steps 2–7 in full.

## Notes

- **Never hand-edit anything under `./drizzle/`** — drizzle-kit generates and owns those files.
- **Never use `pnpm db:push`** — this repo's convention is versioned migrations via `db:generate`/`db:migrate`.
- One entity per invocation. For multiple new entities, run this skill once per entity so each migration
  stays small and reviewable.
