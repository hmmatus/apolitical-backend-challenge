import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/apiError.js";

// Deliberately not the express-middleware skill's default {error: string} template —
// this repo's auth contract (docs/plans/auth.md) requires {status, description, invalid_params?}.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    res.status(400).json({
      status: 400,
      description: "Validation failed",
      invalid_params: err.issues.map((issue) => ({
        id: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({
      status: err.status,
      description: err.description,
      ...(err.invalidParams ? { invalid_params: err.invalidParams } : {}),
    });
    return;
  }

  console.error(err);
  res.status(500).json({ status: 500, description: "Internal server error" });
}
