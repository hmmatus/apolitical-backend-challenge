---
name: express-middleware
description: Scaffold Express middleware (request validation via Zod, centralized error handling, async-handler wrapper) into src/middlewares/, following this repo's naming and layering conventions. Use whenever a route needs validation, error handling, or any other cross-cutting Express middleware, whether invoked directly or by another agent/skill that needs a middleware to exist.
---

# express-middleware

Scaffolds Express middleware for this repo (`apolitical-backend-challenge`).
Middleware here is a thin, framework-facing layer only — it must never
contain business logic. Business logic belongs in a module's `*.service.ts`.

## Conventions

- File location: `src/middlewares/<name>.middleware.ts`
- One named export per file, no default exports
- TypeScript `strict` mode, ESM (`nodenext`), Express 5 (`Request`,
  `Response`, `NextFunction` from `express`)
- Before creating a file, check if one with the same purpose already exists
  under `src/middlewares/` — reuse it instead of duplicating

## Middleware types

### 1. Validation middleware (Zod)

Given a Zod schema, produce a middleware factory that parses request data
and calls `next(err)` on failure — it does not send the HTTP response
itself; the error-handler middleware does that.

If `zod` is not in `package.json` dependencies, add it first: `pnpm add zod`.

Template — `src/middlewares/validate.middleware.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type RequestPart = "body" | "params" | "query";

export function validate(schema: ZodType, part: RequestPart = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      next(result.error);
      return;
    }
    req[part] = result.data;
    next();
  };
}
```

Usage in a route file: `router.post("/", validate(createOrderSchema), controller.create)`.

### 2. Error-handler middleware

Centralized 4-arg Express error middleware. Maps typed application errors to
HTTP status codes; falls back to 500 for anything unrecognized (including
Zod validation errors, mapped to 400). Must be mounted **last**, after all
routes, in `src/app.ts`.

Template — `src/middlewares/error-handler.middleware.ts`:

```ts
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message = "Invalid request") {
    super(message);
    this.name = "ValidationError";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError || err instanceof ValidationError) {
    res.status(400).json({ error: err.message ?? "Invalid request" });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
```

Mount in `src/app.ts` after all `app.use("/api/...", router)` calls:

```ts
app.use(errorHandler);
```

### 3. Async-handler wrapper

Explicit wrapper so async controller methods that throw/reject reach
`next(err)`. Express 5 auto-forwards rejected promises from async route
handlers, but controllers may call this wrapper explicitly for clarity and
testability, or when wrapping a handler passed through another layer.

Template — `src/middlewares/async-handler.middleware.ts`:

```ts
import type { NextFunction, Request, Response } from "express";

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
```

## When invoked by another agent (e.g. crud-generator)

1. Check `src/middlewares/` for an existing file covering the need — reuse, don't duplicate.
2. If missing, create it from the matching template above, adjusted only if the caller specifies different error types or validation targets.
3. Report the file path back to the caller so it can be imported.
