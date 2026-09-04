import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("../../lib/api-client", () => ({
  apiClient: { post: vi.fn() },
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type AuthStoreModule = typeof import("../auth-store");

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fakeAccessToken(payload: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode("throwaway-signature");
  return `${header}.${body}.${signature}`;
}

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const validAccessToken = () =>
  fakeAccessToken({ sub: 7, email: "pizza-fan@example.com", exp: Date.now() / 1000 + 3600 });

describe("auth-store", () => {
  let mockStorage: Storage;
  let useAuthStore: AuthStoreModule["useAuthStore"];
  let apiClient: { post: Mock };

  beforeEach(async () => {
    vi.resetModules();
    mockStorage = createMockStorage();
    vi.stubGlobal("sessionStorage", mockStorage);

    // Dynamic import (after the sessionStorage stub is in place and modules are reset) so the
    // store's module-load-time hydration reads our mock storage rather than whatever a previous
    // test left behind.
    ({ useAuthStore } = await import("../auth-store"));
    ({ apiClient } = (await import("../../lib/api-client")) as unknown as {
      apiClient: { post: Mock };
    });
    apiClient.post.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates to anonymous when sessionStorage is empty", () => {
    const state = useAuthStore.getState();
    expect(state.status).toBe("anonymous");
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
  });

  it("setTokens populates state and writes both tokens to sessionStorage", () => {
    const accessToken = validAccessToken();
    const refreshToken = "raw-refresh-token";

    useAuthStore.getState().setTokens({ accessToken, refreshToken });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe(accessToken);
    expect(state.refreshToken).toBe(refreshToken);
    expect(state.status).toBe("authenticated");
    expect(state.user).toEqual({ id: 7, email: "pizza-fan@example.com" });

    expect(mockStorage.getItem("piznek.accessToken")).toBe(accessToken);
    expect(mockStorage.getItem("piznek.refreshToken")).toBe(refreshToken);
  });

  it("clear empties state and removes both tokens from sessionStorage", () => {
    useAuthStore.getState().setTokens({ accessToken: validAccessToken(), refreshToken: "rt" });

    useAuthStore.getState().clear();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.status).toBe("anonymous");

    expect(mockStorage.getItem("piznek.accessToken")).toBeNull();
    expect(mockStorage.getItem("piznek.refreshToken")).toBeNull();
  });

  it("logout clears the session even when the API call rejects", async () => {
    useAuthStore.getState().setTokens({ accessToken: validAccessToken(), refreshToken: "rt" });
    apiClient.post.mockRejectedValueOnce(new Error("network down"));

    await useAuthStore.getState().logout();

    expect(apiClient.post).toHaveBeenCalledWith("/auth/logout", { refreshToken: "rt" });

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.status).toBe("anonymous");
    expect(mockStorage.getItem("piznek.accessToken")).toBeNull();
  });

  it("logout clears the session on success too", async () => {
    useAuthStore.getState().setTokens({ accessToken: validAccessToken(), refreshToken: "rt" });
    apiClient.post.mockResolvedValueOnce({ status: 204 });

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it("logout does not call the API when there is no refresh token", async () => {
    await useAuthStore.getState().logout();

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe("anonymous");
  });
});
