# Orders Module Plan

Full CRUD JSON API for `Order`/`OrderItem` — list, detail, create, update (replace item list), delete — all
behind `authMiddleware`, scoped to the authenticated user's own orders, with computed totals and cross-entity
validation against `pizzaTypes`.

No `src/db/schema.ts` changes are required: `orders` (id, userId, createdAt) and `orderItems` (id, orderId,
pizzaTypeId, quantity) already exist with the FKs and `dbRelations` needed (`src/db/schema.ts:18-35`,
`:68-90`). This is the first CRUD module for `Order`/`OrderItem`/`PizzaType` in `src/modules/`.

## Assumptions (flag if wrong — not re-confirmed with the coordinator, made as reasonable defaults)

- **List ordering**: `GET /api/orders` returns the caller's own orders, newest first (`orders.createdAt DESC`).
- **Price snapshot**: `orderItems` has no stored unit price, so totals are always computed from the
  **current** `pizzaTypes.price`, not the price at order-creation time. This is a known limitation of the
  existing schema, not something this plan can fix without a schema change (out of scope here — flag to the
  human if historical pricing turns out to matter).
- **Not-found vs. forbidden semantics** (see Business rules #10 for the full rule): looking up an order by
  id always checks *existence* before *ownership* — a nonexistent id is 404 regardless of who's asking; an
  id that exists but belongs to another user is 403. Delete is not idempotent-204 the way auth's logout is —
  an order either exists (and is 404/403-gated) or it doesn't.
- **Invalid `pizzaTypeId` on create/update → 400**, not 404. The failing resource is the `/orders` request
  body, not a `/pizza-types/:id` lookup — status describes what's wrong with the *request*, consistent with
  how zod validation failures are reported.
- **Money precision**: line totals and order totals are computed in integer cents internally
  (`Math.round(Number(pizzaType.price) * 100) * quantity`, summed, then divided by 100) to avoid
  floating-point drift when summing currency, then returned as a JSON number rounded to 2 decimals.

## Scope

**Entities touched**: `Order`, `OrderItem` (read/write), `PizzaType` (read-only, for price lookups and
existence validation). No new module for `PizzaType` itself is required by this plan — `OrderRepository`
reads pizza type rows directly, it does not need its own CRUD routes to satisfy this feature.

**Schema changes**: none. `src/db/schema.ts` already has everything needed (see above).

**CRUD operations needed on `Order`**: full CRUD — list (paginated, scoped to caller), get one (with items +
computed total, scoped to caller), create, update (full item-list replace, scoped to caller), delete (scoped
to caller). `OrderItem` has no routes of its own; it's only ever read/written as part of its parent `Order`.

**New error classes** (add to `src/utils/apiError.ts`, following the existing `EmailTakenError` /
`InvalidCredentialsError` pattern — `crud-generator`'s job, not reader's):
- `OrderNotFoundError` → `ApiError(404, "Order not found")`
- `OrderForbiddenError` → `ApiError(403, "You do not have access to this order")` — used when the order
  exists but its `userId` does not match `req.user.id` (Business rules #10).
- `EmptyOrderItemsError` → `ApiError(400, "Order must have at least one item")`
- `InvalidPizzaTypeReferenceError` → `ApiError(400, "One or more pizzaTypeId values do not exist", invalidParams)`
  — `invalidParams` lists each unknown id as `{ id: "items[<index>].pizzaTypeId", message: "..." }`.

**Validation layering (non-negotiable, per human reviewer)**: every *shape-level* check — `quantity` is a
positive integer, `pizzaTypeId` is a positive integer, `limit`/`offset` are non-negative integers (`limit`
additionally `> 0`), the `:id` path param is a positive integer, `items` is a non-empty array — is expressed
as a **zod schema in `order.validation.ts`** and enforced by the `validate()` middleware on the route,
**never** as a manual `if` check in `order.controller.ts` or `order.service.ts`. The **only** two checks that
stay in `order.service.ts` are the ones zod structurally cannot express because they require a DB lookup:
(1) does each `pizzaTypeId` actually exist in `pizzaTypes` (Business rules #4), and (2) does the requested
order belong to `req.user.id` (Business rules #10 — ownership/403). If `crud-generator` finds itself writing
`if (quantity <= 0)` or `if (!Number.isInteger(id))` anywhere outside `order.validation.ts`, that's a
layering violation and should be moved into a zod schema instead.

**Module layout** (`src/modules/order/`, following `crud-generator`'s layering — see
`.claude/agents/crud-generator.md`):
```
src/modules/order/
  order.types.ts        # Order, OrderItem, CreateOrderInput, UpdateOrderInput, OrderRepository interface
  order.repository.ts   # only file touching drizzle/db; findAll/count take a userId filter; findById fetches
                         # by id alone (no userId filter) so the service can distinguish 404 vs 403; includes
                         # a method to bulk-fetch pizzaTypes by id (e.g. findPizzaTypesByIds(ids: number[]))
                         # so the service can validate refs + prices without importing drizzle itself
  order.validation.ts   # zod: createOrderSchema, updateOrderSchema (items: non-empty array; each item's
                         # pizzaTypeId/quantity: positive int), listOrdersQuerySchema (limit/offset: positive/
                         # non-negative int, with defaults), orderIdParamSchema (:id: positive int, via
                         # z.coerce.number()). This file is the ONLY place shape-level input validation is
                         # written — see "Validation layering" above. Mounted via validate(schema, "body"|
                         # "query"|"params") per route in order.routes.ts.
  order.service.ts      # business rules only: totals, pizzaTypeId EXISTENCE check (DB lookup, not shape),
                         # pagination math (page/pages from an already-validated limit/offset), ownership
                         # check (404 vs 403 — see Business rules #10). No shape re-validation here — by the
                         # time a request reaches the service, `validate()` middleware has already guaranteed
                         # shape correctness of body/query/params.
  order.controller.ts   # req/res glue only; passes req.user.id and already-validated body/query/params into
                         # service calls; no conditionals on input shape
  order.routes.ts       # mounts authMiddleware + validate() (body/query/params as appropriate) on every route
```

`OrderRepository.findById(id)` deliberately does **not** take a `userId` — it returns the order (or
`undefined`) purely by id. The service is what decides 404 (no row) vs. 403 (row exists, `userId` mismatch)
vs. proceed (row exists, `userId` matches), since that decision is business logic, not a data-access
concern. `findAll`/`count`, by contrast, *do* take `userId` — list scoping is a straightforward filter, not a
branch on existence, so it's cheaper and simpler to push into the query.

## Business rules

1. **Order total** = sum over `items` of `quantity * pizzaType.price`, computed against each item's
   *current* `pizzaTypes.price` row (see Assumptions). Computed in the service layer (never in the
   repository or controller), using integer-cents arithmetic to avoid float drift.
2. **Line total** per item = `quantity * pizzaType.price`, included alongside each item in detail/create/
   update responses (also cents-safe).
3. **Quantity validation (shape, zod-only)**: every `items[].quantity` must be a positive integer (`> 0`);
   `0`, negative, or non-integer values are rejected. Enforced **exclusively** via zod (`.int().positive()`)
   in `createOrderSchema`/`updateOrderSchema` (`order.validation.ts`) — this is shape validation, not a
   cross-entity rule, so per `crud-generator`'s layering rule and the "Validation layering" note above, it
   must not be re-implemented as an `if` check in the controller or service.
4. **`pizzaTypeId` reference validation — split into two checks**:
   - *Shape* (`pizzaTypeId` is a positive integer): zod, in `createOrderSchema`/`updateOrderSchema`, same as
     `quantity` above.
   - *Existence* (that positive integer actually names a row in `pizzaTypes`): this is cross-entity and
     requires a DB read, so it cannot live in zod — it's the one input check that belongs in
     `order.service.ts` (via `OrderRepository.findPizzaTypesByIds`). Any unknown id →
     `InvalidPizzaTypeReferenceError` (400), listing *all* unknown ids in one response, not just the first.
5. **Non-empty item list (shape, zod-only)**: `items` must have at least one entry on both create and
   update, enforced via zod (`.min(1)`) in `order.validation.ts`. Empty array → `EmptyOrderItemsError` (400)
   is raised by the validation middleware rejecting the schema, not a manual length check downstream.
6. **`userId` provenance**: on create, `userId` is always `req.user.id` from `authMiddleware`, never accepted
   from the request body — `createOrderSchema` must not include a `userId` field at all (so a client-supplied
   `userId` in the body is silently dropped by zod's default "unknown keys stripped" behavior, not merely
   ignored by the controller).
7. **Update replaces the full item list**: `PUT /api/orders/:id` (and `PATCH`, same handler/semantics per the
   coordinator's instruction — this API doesn't distinguish partial vs. full update) deletes all existing
   `orderItems` rows for that order and inserts the new set from the request body, inside one transaction.
   `orderId`/`userId`/`createdAt` on the parent `orders` row are untouched by update.
8. **Pagination math (shape validated by zod, math done in service)**: `limit`/`offset` shape — non-negative
   integers, `limit` additionally `> 0` — is validated exclusively by `listOrdersQuerySchema` (zod) in
   `order.validation.ts`, mounted via `validate(listOrdersQuerySchema, "query")`; invalid values (negative,
   zero limit, non-numeric) never reach the controller/service and are rejected as 400 by the validation
   middleware itself. Given already-valid `limit`/`offset`, the service computes
   `page = Math.floor(offset / limit) + 1` and `pages = total === 0 ? 0 : Math.ceil(total / limit)` — this
   arithmetic is business logic (depends on `total`, a DB-derived value), not shape validation, so it stays
   in `order.service.ts`. `limit` defaults to `20`, `offset` defaults to `0` when omitted (defaults applied
   by the zod schema, e.g. `.default(20)`/`.default(0)`).
9. **Discount logic is explicitly out of scope** for this plan (CLAUDE.md stretch goal, not requested) — the
   `total` field is a plain sum, no discount applied.
10. **Ownership scoping** (per human reviewer request):
    - `GET /api/orders` (list) only ever returns orders where `orders.userId === req.user.id`. Pagination,
      `total`, and `pages` are all computed over that user's own orders — an order belonging to a different
      user must never appear in `data`, and must not count toward `total`/`pages` either.
    - `GET /api/orders/:id`, `PUT`/`PATCH /api/orders/:id`, `DELETE /api/orders/:id` all check existence
      *before* ownership: if no order with that id exists at all → 404 (`OrderNotFoundError`). If the order
      exists but `orders.userId !== req.user.id` → **403** (`OrderForbiddenError`), not 404 — the order is
      real, the caller just isn't allowed to see/modify it. Only when the order exists *and* belongs to the
      caller does the handler proceed (return details / apply the update / delete it). This is a DB-dependent
      authorization decision, not a shape check, so — like pizzaTypeId existence — it belongs in
      `order.service.ts`, not zod.
    - `POST /api/orders` is unaffected by this rule — `userId` was already always forced from `req.user.id`
      (Business rules #6), so there's no ownership *check* to add on create, only on operations that look up
      an *existing* order by id or list existing orders.
11. **`:id` path param validation (shape, zod-only)**: on every id-scoped route
    (`GET`/`PUT`/`PATCH`/`DELETE /api/orders/:id`), the `:id` param must be a positive integer. Enforced via
    `orderIdParamSchema` (zod, `z.coerce.number().int().positive()` — `req.params` values arrive as strings)
    in `order.validation.ts`, mounted via `validate(orderIdParamSchema, "params")`. A non-numeric or
    non-positive `:id` (e.g. `"abc"`, `"0"`, `"-1"`) is rejected as 400 by the validation middleware before
    the controller or service ever runs — it must not be checked with a manual `Number.isInteger`/`> 0` `if`
    in the controller or service.

## API surface

All routes mounted at `/api/orders`, all require `authMiddleware` (401 if missing/invalid/expired Bearer
token, same contract as `src/middlewares/auth.middleware.ts`). Every route below is additionally scoped to
the caller's own orders per Business rules #10. All shape-level 400s below (params/query/body) are produced
by a zod schema in `order.validation.ts` via the `validate()` middleware — see "Validation layering" in
Scope — not by controller/service code.

### `GET /api/orders`
Query: `?limit=20&offset=0` (both optional; shape validated by `listOrdersQuerySchema`, Business rules #8).
Invalid values → 400 (from `validate(listOrdersQuerySchema, "query")`). Returns only orders where
`userId === req.user.id`.

200:
```json
{
  "data": [
    { "id": 1, "userId": 3, "createdAt": "2026-08-01T12:00:00.000Z", "total": 23.50, "itemCount": 2 }
  ],
  "page": 1,
  "pages": 4,
  "total": 73
}
```
`data[].total` is the computed order total (Business rules #1). `itemCount` is the number of `orderItems`
rows for that order (not sum of quantities). `page`/`pages`/`total` are all computed over the caller's own
orders only. List entries do **not** include the full `items` array — that's reserved for the detail
endpoint, keeping list payloads small.

### `GET /api/orders/:id`
`:id` shape validated by `orderIdParamSchema` (positive integer, else 400 — Business rules #11). Unknown id
→ 404 (`OrderNotFoundError`). Id exists but belongs to a different user → **403** (`OrderForbiddenError`).

200:
```json
{
  "id": 1,
  "userId": 3,
  "createdAt": "2026-08-01T12:00:00.000Z",
  "items": [
    { "id": 10, "pizzaTypeId": 2, "pizzaTypeName": "Margherita", "quantity": 3, "unitPrice": 9.50, "lineTotal": 28.50 }
  ],
  "total": 28.50
}
```

### `POST /api/orders`
Body: `{ "items": [{ "pizzaTypeId": number, "quantity": number }, ...] }`, shape validated by
`createOrderSchema` (Business rules #3/#5). `userId` from `req.user.id`, never body — Business rules #6. No
ownership check applies here (nothing pre-existing to own yet).

- 201: same shape as `GET /api/orders/:id` detail response, for the newly created order.
- 400 (shape, from `validate(createOrderSchema, "body")`): empty `items`, non-positive/non-integer
  `quantity`, non-positive/non-integer `pizzaTypeId`.
- 400 (business rule, from `order.service.ts`): unknown `pizzaTypeId` (`InvalidPizzaTypeReferenceError`).

### `PUT /api/orders/:id` and `PATCH /api/orders/:id`
Same body shape/validation as create (`updateOrderSchema`, Business rules #7) and `:id` shape validation as
detail (`orderIdParamSchema`, Business rules #11). `:id` must exist **and** belong to the caller.

- 200: updated order, same shape as detail response.
- 400 (shape): same validation failures as create, plus a malformed `:id`.
- 400 (business rule): unknown `pizzaTypeId`.
- 403: order exists but belongs to a different user.
- 404: unknown `:id`.

### `DELETE /api/orders/:id`
`:id` shape validated by `orderIdParamSchema` (Business rules #11); must exist **and** belong to the caller.

- 204: order (and its `orderItems`, cascade-deleted in one transaction) removed.
- 400 (shape): malformed `:id`.
- 403: order exists but belongs to a different user.
- 404: unknown `:id`.

### Shared error shape
Same as the rest of the API (`src/middlewares/error-handler.middleware.ts`):
`{ status, description, invalid_params?: { id, message }[] }`. Zod-driven 400s populate `invalid_params`
(one entry per failing field/param) automatically via the existing `ZodError` branch in
`error-handler.middleware.ts`. 403/404 responses have `status`/`description` only, no `invalid_params` —
same convention as the existing 401 responses.

## Test spec

For `tester` (write mode): `src/modules/order/__tests__/order.service.test.ts` (in-memory fake
`OrderRepository`) + `src/modules/order/__tests__/order.validation.test.ts` (zod schemas directly). Cover
every scenario below — do not skip edge cases. Per "Validation layering," the validation test file is where
every shape-level case (quantity/pizzaTypeId/limit/offset/:id) belongs; the service test file should assume
shape is already valid and focus on totals, pizzaTypeId existence, ownership, and pagination math.

### List (`GET /api/orders` / service list method)

**Happy path**
- No query params → defaults `limit=20, offset=0`; response has `data`, `page: 1`, `pages`, `total` matching
  fixture data for the authenticated user.
- `limit=2&offset=2` on 5 fixture orders belonging to the authenticated user → returns orders 3–4
  (0-indexed), `page: 2`, `pages: 3`, `total: 5`.
- Each list entry's `total` equals the sum of `quantity * pizzaType.price` for that order's items,
  independently verified against fixture data (not just "some number").
- `itemCount` matches the number of `orderItems` rows for that order, not the sum of quantities (e.g. an
  order with items `[{qty:3}, {qty:5}]` has `itemCount: 2`, not `8`).
- Zero orders belonging to the authenticated user → `data: []`, `total: 0`, `pages: 0`, `page: 1`.
- List is ordered newest-first by `createdAt`.
- **Ownership scoping**: fixture data contains orders belonging to two different users (e.g. user A has 3
  orders, user B has 2 orders). A request authenticated as user A returns exactly user A's 3 orders in
  `data` — user B's orders never appear, and `total`/`pages` are computed as `3`/`ceil(3/limit)`, not `5`.

**Edge cases (validation-schema tests, `order.validation.test.ts`, `listOrdersQuerySchema`)**
- `limit=0` → schema rejects (limit must be `> 0`).
- Negative `limit` or `offset` → schema rejects.
- Non-numeric `limit`/`offset` (e.g. `"abc"`) → schema rejects.
- Omitted `limit`/`offset` → schema applies defaults `20`/`0` rather than rejecting.

**Edge cases (service/integration)**
- `offset` beyond the caller's own row count (e.g. `offset=1000` when the caller has 5 orders, even if other
  users have more) → `data: []`, still a valid 200 with correct `page`/`pages`/`total`, not an error.
- Missing `Authorization` header → 401, list logic never invoked.

### Detail (`GET /api/orders/:id`)

**Happy path**
- Existing order belonging to the caller, with 2+ items → 200, `items` array has one entry per `orderItems`
  row, each with `pizzaTypeName` and `unitPrice` resolved from the current `pizzaTypes` row, `lineTotal` =
  `quantity * unitPrice`, and top-level `total` = sum of all `lineTotal`s.
- Order with a single item → total equals that one line total exactly.

**Edge cases (validation-schema tests, `orderIdParamSchema`)**
- Non-integer / non-positive `:id` (e.g. `"abc"`, `"0"`, `"-1"`) → schema rejects, request never reaches the
  controller/service (verify this at the schema level directly, not just end-to-end).

**Edge cases (service/integration)**
- Nonexistent order id (e.g. `id=999999` with no such row) → 404, regardless of who's asking.
- Existing order id that belongs to a *different* user than the caller → **403**, not 404 — assert the
  distinct status code and that the response body does not leak the order's contents (items/total) alongside
  the 403.
- Missing `Authorization` header → 401.
- Order total computation uses cents-based rounding: a fixture with prices like `9.99` and quantity `3`
  (`29.97`) must not drift to `29.969999999999995` from naive float multiplication — assert the exact
  expected decimal value.

### Create (`POST /api/orders`)

**Happy path**
- Valid `{ items: [{ pizzaTypeId, quantity }] }` with one item → 201, response is the full detail shape,
  `userId` on the created order equals the authenticated user's id (from `req.user.id`), not anything in the
  request body.
- Valid payload with multiple items, including two items referencing the *same* `pizzaTypeId` with different
  quantities → both persisted as separate `orderItems` rows (not merged/deduped).
- A `userId` field included in the request body is ignored — the created order's `userId` still comes from
  `req.user.id`, confirming Business rules #6.

**Edge cases (validation-schema tests, `createOrderSchema`)**
- `items: []` (empty array) → schema rejects (`.min(1)`).
- Missing `items` field entirely → schema rejects.
- `quantity: 0` → schema rejects.
- `quantity: -1` → schema rejects.
- `quantity: 1.5` (non-integer) → schema rejects.
- `pizzaTypeId: 0` / `pizzaTypeId: -1` / `pizzaTypeId: 1.5` → schema rejects (shape only — this is distinct
  from the existence check below).
- All the above assert directly against `createOrderSchema.safeParse(...)`, not via an HTTP round trip, so
  the case is pinned to the schema regardless of how the controller wires it up.

**Edge cases (service/integration — existence + provenance)**
- `pizzaTypeId` referencing a nonexistent pizza type (but shape-valid, e.g. a positive integer that just
  isn't in the fixture `pizzaTypes` table) → 400 (`InvalidPizzaTypeReferenceError`), no order or order-item
  rows created (all-or-nothing — a valid item alongside an invalid one still rejects the whole request,
  doesn't partially create).
- Multiple items with unknown `pizzaTypeId`s in the same request → the 400 response's `invalid_params` lists
  all of them, not just the first.
- Missing `Authorization` header → 401, before any validation of the body runs.

### Update (`PUT` / `PATCH /api/orders/:id`)

**Happy path**
- Existing order belonging to the caller, valid new `items` array with different pizza types/quantities than
  the original → 200, response reflects the *new* item list only (old items no longer present), `total`
  recomputed from the new items.
- Updating with the exact same items as before → 200, idempotent, same resulting state.
- `createdAt` and `userId` on the order are unchanged after an update (only items change).

**Edge cases (validation-schema tests)**
- Same `createOrderSchema`-equivalent cases as create, run against `updateOrderSchema`: empty `items`,
  `quantity`/`pizzaTypeId` shape failures (`0`, negative, non-integer).
- Non-integer/non-positive `:id` → `orderIdParamSchema` rejects.

**Edge cases (service/integration)**
- Nonexistent order id → 404, no rows mutated.
- Existing order id belonging to a *different* user → **403**, and the target order's items are verifiably
  unchanged afterward (the fake repository's state for that order is untouched).
- Shape-valid but nonexistent `pizzaTypeId` on update → 400 (`InvalidPizzaTypeReferenceError`); existing
  items remain unchanged (no partial replace).
- Missing `Authorization` header → 401.

### Delete (`DELETE /api/orders/:id`)

**Happy path**
- Existing order belonging to the caller → 204, order row and all its `orderItems` rows are gone (verify via
  the fake repository's state after the call).

**Edge cases (validation-schema tests)**
- Non-integer/non-positive `:id` → `orderIdParamSchema` rejects.

**Edge cases (service/integration)**
- Nonexistent order id → 404 (not idempotent 204 — see Assumptions).
- Existing order id belonging to a *different* user → **403**, and that order (and its items) still exist in
  the fake repository afterward — a forbidden delete must not mutate state.
- Missing `Authorization` header → 401, delete never invoked.

### Cross-cutting

- Every route in this module 401s identically when `Authorization` is missing/malformed/expired — reuse the
  same cases already covered by `src/middlewares/__tests__/auth.middleware.test.ts`, just confirmed wired
  onto `order.routes.ts` (an integration-style check, not a re-test of `authMiddleware` itself).
- For every id-scoped route (`GET/PUT/PATCH/DELETE /api/orders/:id`), existence is always checked before
  ownership: a nonexistent id never returns 403 (it's always 404 first), and an existing-but-not-owned id
  never returns 404 (it's always 403) — write both directions explicitly rather than assuming one implies
  the other.
- Every 400 response matches the shared error shape (`status`, `description`, `invalid_params` present with
  one entry per invalid field only on shape/reference validation failures).
- Every 403 and 404 response has `status` + `description` only, no `invalid_params` key at all (not even an
  empty array).
- **Layering check**: nothing in `order.service.test.ts` should need to exercise a malformed/negative
  `quantity`, `pizzaTypeId`, `limit`, `offset`, or `:id` — those are exhaustively covered in
  `order.validation.test.ts` instead, since (per "Validation layering") the service is never responsible for
  shape checks. If a scenario like "service rejects quantity 0" seems necessary to write, that's a signal the
  implementation put a shape check in the wrong layer — flag it back to `crud-generator` rather than writing
  a service test to match.

## Pipeline note

`tester` writes tests from the **Test spec** section above (write mode) before any implementation exists;
`crud-generator` then implements per **Scope** / **Business rules** / **API surface** (including adding the
four new `ApiError` subclasses, and keeping all shape validation in `order.validation.ts` per "Validation
layering"); `tester` runs the suite (run mode) last and reports pass/fail back to the caller.
