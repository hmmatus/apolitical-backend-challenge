import { describe, it, expect, vi, beforeAll } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { authMiddleware } from "../auth.middleware.js";
import { UnauthorizedError } from "../../utils/apiError.js";

beforeAll(() => {
  // .env isn't loaded under Vitest by default, and the middleware verifies against this var.
  process.env.JWT_SECRET = "test-secret";
});

function buildRequest(authorizationHeader?: string): Request {
  return { headers: { authorization: authorizationHeader } } as unknown as Request;
}

const fakeResponse = {} as Response;

describe("authMiddleware", () => {
  it("calls next() with no arguments and sets req.user for a valid, unexpired token", () => {
    const token = jwt.sign({ sub: 42, email: "user@example.com" }, process.env.JWT_SECRET!);
    const req = buildRequest(`Bearer ${token}`);
    const next = vi.fn();

    authMiddleware(req, fakeResponse, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: 42, email: "user@example.com" });
  });

  it("calls next(err) with a 401 when there is no Authorization header at all", () => {
    const req = buildRequest(undefined);
    const next = vi.fn();

    authMiddleware(req, fakeResponse, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.status).toBe(401);
  });

  it("calls next(err) with a 401 for the wrong auth scheme (Basic instead of Bearer)", () => {
    const req = buildRequest("Basic abc123");
    const next = vi.fn();

    authMiddleware(req, fakeResponse, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.status).toBe(401);
  });

  it("calls next(err) with a 401 for 'Bearer' with no token after it", () => {
    const req = buildRequest("Bearer");
    const next = vi.fn();

    authMiddleware(req, fakeResponse, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.status).toBe(401);
  });

  it("calls next(err) with a 401 for 'Bearer ' followed only by whitespace", () => {
    const req = buildRequest("Bearer    ");
    const next = vi.fn();

    authMiddleware(req, fakeResponse, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.status).toBe(401);
  });

  it("calls next(err) with a 401 for a garbage/malformed token, without throwing synchronously", () => {
    const req = buildRequest("Bearer not-a-real-jwt");
    const next = vi.fn();

    expect(() => authMiddleware(req, fakeResponse, next)).not.toThrow();

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.status).toBe(401);
  });

  it("calls next(err) with a 401 for a token signed with a different/wrong secret", () => {
    const token = jwt.sign({ sub: 1, email: "user@example.com" }, "a-completely-different-secret");
    const req = buildRequest(`Bearer ${token}`);
    const next = vi.fn();

    authMiddleware(req, fakeResponse, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.status).toBe(401);
  });

  it("calls next(err) with a 401 for an expired token (valid signature, exp in the past)", () => {
    const token = jwt.sign({ sub: 1, email: "user@example.com" }, process.env.JWT_SECRET!, {
      expiresIn: -10,
    });
    const req = buildRequest(`Bearer ${token}`);
    const next = vi.fn();

    authMiddleware(req, fakeResponse, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err.status).toBe(401);
  });
});
