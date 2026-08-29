import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { refresh as refreshFetcher } from "../features/auth/api/refresh";
import { useAuthStore } from "../stores/auth-store";
import { isExpired } from "./jwt";

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// The literal string "/api", in every environment. This repo's whole architecture assumes
// same-origin `/api` — nginx in prod/staging, the Vite dev proxy in dev (see astro.config.mjs) —
// so this is deliberately not an env var. Reintroducing a configurable base URL would reintroduce
// the cross-origin/CORS problem the rest of the repo was built to avoid.
export const apiClient = axios.create({ baseURL: "/api" });

// `doRefresh` must never call the intercepted `apiClient` — that would recurse into this same
// request interceptor and loop forever. `features/auth/api/refresh.ts` exports a fetcher built on
// a bare, non-intercepted axios instance for exactly this reason.
let inFlightRefresh: Promise<string> | null = null;

/**
 * Single-flight refresh. `POST /api/auth/refresh` rotates server-side (the presented refresh
 * token is revoked and a new pair issued), so two concurrent refresh calls would destroy the
 * session — the second would present a token the first already revoked. Every caller in the same
 * tick (the proactive request-interceptor path and the reactive response-interceptor path can
 * both fire together) shares this one promise, so N callers produce exactly one network call.
 */
async function refreshTokens(): Promise<string> {
  inFlightRefresh ??= doRefresh().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

/**
 * Performs the actual rotation and updates the store on success. On failure, the error is left to
 * propagate — the caller (either interceptor below) owns clearing the store and redirecting,
 * since this function has no opinion about what "the caller" even is.
 */
async function doRefresh(): Promise<string> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) {
    throw new Error("No refresh token available to refresh with");
  }

  const pair = await refreshFetcher({ refreshToken });
  useAuthStore.getState().setTokens(pair);
  return pair.accessToken;
}

/**
 * Session is unrecoverable — clear local state and hard-redirect. This is deliberately not a
 * client-side router navigation: a hard redirect guarantees a clean reload of app state rather
 * than leaving stale React Query caches or component state from the now-invalid session around.
 */
function redirectToLogin(): void {
  useAuthStore.getState().clear();
  window.location.assign("/login");
}

function isRefreshRequest(config: InternalAxiosRequestConfig | undefined): boolean {
  return Boolean(config?.url?.includes("/auth/refresh"));
}

// Request interceptor — proactive: refresh *before* sending if the token we're about to attach
// is already expired (or expiring within the skew window), rather than sending a request we
// already know will 401.
apiClient.interceptors.request.use(async (config: RetryableRequestConfig) => {
  const { accessToken } = useAuthStore.getState();

  // No token at all — login/signup must still be able to fire the request bare.
  if (!accessToken) {
    return config;
  }

  if (isExpired(accessToken)) {
    try {
      const freshAccessToken = await refreshTokens();
      config.headers.Authorization = `Bearer ${freshAccessToken}`;
    } catch (error) {
      redirectToLogin();
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return config;
  }

  config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Response interceptor — reactive: covers the case where the server's clock disagrees with ours
// (a token we believed was still valid gets a 401 anyway).
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined;

    if (error.response?.status !== 401 || !config || isRefreshRequest(config)) {
      return Promise.reject(error);
    }

    if (config._retry) {
      // Already retried once and failed again — refresh isn't going to save this request.
      redirectToLogin();
      return Promise.reject(error);
    }

    config._retry = true;

    try {
      const freshAccessToken = await refreshTokens();
      config.headers.Authorization = `Bearer ${freshAccessToken}`;
      return await apiClient.request(config);
    } catch (refreshError) {
      redirectToLogin();
      return Promise.reject(refreshError instanceof Error ? refreshError : error);
    }
  },
);
