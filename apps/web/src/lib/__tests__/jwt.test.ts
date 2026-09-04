import { describe, expect, it } from "vitest";
import { decodeToken, isExpired } from "../jwt";

/**
 * Hand-builds a fake JWT string — a throwaway header/signature around a real base64url-encoded
 * payload. `decodeToken` never verifies a signature, so no signing library is needed.
 */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode("throwaway-signature");
  return `${header}.${body}.${signature}`;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const nowSeconds = () => Date.now() / 1000;

describe("decodeToken", () => {
  it("decodes a well-formed token payload", () => {
    const token = fakeJwt({ sub: 42, email: "pizza@example.com", exp: nowSeconds() + 3600 });

    const payload = decodeToken(token);

    expect(payload).toEqual({
      sub: 42,
      email: "pizza@example.com",
      exp: expect.any(Number),
    });
  });

  it("returns null for a malformed token", () => {
    expect(decodeToken("not-a-jwt")).toBeNull();
  });

  it("returns null when the payload segment isn't valid JSON", () => {
    const header = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
    const badBody = base64UrlEncode("this is not json");
    const signature = base64UrlEncode("sig");
    expect(decodeToken(`${header}.${badBody}.${signature}`)).toBeNull();
  });
});

describe("isExpired", () => {
  it("returns false for a token that is valid well beyond the skew window", () => {
    const token = fakeJwt({ sub: 1, email: "a@example.com", exp: nowSeconds() + 3600 });
    expect(isExpired(token)).toBe(false);
  });

  it("returns true for a token that has already expired", () => {
    const token = fakeJwt({ sub: 1, email: "a@example.com", exp: nowSeconds() - 100 });
    expect(isExpired(token)).toBe(true);
  });

  it("returns true for a token expiring inside the default skew window", () => {
    // Expires in 10s; default skew is 30s, so this should already count as expired.
    const token = fakeJwt({ sub: 1, email: "a@example.com", exp: nowSeconds() + 10 });
    expect(isExpired(token)).toBe(true);
  });

  it("respects a custom skew window", () => {
    const token = fakeJwt({ sub: 1, email: "a@example.com", exp: nowSeconds() + 10 });
    expect(isExpired(token, 5)).toBe(false);
  });

  it("returns true for a malformed/undecodable token", () => {
    expect(isExpired("this-is-not-a-jwt-at-all")).toBe(true);
  });
});
