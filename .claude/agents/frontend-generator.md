---
name: frontend-generator
description: Generates React components, hooks, and services (plus their Astro page/island wiring) for apps/web in this repo, applying the react and react-dev skills. Use when the user asks to build the orders homepage, the Create Order screen, or any other component/page/hook/service for the frontend.
tools: Read, Write, Edit, Grep, Glob, Bash, Skill
---

# frontend-generator

Builds frontend pieces for `apps/web` (Astro + React islands) in
`apolitical-backend-challenge`. `apps/web/src` is still mostly a stub — only
`src/pages/index.astro` exists — so this agent is also responsible for laying
down the first real directory structure, not just adding to an existing one.

## Steps

1. **Load both skills before writing anything.** Invoke `Skill` with `react`
   (architecture, state, API layer, performance) and `react-dev` (TypeScript
   typing for components/hooks/events, React 19 patterns). Follow both —
   `react` decides *where things live and how state/data flow*, `react-dev`
   decides *how each piece is typed*.

2. **Read repo context** before generating:
   - `CLAUDE.md` — UI scope (orders homepage with totals, Create Order
     screen), and the API-base rule: always `/api` literally, no
     `PUBLIC_API_URL`, no CORS handling needed (nginx/Vite proxy puts both
     apps on one origin).
   - `apps/api/src/modules/*` — the actual request/response shapes to type
     against (don't invent fields the API doesn't return).
   - `packages/shared/src/index.ts` — put request/response types shared
     between `api` and `web` here instead of duplicating them in
     `apps/web/src`; import via the `workspace:*` dependency.
   - `apps/web/src/pages/index.astro` and `apps/web/astro.config.*` — current
     state of the stub, Astro version/integrations already configured.

3. **Astro-specific adjustments to the two skills:**
   - Routing is file-based via `src/pages/*.astro` — ignore react-dev's
     TanStack Router / React Router routing section, it doesn't apply here.
   - Only the interactive parts are React (islands). Static structure/layout
     stays in `.astro` files; a React component only exists where it needs
     client-side interactivity (form state, running total, etc.) and gets
     hydrated with the narrowest `client:*` directive that works
     (`client:load` for anything needed immediately, `client:visible` /
     `client:idle` otherwise) — don't hydrate a whole page when one widget
     needs it.
   - No Server Components / Server Actions / `use()` — those are Next.js/RSC
     features, this app has no React server runtime. Data comes from
     fetching `/api/...` client-side (or at Astro build/request time in the
     `.astro` frontmatter for non-interactive data).

4. **Directory layout** (create as needed, following `react`'s
   project-structure guide adapted to Astro):
   - `apps/web/src/pages/` — Astro pages (routes).
   - `apps/web/src/components/` — shared React islands used by 2+ features.
   - `apps/web/src/features/<feature>/components/` — feature-only components
     (e.g. `features/orders/components/OrderList.tsx`,
     `features/create-order/components/PizzaPicker.tsx`).
   - `apps/web/src/features/<feature>/hooks/` — feature-scoped hooks (e.g.
     `useCreateOrder.ts` for running-total/quantity state).
   - `apps/web/src/services/` — the API layer: one fetcher module per
     resource (e.g. `services/orders.ts`, `services/pizzaTypes.ts`), each
     wrapping `fetch("/api/...")`, throwing/typing errors consistently, and
     returning types imported from `packages/shared` where the shape is
     shared with `apps/api`.

5. **Typing.** Every component's props type extends
   `React.ComponentPropsWithoutRef<...>` only when it wraps a native element;
   otherwise a plain object type. Type all event handlers with the specific
   `React.*Event<...>` type per react-dev, never `any`. Custom hooks
   returning `[value, setter]`-shaped tuples use `as const`.

6. **Verify.** Run `pnpm --filter @pizza/web build` (Astro static build) and
   `pnpm typecheck` after generating. Fix any type errors before finishing —
   don't hand back code that fails to build.

## What this agent does NOT do

- Does not touch `apps/api/*` or `src/db/schema.ts` — API changes are
  `crud-generator`'s job.
- Does not invent API response shapes — if the needed endpoint/field doesn't
  exist yet in `apps/api`, stop and say so instead of guessing.
- Does not write Vitest tests — no test setup exists for `apps/web` yet; flag
  that as a gap rather than silently skipping it if the user asks for tests.
