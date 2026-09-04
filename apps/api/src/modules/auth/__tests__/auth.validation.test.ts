import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema, refreshSchema } from "../auth.dto.js";

describe("signupSchema", () => {
  it("accepts a valid payload", () => {
    const result = signupSchema.safeParse({
      email: "test@example.com",
      password: "password123",
      name: "Test User",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = signupSchema.safeParse({
      email: "not-an-email",
      password: "password123",
      name: "Test User",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "email")).toBe(true);
    }
  });

  it("rejects a password below the minimum length", () => {
    const result = signupSchema.safeParse({
      email: "test@example.com",
      password: "short1",
      name: "Test User",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "password")).toBe(true);
    }
  });

  it("rejects a missing email field", () => {
    const result = signupSchema.safeParse({ password: "password123", name: "Test User" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "email")).toBe(true);
    }
  });

  it("rejects a missing password field", () => {
    const result = signupSchema.safeParse({ email: "test@example.com", name: "Test User" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "password")).toBe(true);
    }
  });

  it("rejects a missing name field", () => {
    const result = signupSchema.safeParse({ email: "test@example.com", password: "password123" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "name")).toBe(true);
    }
  });

  it("rejects an empty-string name", () => {
    const result = signupSchema.safeParse({
      email: "test@example.com",
      password: "password123",
      name: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "name")).toBe(true);
    }
  });
});

describe("loginSchema", () => {
  it("accepts a valid payload", () => {
    const result = loginSchema.safeParse({ email: "test@example.com", password: "anything-goes" });

    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "anything-goes" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "email")).toBe(true);
    }
  });

  it("rejects an empty-string password", () => {
    const result = loginSchema.safeParse({ email: "test@example.com", password: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "password")).toBe(true);
    }
  });

  it("rejects a missing email field", () => {
    const result = loginSchema.safeParse({ password: "anything-goes" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "email")).toBe(true);
    }
  });

  it("rejects a missing password field", () => {
    const result = loginSchema.safeParse({ email: "test@example.com" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "password")).toBe(true);
    }
  });
});

describe("refreshSchema", () => {
  it("accepts a valid payload", () => {
    const result = refreshSchema.safeParse({ refreshToken: "some-raw-refresh-token" });

    expect(result.success).toBe(true);
  });

  it("rejects an empty-string refreshToken", () => {
    const result = refreshSchema.safeParse({ refreshToken: "" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "refreshToken")).toBe(true);
    }
  });

  it("rejects a missing refreshToken field", () => {
    const result = refreshSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "refreshToken")).toBe(true);
    }
  });

  it("rejects a non-string refreshToken", () => {
    const result = refreshSchema.safeParse({ refreshToken: 12345 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "refreshToken")).toBe(true);
    }
  });
});
