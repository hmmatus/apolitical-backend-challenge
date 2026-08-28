import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import type { AuthRepository, User, RefreshTokenRow } from "../auth.types.js";
import * as authServiceModule from "../auth.service.js";
import {
  EmailTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from "../../../utils/apiError.js";

// .env isn't loaded under Vitest by default, and auth.service.ts is expected to sign/verify
// JWTs against these vars, so set them explicitly for this file.
process.env.JWT_SECRET = "test-secret";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1h";
process.env.REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN ?? "1d";

/**
 * The plan describes the export as "a class/factory `AuthService` (or `createAuthService`)" —
 * genuinely ambiguous which shape the implementation will land on. This helper accepts either
 * so the test isn't coupled to a guess; it's documented back to the caller in the write-mode report.
 */
interface AuthServiceLike {
  signup(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<{ accessToken: string; refreshToken: string }>;
  login(input: { email: string; password: string }): Promise<{ accessToken: string; refreshToken: string }>;
  refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }>;
  logout(rawRefreshToken: string): Promise<void>;
}

function buildAuthService(repo: AuthRepository): AuthServiceLike {
  const mod = authServiceModule as unknown as {
    AuthService?: new (repo: AuthRepository) => AuthServiceLike;
    createAuthService?: (repo: AuthRepository) => AuthServiceLike;
  };
  if (typeof mod.createAuthService === "function") {
    return mod.createAuthService(repo);
  }
  if (typeof mod.AuthService === "function") {
    return new mod.AuthService(repo);
  }
  throw new Error(
    "src/modules/auth/auth.service.ts must export either a class `AuthService` or a factory `createAuthService`",
  );
}

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function decodeAccessToken(token: string): { sub: number; email: string } {
  return jwt.verify(token, process.env.JWT_SECRET!) as unknown as { sub: number; email: string };
}

function createFakeRepo() {
  const users: User[] = [];
  const tokens: RefreshTokenRow[] = [];
  let nextUserId = 1;
  let nextTokenId = 1;
  let revokeCallCount = 0;

  const repo: AuthRepository = {
    async findUserByEmail(email) {
      return users.find((u) => u.email === email);
    },
    async findUserById(id) {
      return users.find((u) => u.id === id);
    },
    async createUser(input) {
      const user: User = { id: nextUserId++, ...input };
      users.push(user);
      return user;
    },
    async insertRefreshToken(input) {
      tokens.push({
        id: nextTokenId++,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
      });
    },
    async findRefreshTokenByHash(tokenHash) {
      return tokens.find((t) => t.tokenHash === tokenHash);
    },
    async revokeRefreshToken(id) {
      revokeCallCount += 1;
      const row = tokens.find((t) => t.id === id);
      if (row) row.revokedAt = new Date();
    },
  };

  return { repo, users, tokens, getRevokeCallCount: () => revokeCallCount };
}

describe("AuthService", () => {
  describe("signup", () => {
    it("creates a user, hashes the password (never stores it plaintext), and returns a token pair", async () => {
      const { repo, users, tokens } = createFakeRepo();
      const service = buildAuthService(repo);
      const plainPassword = "correcthorsebatterystaple";

      const result = await service.signup({
        email: "alice@example.com",
        password: plainPassword,
        name: "Alice",
      });

      expect(typeof result.accessToken).toBe("string");
      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(typeof result.refreshToken).toBe("string");
      expect(result.refreshToken.length).toBeGreaterThan(0);
      // Response body never contains password/passwordHash in any form.
      expect(result).not.toHaveProperty("password");
      expect(result).not.toHaveProperty("passwordHash");

      expect(users).toHaveLength(1);
      const storedUser = users[0];
      // Cross-cutting: plaintext password must never equal / be comparable to the stored hash.
      expect(storedUser.passwordHash).not.toBe(plainPassword);
      expect(bcrypt.compareSync(plainPassword, storedUser.passwordHash)).toBe(true);

      expect(tokens).toHaveLength(1);
      const tokenRow = tokens[0];
      expect(tokenRow.userId).toBe(storedUser.id);
      // Cross-cutting: only the hash is ever stored, never the raw refresh token.
      expect(tokenRow.tokenHash).not.toBe(result.refreshToken);
      expect(tokenRow.tokenHash).toBe(sha256(result.refreshToken));
      expect(tokenRow.revokedAt).toBeNull();

      const msUntilExpiry = tokenRow.expiresAt.getTime() - Date.now();
      expect(msUntilExpiry).toBeGreaterThan(0);
      expect(msUntilExpiry).toBeLessThanOrEqual(1000 * 60 * 60 * 24 + 5000); // ~1d + slack

      const payload = decodeAccessToken(result.accessToken);
      expect(payload.sub).toBe(storedUser.id);
      expect(payload.email).toBe("alice@example.com");
    });

    it("throws EmailTakenError for an exact-match duplicate email, without inserting a second row", async () => {
      const { repo, users } = createFakeRepo();
      const service = buildAuthService(repo);
      await service.signup({ email: "bob@example.com", password: "password123", name: "Bob" });

      let error: unknown;
      try {
        await service.signup({ email: "bob@example.com", password: "different1", name: "Bob2" });
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(EmailTakenError);
      expect((error as EmailTakenError).status).toBe(409);
      // The error message must never leak the attempted plaintext password.
      expect((error as Error).message).not.toContain("different1");
      expect(users).toHaveLength(1);
    });

    it("treats differently-cased emails as distinct — no case normalization", async () => {
      const { repo, users } = createFakeRepo();
      const service = buildAuthService(repo);

      await service.signup({ email: "Foo@x.com", password: "password123", name: "Foo" });
      await service.signup({ email: "foo@x.com", password: "password123", name: "foo" });

      expect(users).toHaveLength(2);
    });
  });

  describe("login", () => {
    it("returns a new token pair for correct credentials and inserts a new refresh-token row", async () => {
      const { repo, tokens } = createFakeRepo();
      const service = buildAuthService(repo);
      await service.signup({ email: "carol@example.com", password: "password123", name: "Carol" });
      expect(tokens).toHaveLength(1);

      const result = await service.login({ email: "carol@example.com", password: "password123" });

      expect(typeof result.accessToken).toBe("string");
      expect(typeof result.refreshToken).toBe("string");
      expect(result).not.toHaveProperty("password");
      expect(result).not.toHaveProperty("passwordHash");
      expect(tokens).toHaveLength(2);
    });

    it("throws InvalidCredentialsError identically for wrong-password and unknown-email", async () => {
      const { repo } = createFakeRepo();
      const service = buildAuthService(repo);
      await service.signup({ email: "dave@example.com", password: "password123", name: "Dave" });

      let wrongPasswordError: unknown;
      try {
        await service.login({ email: "dave@example.com", password: "wrongpassword" });
      } catch (err) {
        wrongPasswordError = err;
      }

      let unknownEmailError: unknown;
      try {
        await service.login({ email: "nobody@example.com", password: "whatever1" });
      } catch (err) {
        unknownEmailError = err;
      }

      expect(wrongPasswordError).toBeInstanceOf(InvalidCredentialsError);
      expect(unknownEmailError).toBeInstanceOf(InvalidCredentialsError);
      expect((wrongPasswordError as Error).message).toBe((unknownEmailError as Error).message);
      expect((wrongPasswordError as InvalidCredentialsError).status).toBe(
        (unknownEmailError as InvalidCredentialsError).status,
      );
      expect((wrongPasswordError as InvalidCredentialsError).status).toBe(401);
      // The error message must never leak the attempted plaintext password.
      expect((wrongPasswordError as Error).message).not.toContain("wrongpassword");
    });

    it("throws InvalidCredentialsError (never an unhandled bcrypt error) for an empty-string password", async () => {
      const { repo } = createFakeRepo();
      const service = buildAuthService(repo);
      await service.signup({ email: "erin@example.com", password: "password123", name: "Erin" });

      await expect(service.login({ email: "erin@example.com", password: "" })).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    });
  });

  describe("refresh", () => {
    it("rotates the token: revokes the old row, mints a new pair, same sub in the new access token", async () => {
      const { repo, tokens } = createFakeRepo();
      const service = buildAuthService(repo);
      const signupResult = await service.signup({
        email: "frank@example.com",
        password: "password123",
        name: "Frank",
      });
      const oldTokenRow = tokens[0];

      const refreshed = await service.refresh(signupResult.refreshToken);

      expect(refreshed.accessToken).not.toBe(signupResult.accessToken);
      expect(refreshed.refreshToken).not.toBe(signupResult.refreshToken);
      expect(oldTokenRow.revokedAt).not.toBeNull();

      expect(tokens).toHaveLength(2);
      const newTokenRow = tokens.find((t) => t.tokenHash === sha256(refreshed.refreshToken));
      expect(newTokenRow).toBeDefined();
      expect(newTokenRow?.revokedAt).toBeNull();

      const oldPayload = decodeAccessToken(signupResult.accessToken);
      const newPayload = decodeAccessToken(refreshed.accessToken);
      expect(newPayload.sub).toBe(oldPayload.sub);
    });

    it("throws InvalidRefreshTokenError for an unknown token", async () => {
      const { repo } = createFakeRepo();
      const service = buildAuthService(repo);

      await expect(service.refresh("never-issued-token")).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it("throws InvalidRefreshTokenError for an expired token and does not revoke it as a side effect", async () => {
      const { repo, tokens } = createFakeRepo();
      const service = buildAuthService(repo);
      await repo.createUser({ email: "grace@example.com", passwordHash: "irrelevant-hash", name: "Grace" });
      const raw = "expired-raw-token";
      await repo.insertRefreshToken({
        userId: 1,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh(raw)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
      expect(tokens[0].revokedAt).toBeNull();
    });

    it("throws InvalidRefreshTokenError for an already-revoked token (reuse detection)", async () => {
      const { repo } = createFakeRepo();
      const service = buildAuthService(repo);
      const signupResult = await service.signup({
        email: "heidi@example.com",
        password: "password123",
        name: "Heidi",
      });

      await service.refresh(signupResult.refreshToken); // rotates + revokes the original row

      await expect(service.refresh(signupResult.refreshToken)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it("does not leak across users: refreshing user A's token never mints a token for user B's sub", async () => {
      const { repo } = createFakeRepo();
      const service = buildAuthService(repo);
      const userA = await service.signup({ email: "ivan@example.com", password: "password123", name: "Ivan" });
      const userB = await service.signup({ email: "judy@example.com", password: "password123", name: "Judy" });

      const refreshedA = await service.refresh(userA.refreshToken);
      const payloadA = decodeAccessToken(refreshedA.accessToken);
      const payloadB = decodeAccessToken(userB.accessToken);

      expect(payloadA.sub).not.toBe(payloadB.sub);
    });
  });

  describe("logout", () => {
    it("revokes an active refresh token", async () => {
      const { repo, tokens } = createFakeRepo();
      const service = buildAuthService(repo);
      const signupResult = await service.signup({ email: "kim@example.com", password: "password123", name: "Kim" });

      await service.logout(signupResult.refreshToken);

      expect(tokens[0].revokedAt).not.toBeNull();
    });

    it("is idempotent for an already-revoked token: no second revoke call, timestamp unchanged", async () => {
      const { repo, tokens, getRevokeCallCount } = createFakeRepo();
      const service = buildAuthService(repo);
      const signupResult = await service.signup({ email: "leo@example.com", password: "password123", name: "Leo" });

      await service.logout(signupResult.refreshToken);
      const revokedAtAfterFirst = tokens[0].revokedAt;
      const revokeCallsAfterFirst = getRevokeCallCount();

      await expect(service.logout(signupResult.refreshToken)).resolves.toBeUndefined();

      expect(tokens[0].revokedAt).toEqual(revokedAtAfterFirst);
      expect(getRevokeCallCount()).toBe(revokeCallsAfterFirst);
    });

    it("resolves successfully (does not throw) for an expired-but-not-yet-revoked token", async () => {
      const { repo } = createFakeRepo();
      const service = buildAuthService(repo);
      await repo.createUser({ email: "mia@example.com", passwordHash: "irrelevant-hash", name: "Mia" });
      const raw = "expired-known-token";
      await repo.insertRefreshToken({
        userId: 1,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.logout(raw)).resolves.toBeUndefined();
    });

    it("throws InvalidRefreshTokenError for an unknown token (never issued)", async () => {
      const { repo } = createFakeRepo();
      const service = buildAuthService(repo);

      await expect(service.logout("never-issued-token")).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });
  });

  describe("cross-cutting", () => {
    it("never persists the raw refresh token — only its hash appears in any stored row", async () => {
      const { repo, tokens } = createFakeRepo();
      const service = buildAuthService(repo);
      const result = await service.signup({ email: "nina@example.com", password: "password123", name: "Nina" });

      for (const row of tokens) {
        expect(row.tokenHash).not.toBe(result.refreshToken);
      }
    });
  });
});
