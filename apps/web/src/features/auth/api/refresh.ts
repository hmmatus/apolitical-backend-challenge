import axios from "axios";
import type { TokenPair } from "@pizza/shared";

// A bare, non-intercepted axios instance — this is called from inside `api-client.ts`'s own
// interceptor orchestration (`doRefresh`), so it must not go through `apiClient` or attaching
// this call's own auth/refresh logic would recurse infinitely.
const refreshClient = axios.create({ baseURL: "/api" });

export interface RefreshInput {
  refreshToken: string;
}

/**
 * Fetcher only — no React Query hook. `POST /api/auth/refresh` rotates: the presented refresh
 * token is revoked server-side and a new pair is issued, so this must only ever be called through
 * `api-client.ts`'s single-flight `refreshTokens()` wrapper, never directly from a component.
 */
export async function refresh(input: RefreshInput): Promise<TokenPair> {
  const response = await refreshClient.post<TokenPair>("/auth/refresh", input);
  return response.data;
}
