export interface User {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
}

export interface RefreshTokenRow {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<User | undefined>;
  findUserById(id: number): Promise<User | undefined>;
  createUser(input: { email: string; passwordHash: string; name: string }): Promise<User>;
  insertRefreshToken(input: { userId: number; tokenHash: string; expiresAt: Date }): Promise<void>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | undefined>;
  revokeRefreshToken(id: number): Promise<void>;
}
