import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  EmailTakenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from "../../utils/apiError.js";
import type { AuthRepository, User } from "./auth.types.js";

const PASSWORD_SALT_ROUNDS = 10;
// Precomputed dummy hash so login() spends the same bcrypt.compare time whether or not
// the email exists, avoiding a timing side-channel that would reveal account existence.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString("hex"), PASSWORD_SALT_ROUNDS);

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function parseDurationMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  const value = Number(match[1]);
  const unitMs: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * unitMs[match[2]];
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  async signup(input: { email: string; password: string; name: string }): Promise<TokenPair> {
    const existing = await this.repo.findUserByEmail(input.email);
    if (existing) {
      throw new EmailTakenError();
    }

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS);
    const user = await this.repo.createUser({
      email: input.email,
      passwordHash,
      name: input.name,
    });

    return this.issueTokenPair(user);
  }

  async login(input: { email: string; password: string }): Promise<TokenPair> {
    const user = await this.repo.findUserByEmail(input.email);
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const valid = await bcrypt.compare(input.password, passwordHash);

    if (!user || !valid) {
      throw new InvalidCredentialsError();
    }

    return this.issueTokenPair(user);
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = hashToken(rawRefreshToken);
    const row = await this.repo.findRefreshTokenByHash(tokenHash);

    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new InvalidRefreshTokenError();
    }

    await this.repo.revokeRefreshToken(row.id);

    const user = await this.repo.findUserById(row.userId);
    if (!user) {
      throw new InvalidRefreshTokenError();
    }

    return this.issueTokenPair(user);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    const row = await this.repo.findRefreshTokenByHash(tokenHash);

    if (!row) {
      throw new InvalidRefreshTokenError();
    }

    if (!row.revokedAt) {
      await this.repo.revokeRefreshToken(row.id);
    }
  }

  private async issueTokenPair(user: User): Promise<TokenPair> {
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, jti: randomBytes(8).toString("hex") },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
    );

    const rawRefreshToken = randomBytes(32).toString("hex");
    const refreshTtlMs = parseDurationMs(process.env.REFRESH_TOKEN_EXPIRES_IN!);
    await this.repo.insertRefreshToken({
      userId: user.id,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt: new Date(Date.now() + refreshTtlMs),
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }
}
