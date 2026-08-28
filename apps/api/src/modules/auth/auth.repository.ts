import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { hashedRefreshTokens, users } from "../../db/schema.js";
import type { AuthRepository, RefreshTokenRow, User } from "./auth.types.js";

export const authRepository: AuthRepository = {
  async findUserByEmail(email) {
    const [row] = await db.select().from(users).where(eq(users.email, email));
    return row as User | undefined;
  },

  async findUserById(id) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row as User | undefined;
  },

  async createUser(input) {
    const [result] = await db.insert(users).values(input);
    return { id: result.insertId, ...input };
  },

  async insertRefreshToken(input) {
    await db.insert(hashedRefreshTokens).values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
  },

  async findRefreshTokenByHash(tokenHash) {
    const [row] = await db
      .select()
      .from(hashedRefreshTokens)
      .where(eq(hashedRefreshTokens.tokenHash, tokenHash));
    return row as RefreshTokenRow | undefined;
  },

  async revokeRefreshToken(id) {
    await db
      .update(hashedRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(hashedRefreshTokens.id, id));
  },
};
