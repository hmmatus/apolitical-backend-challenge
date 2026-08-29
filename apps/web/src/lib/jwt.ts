// Pure, dependency-free JWT payload decoding for the browser.
//
// This module never verifies a signature — that is the API's job and the secret isn't
// available here. It only reads `exp`/`email`/`sub` off the payload segment so the request
// interceptor can decide when to refresh and the auth store can derive a display identity.
// A tampered token simply fails at the API; trusting its *contents* client-side for anything
// security-relevant would be a mistake, and nothing here does that.

export interface JwtPayload {
  sub: number;
  email: string;
  exp: number;
}

/**
 * Base64url-decodes the middle segment of a `header.payload.signature` JWT and parses it as
 * JSON. Returns `null` on any failure (wrong number of segments, invalid base64, invalid JSON)
 * instead of throwing, so callers never need a try/catch of their own.
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    const segments = token.split(".");
    if (segments.length !== 3) {
      return null;
    }

    const payloadSegment = segments[1];
    if (!payloadSegment) {
      return null;
    }

    const json = base64UrlDecode(payloadSegment);
    const parsed: unknown = JSON.parse(json);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).sub !== "number" ||
      typeof (parsed as Record<string, unknown>).email !== "string" ||
      typeof (parsed as Record<string, unknown>).exp !== "number"
    ) {
      return null;
    }

    const payload = parsed as { sub: number; email: string; exp: number };
    return { sub: payload.sub, email: payload.email, exp: payload.exp };
  } catch {
    return null;
  }
}

/**
 * `true` if the token cannot be decoded, has already expired, or will expire within
 * `skewSeconds` — i.e. it either has already expired or would expire mid-flight. Used by the
 * request interceptor to refresh proactively rather than after a 401 round-trip.
 */
export function isExpired(token: string, skewSeconds = 30): boolean {
  const payload = decodeToken(token);
  if (!payload) {
    // A token we can't read is not a token we can trust — treat it as expired.
    return true;
  }

  const nowSeconds = Date.now() / 1000;
  return payload.exp < nowSeconds + skewSeconds;
}

/**
 * JWT uses base64URL encoding (`-`/`_` instead of `+`/`/`, padding stripped) and this code runs
 * only in the browser (no Node `Buffer`), so `atob` needs the alphabet fixed up first and the
 * padding restored before it will accept the string.
 */
function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);

  // atob gives us a "binary string" (one byte per char code); decode as UTF-8 bytes so
  // non-ASCII characters in the payload (e.g. an email with accented characters) survive.
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}
