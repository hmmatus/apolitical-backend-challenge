import { QueryClient } from "@tanstack/react-query";

// Created at module scope, not inside a component or island. Vite dedupes this module import,
// so every React island on a page (each of which mounts its own React root — see
// docs/plans/frontend-login.md's "Astro islands constraint") shares this exact singleton
// instance rather than each silently maintaining its own cache.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A single retry is enough to smooth over a flaky network blip without masking a real
      // failure for long. A 401 is not retried here in the "try again and hope" sense — the
      // axios interceptor in `api-client.ts` already owns the refresh-and-retry-once flow for
      // 401s, so a query-level retry on top of that would just re-trigger the same interceptor
      // logic redundantly.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
