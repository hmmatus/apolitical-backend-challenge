import { create } from "zustand";
import type { TokenPair } from "@pizza/shared";
import { apiClient } from "../lib/api-client";
import { decodeToken, isExpired } from "../lib/jwt";

const ACCESS_TOKEN_KEY = "piznek.accessToken";
const REFRESH_TOKEN_KEY = "piznek.refreshToken";

export interface AuthUser {
  id: number;
  email: string;
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  status: "unknown" | "authenticated" | "anonymous";
  setTokens(pair: TokenPair): void;
  clear(): void;
  logout(): Promise<void>;
}

/**
 * Safari private-browsing (and any environment where storage access is blocked) throws
 * synchronously on `sessionStorage` access rather than just failing silently, so every read/write
 * goes through these wrappers. A failed read is always treated as "no token" / logged out rather
 * than crashing the app; a failed write is swallowed for the same reason — there is nothing a
 * caller could usefully do differently in that branch.
 */
function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Best-effort — see file header comment.
  }
}

function removeStorage(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Best-effort — see file header comment.
  }
}

interface HydratedState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  status: "authenticated" | "anonymous";
}

/**
 * Reads whatever is in sessionStorage and decides the store's *initial* state. `sessionStorage`
 * access is synchronous and available immediately in a client-only store like this one, so there
 * is no real window where the answer is unknowable — unlike an SSR app, there's no client/server
 * mismatch to paper over. We resolve straight to "authenticated"/"anonymous" here rather than
 * starting at "unknown" and flipping in a useEffect; "unknown" is kept in the type only so a
 * consumer (the route guard) can distinguish "haven't checked yet" from "checked, not logged in"
 * in case a future async hydration path is ever needed, but nothing in this module actually
 * produces that value today.
 */
function hydrate(): HydratedState {
  const accessToken = readStorage(ACCESS_TOKEN_KEY);
  const refreshToken = readStorage(REFRESH_TOKEN_KEY);

  if (accessToken && !isExpired(accessToken)) {
    const payload = decodeToken(accessToken);
    if (payload) {
      return {
        accessToken,
        refreshToken,
        user: { id: payload.sub, email: payload.email },
        status: "authenticated",
      };
    }
  }

  return { accessToken: null, refreshToken: null, user: null, status: "anonymous" };
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  ...hydrate(),

  setTokens(pair: TokenPair) {
    writeStorage(ACCESS_TOKEN_KEY, pair.accessToken);
    writeStorage(REFRESH_TOKEN_KEY, pair.refreshToken);

    const payload = decodeToken(pair.accessToken);
    set({
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      user: payload ? { id: payload.sub, email: payload.email } : null,
      status: "authenticated",
    });
  },

  clear() {
    removeStorage(ACCESS_TOKEN_KEY);
    removeStorage(REFRESH_TOKEN_KEY);
    set({ accessToken: null, refreshToken: null, user: null, status: "anonymous" });
  },

  async logout() {
    const { refreshToken, clear } = get();
    try {
      if (refreshToken) {
        await apiClient.post("/auth/logout", { refreshToken });
      }
    } catch {
      // A network error (or an already-revoked token) must never trap someone in a session
      // they explicitly asked to leave — clear locally regardless of the API call's outcome.
    } finally {
      clear();
    }
  },
}));
