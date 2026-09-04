# PR 3 — Frontend foundation + login

Date: 2026-08-28

Turns `apps/web` from the Astro/React stub PR 1 left behind into a real frontend: a Piznek-branded
design token layer, the shared UI kit, the data/state/form libraries, an axios instance that handles
token expiry and refresh rotation, a Zustand auth store, a login page, and a client-side route guard.

Third PR in the stack behind `docs/plans/monorepo-migration.md` (PR 1: monorepo structure, PR 2:
`GET /api/pizza-types`).

## Decisions (confirmed)

| Decision | Choice | Consequence |
|---|---|---|
| Rendering | Stay `output: 'static'` | PR 1's nginx-serves-`dist/` Docker layer is untouched |
| Route protection | Client-side guard, not Astro middleware | Astro middleware only runs at build time under static output — see below |
| Token storage | `sessionStorage` | Not cookies — see "On 'cookies' and 'middleware'" |
| Design tokens | Authored here, corrected later | Components reference tokens only, never raw hex, so a rebrand is one file |
| Scope | Foundation + `/login` only | Orders homepage → PR 4, Create Order → PR 5 |

### On "cookies" and "middleware"

The original ask named both. Under `output: 'static'` neither exists in the form the words usually
imply, and this spec deliberately does not pretend otherwise:

- **Astro middleware (`src/middleware.ts`) runs at build time in a static build**, not per request.
  There is no server at runtime — nginx serves prebuilt HTML. A redirect decision that depends on
  who is asking therefore cannot happen server-side. The guard here is client-side.
- **httpOnly cookies require a server to set and read them.** With no SSR, any cookie the app could
  write would be JS-readable, which is the same exposure as `sessionStorage` with extra ceremony and
  the added footgun of being attached to every same-origin request. So: `sessionStorage`, and the
  "clear cookies on expiry" behaviour is implemented as **clear stored tokens on expiry**.

**This means the guard is UX, not a security boundary — and that is fine.** `authMiddleware` and the
per-user ownership scoping already in `apps/api` are the real boundary, and they don't care what the
browser believes. The guard exists so a logged-out visitor lands on `/login` instead of an empty
screen that 401s.

If httpOnly cookies and true middleware are wanted later, that is the SSR migration described in the
migration spec's rejected option — a separate, larger PR that rewrites `docker/web.Dockerfile`'s
production target and adds a cookie-issuing path to the API.

---

## The Astro islands constraint

This shapes more of the structure than anything else, so it comes first.

**Each `client:*` directive mounts its own React root.** Two islands on one page are two separate
React trees. Consequences:

- **React Context does not cross island boundaries.** A `QueryClientProvider` wrapped around island A
  does not provide a client to island B. Sibling islands each need their own provider.
- **ES module singletons do cross.** Vite bundles a shared import once, so a Zustand store defined at
  module scope is genuinely shared between islands on the same page — `useAuthStore` works across
  islands where Context would not.

**Decision: one root island per interactive page.** Each page mounts a single `client:load` island
that owns the entire interactive tree and the providers. Astro still handles layout, `<head>`, and
static chrome. This keeps one React tree, one provider stack, and one place for the guard.

The `QueryClient` is still created at **module scope** (`lib/query-client.ts`) rather than inside a
component, so that if a page ever does grow a second island, both share one cache instead of
silently maintaining two.

---

## Design system — Piznek

The Dribbble shot could not be read programmatically (JS-rendered, scraping blocked), so these tokens
are an interpretation of a warm pizza brand, not a transcription. **Every value below is a
placeholder to be corrected against the real shot.** The point of the token layer is that correcting
them is a single-file edit.

`apps/web/src/styles/global.css`:

```css
:root {
  /* Brand */
  --color-brand:        #D62828;  /* tomato — primary actions, logo */
  --color-brand-hover:  #B71F1F;
  --color-brand-subtle: #FBE8E8;  /* tinted backgrounds, focus halo */
  --color-accent:       #E9B44C;  /* golden crust — highlights, badges */
  --color-basil:        #2A9D5C;  /* success */

  /* Surfaces */
  --color-surface:      #FFF6E9;  /* warm cream page background */
  --color-surface-raised: #FFFFFF;
  --color-border:       #E8DCC8;

  /* Ink */
  --color-ink:          #1F1B16;
  --color-ink-muted:    #6B6259;
  --color-ink-inverse:  #FFF6E9;

  /* Feedback */
  --color-danger:       #C1121F;
  --color-danger-subtle:#FDECEC;

  /* Type */
  --font-display: "Outfit", system-ui, -apple-system, sans-serif;
  --font-body:    "Inter", system-ui, -apple-system, sans-serif;
  --text-xs: 0.75rem;  --text-sm: 0.875rem; --text-base: 1rem;
  --text-lg: 1.125rem; --text-xl: 1.5rem;   --text-2xl: 2rem;
  --text-3xl: 2.75rem;

  /* Space — 4px base */
  --space-1: 0.25rem; --space-2: 0.5rem;  --space-3: 0.75rem;
  --space-4: 1rem;    --space-5: 1.5rem;  --space-6: 2rem;
  --space-8: 3rem;

  /* Radius — generous, the brand is round food */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 20px; --radius-pill: 999px;

  /* Elevation */
  --shadow-sm: 0 1px 2px rgba(31, 27, 22, 0.06);
  --shadow-md: 0 4px 16px rgba(31, 27, 22, 0.10);

  /* Motion */
  --ease: cubic-bezier(0.2, 0, 0.2, 1);
  --duration: 160ms;
}
```

Also in `global.css`: a minimal reset (`box-sizing`, margin zeroing, `body` background/ink/font),
a visible `:focus-visible` ring built on `--color-brand-subtle`, and a
`@media (prefers-reduced-motion: reduce)` block zeroing `--duration`.

**Fonts via Fontsource** (`@fontsource/outfit`, `@fontsource/inter`), imported in the base layout —
npm packages, self-hosted, so no external request at runtime and the container works offline. Not a
Google Fonts `<link>`.

**Component styling is CSS Modules**, not global classes and not a utility framework: no new build
config (Vite handles `.module.css` natively), scoped by default, and components stay readable.
Modules reference tokens only — a raw hex value anywhere outside `global.css` is a review failure.

---

## Directory layout

Atomic design governs the **design system**; feature-based modules govern **application code**. These
are complementary, not competing — `shared/ui` is the kit, `features/` is what's built with it.

```
apps/web/src/
├── styles/
│   └── global.css              # tokens, reset, base element styles
├── shared/
│   └── ui/
│       ├── atoms/
│       │   ├── button/         # Button.tsx + Button.module.css + index.ts
│       │   ├── input/
│       │   └── field-error/
│       ├── molecules/
│       │   └── form-field/     # label + input + error, wired for RHF
│       └── organisms/
│           └── auth-card/      # branded card shell the login form sits in
├── lib/
│   ├── api-client.ts           # axios instance + interceptors
│   ├── query-client.ts         # module-scope QueryClient
│   └── jwt.ts                  # decode + isExpired (no verification)
├── stores/
│   └── auth-store.ts           # Zustand: tokens, user, login/logout
├── features/
│   └── auth/
│       ├── api/
│       │   ├── login.ts        # schema + fetcher + useLogin mutation
│       │   └── refresh.ts      # fetcher only (called by interceptor)
│       ├── components/
│       │   ├── login-form.tsx
│       │   └── auth-guard.tsx
│       └── index.ts            # public surface of the feature
├── islands/
│   └── login-island.tsx        # single root island: providers + LoginForm
├── layouts/
│   └── base-layout.astro       # html shell, global.css, fonts, guard script
└── pages/
    ├── index.astro             # redirects to /orders (placeholder until PR 4)
    └── login.astro
```

Kebab-case files, `@/*` path alias to `src/*` (added to `apps/web/tsconfig.json` and mirrored in
`astro.config.mjs` via `vite.resolve.alias`, since Astro's own resolution and `tsc`'s are separate).

**Import direction is one-way: `shared → features → islands/pages`.** Features never import from
other features. Not worth an ESLint boundary rule at this size — no linter is configured in this repo
yet — but it is a review rule.

---

## Dependencies

Added to `apps/web`:

| Package | Why |
|---|---|
| `axios` | API client + interceptors |
| `@tanstack/react-query` | Server-cache state (orders in PR 4; login mutation here) |
| `zustand` | Auth state shared across islands where Context can't reach |
| `react-hook-form` | Form state, and `setError` for server-side field errors |
| `@hookform/resolvers` + `zod` | Schema validation for the login form |
| `@fontsource/outfit`, `@fontsource/inter` | Self-hosted brand fonts |

`zod` is pinned to `4.4.3` to match `apps/api` — a version skew here would be invisible until a
schema behaves differently on each side.

---

## API contract — what the backend actually returns

Read from the source rather than assumed; three details drive the design:

1. **Login returns tokens only.** `POST /api/auth/login` → `200 {accessToken, refreshToken}`. There
   is **no user object and no `GET /api/auth/me`**. The only identity available to the frontend is
   what's inside the JWT: `{sub, email, jti, iat, exp}`.
   → The store derives `user` by decoding the access token. **The user's `name` is not in the JWT**,
   so the UI can show an email but not a display name. Adding `/api/auth/me` (or putting `name` in
   the JWT) is a follow-up, deliberately not smuggled into this PR.
2. **Refresh rotates.** `POST /api/auth/refresh` revokes the presented token and issues a new pair.
   Two concurrent refreshes therefore **destroy the session** — the second presents a token the first
   already revoked. This makes the single-flight refresh below mandatory, not a nicety.
3. **Errors are `{status, description, invalid_params?}`** where each entry is `{id, message}` and
   `id` is a dot path (`"email"`). That maps directly onto `setError(id, {message})`.
   `POST /api/auth/logout` returns `204`, but `401` if the refresh token was never issued.

---

## Auth flow

### Storage

`sessionStorage`, keys `piznek.accessToken` / `piznek.refreshToken`, written only through the store.
Reads are wrapped in `try/catch` — Safari private mode throws on access — and a failed read is
treated as logged out rather than crashing the app.

### `lib/jwt.ts`

```ts
export function decodeToken(token: string): { sub: number; email: string; exp: number } | null
export function isExpired(token: string, skewSeconds = 30): boolean
```

Base64url-decodes the payload segment. **No signature verification** — that is the API's job and the
secret isn't here. This is only used to read `exp` and `email`, and a tampered token simply fails at
the API. The 30-second skew means a token about to expire mid-flight is refreshed *before* the
request rather than after a 401 round-trip.

### `lib/api-client.ts`

`baseURL: "/api"` — the literal string, in every environment, per the migration spec's no-CORS
design. There is no `PUBLIC_API_URL`.

**Request interceptor** — proactive:
1. No access token → send the request bare (login/signup need this).
2. Token present and `isExpired()` → `await refreshTokens()` first, then attach the fresh one.
3. Otherwise attach `Authorization: Bearer <token>`.

**Response interceptor** — reactive, for the case where the server disagrees with our clock:
- On `401`, if the request is not itself the refresh call and has not already been retried once,
  run `refreshTokens()` and replay the original request exactly once (`_retry` flag on the config).
- On a second failure, or any refresh failure: clear stored tokens, reset the store, and
  `location.assign('/login')`.

**Single-flight refresh** — the piece that makes rotation safe:

```ts
let inFlight: Promise<string> | null = null;

async function refreshTokens(): Promise<string> {
  inFlight ??= doRefresh().finally(() => { inFlight = null; });
  return inFlight;
}
```

Every caller awaits the same promise, so N parallel 401s produce exactly one refresh call and one
rotation. Without this, a page firing three requests at once logs the user out.

`doRefresh()` uses a **bare axios instance**, not `apiClient` — calling the intercepted client from
inside its own interceptor is an infinite loop.

### `stores/auth-store.ts`

```ts
interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: { id: number; email: string } | null;   // derived from the JWT
  status: "unknown" | "authenticated" | "anonymous";
  setTokens(pair: TokenPair): void;
  clear(): void;                                 // the "clear cookies" behaviour
  logout(): Promise<void>;                       // POST /api/auth/logout, then clear
}
```

`status` starts `"unknown"` and resolves on hydration, so the guard can distinguish "not logged in"
from "haven't checked yet" and avoid redirecting a logged-in user during the first tick.

`logout()` calls the API so the refresh token is actually revoked server-side, then clears locally —
**and clears locally even if the call fails**. A network error must not trap someone in a session
they asked to leave.

---

## Route guard — two layers

**Layer 1 — pre-paint script** (inline in `base-layout.astro`'s `<head>`, on guarded pages only):

```html
<script is:inline>
  try {
    if (!sessionStorage.getItem("piznek.accessToken")) location.replace("/login");
  } catch { location.replace("/login"); }
</script>
```

Runs before the island hydrates, so a logged-out visitor never sees a flash of authenticated chrome.
`is:inline` keeps it out of the bundle graph. `replace` rather than `assign` so Back doesn't bounce.

**Layer 2 — `<AuthGuard>`** inside the island: subscribes to the store, renders a skeleton while
`status === "unknown"`, redirects on `"anonymous"`, renders children on `"authenticated"`. This
catches expiry that happens *during* a session, which the static script cannot.

Neither layer is a security control. Both are stated as such in the code comments so nobody later
mistakes them for one.

---

## Components

**`Button`** — variants `default` (filled brand) and `outline` (transparent, brand border/text), as
asked. Plus `size` (`sm` | `md`), `isLoading`, and full `ButtonHTMLAttributes` passthrough with
`forwardRef`. Loading state renders a spinner, keeps the label for screen readers, and sets
`disabled` + `aria-busy`. Never a `<div onClick>`.

**`Input`** — wraps `InputHTMLAttributes` with `forwardRef` so `react-hook-form`'s `register()` can
attach directly. Takes `invalid` for error styling and wires `aria-invalid` / `aria-describedby`.
Type-specific behaviour comes from the caller: `type="email"` with `autoComplete="email"`,
`type="password"` with `autoComplete="current-password"`. The password field gets a show/hide toggle
that is a real `<button type="button">` with an `aria-label`, not an icon `<span>`.

**`FormField`** (molecule) — composes `<label>` + `Input` + `FieldError`, generating and threading the
`id`/`aria-describedby` pair so every input is properly labelled without each caller reinventing it.

All three are token-styled CSS Modules, keyboard-navigable, and have a visible focus ring.

---

## Login page

`pages/login.astro` renders `BaseLayout` + `<LoginIsland client:load />`. The island holds
`QueryClientProvider` and `LoginForm`.

`LoginForm`:
- `useForm<LoginValues>` with `zodResolver(loginFormSchema)` — email format, password non-empty,
  mirroring `apps/api`'s `loginSchema` (which requires only `min(1)` on login, unlike signup's
  `min(8)` — the form must not invent a stricter rule than the API and lock out valid accounts).
- Submits through `useLogin()` (React Query mutation → `POST /api/auth/login`).
- On success: `setTokens(pair)`, then `location.assign('/orders')`.
- On `400` with `invalid_params`: map each `{id, message}` onto `setError(id, {message})` so errors
  land on the right field.
- On `401`: a form-level error — "Invalid email or password" — never field-level, since revealing
  *which* half was wrong is an account-enumeration hint the API deliberately avoids (it burns a dummy
  bcrypt hash to equalise timing; the UI shouldn't undo that).
- Submit button is `isLoading` + disabled while pending, so a double-click can't double-submit.

A link to signup is included only if PR 4 adds that page; otherwise the login page notes that
accounts are created via the API. **No signup screen in this PR.**

---

## Gap found in PR 1: the dev proxy

`baseURL: "/api"` assumes one origin. In the dev Docker topology that assumption is currently false —
`web` is on `:4321` and `api` on `:3000`, so a relative `/api/...` from the Astro dev server hits
the *dev server*, which serves 404s, not the API. PR 1 wired nginx for staging/prod but never wired
the dev-side equivalent, because nothing had yet made a request.

Fix in `astro.config.mjs`:

```js
vite: {
  server: {
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
}
```

`docker-compose.dev.yml` sets `API_PROXY_TARGET=http://api:3000` on the `web` service (service name
inside the Compose network); the default covers running `pnpm dev` on the host. Same origin in every
environment, so still no CORS anywhere.

---

## `packages/shared` gets real content

The placeholder from PR 1 is replaced with **TypeScript types only, no runtime code**:

```ts
export interface TokenPair { accessToken: string; refreshToken: string; }
export interface ApiErrorBody {
  status: number;
  description: string;
  invalid_params?: { id: string; message: string }[];
}
export interface PizzaType { id: number; name: string; price: number; }
```

**Types-only is deliberate.** Exporting zod schemas would couple both apps to one zod version and
drag a runtime dependency into a package the frontend bundles; types erase at compile time and cost
nothing. The tradeoff is that these can drift from the API's actual responses — accepted for now,
with the honest note that the real fix is generating them from the OpenAPI spec the API already
serves at `/api-docs.json`. That generator is a follow-up, not this PR.

`apps/api` is **not** refactored to consume these types here. That keeps this PR's diff inside
`apps/web` + `packages/shared`, and the API adopting them is a mechanical follow-up.

---

## Verification

- `pnpm typecheck` clean across all three packages (`astro check` covers `.astro` and `.tsx`).
- `pnpm test` — 112 existing tests still pass, plus new unit tests for the pure logic:
  `isExpired()` (valid / expired / malformed / skew boundary) and the auth store's
  `setTokens`/`clear`/`logout`-on-network-failure paths. Component tests are a follow-up; these two
  are where the subtle bugs live.
- `pnpm build` — Astro static build succeeds, `dist/` contains `login/index.html`.
- **Live, against the real stack** (`docker compose -f docker-compose.yml -f docker-compose.dev.yml
  up` + `run --rm migrate`):
  1. Visiting `/orders` logged out redirects to `/login` with no flash of authenticated content.
  2. Signing up via `curl`, then logging in through the form, lands on `/orders`.
  3. Wrong password shows the form-level error, not a field error, and does not reveal which field.
  4. A malformed email is caught client-side by zod before any request is sent.
  5. Manually corrupting `piznek.accessToken` in devtools → next request 401s → tokens cleared →
     redirected to `/login`.
  6. Setting the access token to an expired JWT → the request interceptor refreshes *before* sending
     and the request succeeds, with exactly one `POST /api/auth/refresh` in the network tab.
  7. Firing several authenticated requests at once with an expired token produces **one** refresh
     call, not several — the rotation-race check.

## Non-goals

Orders homepage and Create Order screen (PR 4/5); signup UI; SSR or httpOnly cookies; CI; the
`validate.middleware.ts` Express 5 query bug from `TASKS.md` (still open, and `GET /api/orders`
still hits it — **PR 4 is blocked on that fix**, this PR is not, since login uses no query params);
component/E2E tests; i18n; dark mode (tokens are structured to allow it later, but no dark palette
is defined).

## Follow-ups this PR deliberately leaves open

- Replace the invented Piznek tokens with the real values from the Dribbble shot.
- `GET /api/auth/me` or `name` in the JWT, so the UI can greet a user by name.
- Generate `packages/shared` types from `/api-docs.json` instead of hand-writing them.
- Fix `validate.middleware.ts` before PR 4 touches `GET /api/orders`.
