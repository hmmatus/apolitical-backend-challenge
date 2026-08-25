# Auth Module Plan

Stateless access tokens (JWT) + a stored refresh token for revocation. Access token proves identity per-request
without a DB hit; refresh token is opaque, hashed at rest, and lets us actually kill a session server-side
(logout, or future "log out all devices").

## Goals

- `POST /auth/signup` — create user, hash password, return access + refresh token.
- `POST /auth/login` — verify credentials, return access + refresh token.
- `POST /auth/refresh` — exchange a valid refresh token for a new access token (rotates the refresh token).
- `POST /auth/logout` — revoke the caller's refresh token.
- `authMiddleware` — verify `Authorization: Bearer <access-token>` on protected routes, attach `req.user`.
- Wire auth into existing `orders` flow: `userId` comes from `req.user`, never from request body.

## New dependencies

| Package | Purpose |
|---|---|
| `jsonwebtoken` + `@types/jsonwebtoken` | sign/verify JWT |
| `bcrypt` + `@types/bcrypt` | password hashing |
| `zod` | DTO validation (signup/login body shapes) |

`body-parser` NOT needed — Express 5 ships `express.json()` built in.

Refresh tokens don't need a new package: generate with Node's built-in `crypto.randomBytes(32)` (opaque, high
entropy) and hash with `crypto.createHash('sha256')` before storing — no need for bcrypt's slow hashing here,
that's for low-entropy secrets (passwords), not a 256-bit random token.

## Env vars

Add to `.env` / `.env.example`:
```
JWT_SECRET=<random-256-bit-string>
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=1d
```
`JWT_SECRET` signs access tokens — never commit a real value, never confuse with user passwords (those are
hashed in DB, not in `.env`). Access token expiry: 1h. Refresh token expiry: 1d. Both values already live in
`.env` (not hardcoded in `auth.service.ts`) so they're tunable per environment without a code change.

## Data model

`users` table already exists (`src/db/schema.ts`): `id`, `email` (unique), `passwordHash`, `name`, `createdAt`.
`orders.userId` FK already added.

**New table** `hashed_refresh_tokens` (add via `add-drizzle-entity` skill, FK to `users`, 1:M — a user can have
multiple active refresh tokens, one per device/session):

| Column | Type | Notes |
|---|---|---|
| `id` | `int` PK autoincrement | |
| `userId` | `int` FK → `users.id`, not null | |
| `tokenHash` | `varchar(64)` not null, unique | sha256 hex digest of the raw refresh token; raw value is only ever returned to the client, never stored |
| `expiresAt` | `timestamp` not null | set from `REFRESH_TOKEN_EXPIRES_IN` at issue time |
| `revokedAt` | `timestamp` nullable | set on logout / rotation; null = still active |
| `createdAt` | `timestamp` not null, default now | |

A row is "not usable anymore" when `revokedAt IS NOT NULL OR expiresAt < now()` — that's the predicate a future
cleanup cron would delete on. Not building the cron now, just shaping the table so it's a one-query job later.

## Module layout

Follow same module-based layering `crud-generator` uses for other entities:

```
src/modules/auth/
  auth.routes.ts        # POST /signup, /login, /refresh, /logout
  auth.controller.ts    # req/res glue, calls service, maps errors -> status codes
  auth.service.ts       # hashPassword, verifyPassword, signAccessToken, issueRefreshToken, rotateRefreshToken
  auth.repository.ts    # findUserByEmail, createUser, insertRefreshToken, findActiveRefreshTokenByHash, revokeRefreshToken (drizzle queries)
  auth.dto.ts           # zod schemas: SignupInput, LoginInput, RefreshInput
src/middlewares/
  auth.middleware.ts    # verifies access JWT, sets req.user, 401 on missing/invalid/expired
```

## Request/response contracts

**POST /auth/signup**
- body: `{ email, password, name }` (zod-validated: email format, password min length)
- 201: `{ accessToken, refreshToken }`
- 409: email already exists (catch unique constraint violation)
- 400: validation failure

**POST /auth/login**
- body: `{ email, password }`
- 200: `{ accessToken, refreshToken }`
- 401: invalid email/password (same generic message for both — don't leak which one was wrong)

**POST /auth/refresh**
- body: `{ refreshToken }`
- 200: `{ accessToken, refreshToken }` — old refresh token row is revoked, new one issued (rotation: limits blast
  radius if a refresh token leaks, and makes reuse of a revoked token detectable)
- 401: refresh token missing, unknown, expired, or already revoked

**POST /auth/logout**
- body: `{ refreshToken }`
- 204: token row exists (regardless of current state) — sets `revokedAt` to now if not already set; already-
  revoked or expired rows still return 204 (idempotent logout, no info leak about token state)
- 401: `refreshToken` missing from body, or no row matches its hash at all (never issued)

**Access token payload**: `{ sub: userId, email }`, signed with `JWT_SECRET`, expiry from `JWT_EXPIRES_IN`.
**Refresh token**: opaque random string, never a JWT — the DB row is the source of truth on validity, the
client just holds the raw value and the server holds only its hash.

## Error response shape

Every non-2xx response from the auth module (and, going forward, the rest of the API) uses this shape:

```ts
{
  status: number;        // HTTP status code, mirrors the response status
  description: string;   // human-readable message, safe to show to a client
  invalid_params?: { id: string; message: string }[]; // only present on 400 validation failures
}
```

- `invalid_params` is omitted entirely (not an empty array) when there's nothing field-level to report — a
  409/401 has a `description` only, no `invalid_params`.
- `id` in `invalid_params` is the field name (e.g. `"email"`, `"password"`) so a client can map errors back to
  form fields; `message` is the human-readable reason for that field.
- zod validation failures on signup/login/refresh map directly to this: one `invalid_params` entry per failed
  field.

Example, signup with bad email and short password:
```json
{
  "status": 400,
  "description": "Validation failed",
  "invalid_params": [
    { "id": "email", "message": "Invalid email address" },
    { "id": "password", "message": "Password must be at least 8 characters" }
  ]
}
```

Example, login with wrong credentials:
```json
{ "status": 401, "description": "Invalid email or password" }
```

This shape belongs in a shared helper (e.g. `src/utils/apiError.ts`), not reimplemented per controller.

## Middleware behavior

- Missing/malformed `Authorization` header → **401 Unauthorized** (not 403 — 403 is reserved for authenticated-but-not-allowed, e.g. future role/ownership checks).
- Invalid signature or expired token → **401 Unauthorized**.
- Valid token → decode payload, attach `req.user = { id, email }`, call `next()`.
- Requires extending Express's `Request` type via declaration merging (`src/types/express.d.ts` or similar) so `req.user` is typed downstream instead of `any`.

## Password handling

- Signup: `bcrypt.hash(password, 10)` before insert. Never store or log plaintext.
- Login: `bcrypt.compare(password, user.passwordHash)`.

## Ordering with existing `orders` module

Once auth lands, revisit `POST /orders`: `userId` must come from `req.user.id` (post-middleware), not client-supplied body — client identity is never trusted from payload.

## Explicitly out of scope (flag, don't build)

- Scheduled cleanup job (cron) for expired/revoked `hashed_refresh_tokens` rows — table is shaped to support
  `DELETE WHERE revoked_at IS NOT NULL OR expires_at < now()`, but the job itself isn't built this pass.
- Role-based authorization (403 path) — no roles defined yet; middleware only proves *who*, not *what they can do*.
- Rate limiting on login/signup — brute-force protection, stretch goal per CLAUDE.md.
- "Logout all devices" — would just be revoking all of a user's rows instead of one; trivial to add later on top of this schema, not built now.

## Test plan (for `tester` agent, write-mode before implementation)

### POST /auth/signup

**Happy path**
- Valid email + password + name → 201, body has `accessToken` and `refreshToken` (both non-empty strings).
- New row exists in `users` with `passwordHash` set — and it does NOT equal the plaintext password.
- A corresponding `hashed_refresh_tokens` row exists for the new user, `revokedAt` null, `expiresAt` ~1d out.

**Edge cases**
- Duplicate email (exact match) → 409, no second row inserted.
- Email is stored and compared as-is, no case normalization — `Foo@x.com` and `foo@x.com` are treated as
  distinct emails and can both register.
- Malformed email (`"not-an-email"`) → 400, no DB row created.
- Password below minimum length → 400, no DB row created.
- Missing `name` / missing `email` / missing `password` field entirely → 400.
- Response body never contains `password` or `passwordHash` in any form.

### POST /auth/login

**Happy path**
- Correct email + password → 200, `accessToken` + `refreshToken` returned, new refresh-token row created.

**Edge cases**
- Correct email, wrong password → 401, generic message (identical wording/shape to unknown-email case).
- Unknown email → 401, same generic message as wrong-password case (timing/response must not reveal which
  field was wrong — don't early-return before the bcrypt compare on the unknown-email path, to avoid a timing
  side-channel that distinguishes "no such user" from "wrong password").
- Empty-string password against a real account → 401, not a 500 from bcrypt on bad input.
- Response body never contains `password` or `passwordHash`.

### POST /auth/refresh

**Happy path**
- Valid, unexpired, unrevoked refresh token → 200, new `accessToken` + new `refreshToken`; old token's row is
  now `revokedAt` set (rotated out); new access token's payload decodes to the same `sub` as before.

**Edge cases**
- Unknown refresh token (well-formed string, no matching hash in DB) → 401.
- Expired refresh token (`expiresAt` in the past, `revokedAt` still null) → 401.
- Already-revoked refresh token (e.g. reused after a prior `/refresh` call rotated it out) → 401 — this is the
  reuse-detection case; worth a dedicated test since it's the main security property rotation buys.
- Refresh token belonging to a different, still-valid user → succeeds only for that user; must not leak or
  attach to any other `userId`.
- Missing `refreshToken` in body → 400 (validation) not 401.

### POST /auth/logout

**Happy path**
- Valid, active refresh token → 204, row's `revokedAt` becomes non-null.

**Edge cases**
- Already-revoked token → 204 again (idempotent), `revokedAt` timestamp unchanged from first revoke (don't
  overwrite it on a second call).
- Expired-but-otherwise-known token → 204 (still "known", just no longer usable — consistent with the
  known/unknown distinction in the contract above).
- Unknown token (never issued) → 401.
- Missing `refreshToken` in body → 400.

### authMiddleware

**Happy path**
- Valid, unexpired access token in `Authorization: Bearer <token>` → `next()` called, `req.user` set to
  `{ id, email }` matching the token payload.

**Edge cases**
- No `Authorization` header at all → 401.
- Header present but wrong scheme (`Basic ...` instead of `Bearer ...`) → 401.
- `Bearer` with no token after it (`Authorization: Bearer`) → 401.
- Garbage/malformed token string → 401, not a 500 (jwt.verify throw must be caught).
- Token signed with a different/wrong secret → 401.
- Expired token (valid signature, `exp` in the past) → 401.
- Confirm status is 401 in every case above, never 403 — 403 is reserved for a future authorization
  (not authentication) check.

### Cross-cutting

- Password and raw refresh token never appear in any response body, thrown error message, or log line across
  all of the above — only `tokenHash` is persisted, never the raw refresh token value.
- Every 400/401/409 response matches the shared error shape (see "Error response shape" above): `status` +
  `description`, with `invalid_params` present (and correctly populated per-field) only on 400s, absent on
  401/409.

## Execution order

1. Install deps (`jsonwebtoken`, `bcrypt`, `zod` + types).
2. Add `JWT_SECRET`/`JWT_EXPIRES_IN`/`REFRESH_TOKEN_EXPIRES_IN` to `.env` + `.env.example`.
3. Run `add-drizzle-entity` skill for `hashed_refresh_tokens` (FK to `users`, 1:M), generate + apply migration.
4. `tester` writes failing tests from this spec.
5. Implement `auth.dto.ts` → `auth.repository.ts` → `auth.service.ts` → `auth.controller.ts` → `auth.routes.ts` → `auth.middleware.ts`.
6. Wire `authMiddleware` onto protected routes (at minimum `POST /orders`).
7. `tester` runs suite, iterate until green.
8. `pnpm build` clean, manual smoke test (signup → login → refresh → logout → hit protected route with/without token).
