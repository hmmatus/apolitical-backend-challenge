import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../lib/query-client";
import { AuthGuard } from "../features/auth";

// Guarded placeholder only — proves AuthGuard end-to-end (this PR's own verification checklist
// requires visiting /orders logged out to redirect to /login). PR 4 replaces the placeholder
// paragraph with the real order list; no order data/fetching logic belongs in this PR.
export function OrdersIsland() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard>
        <p>Orders — coming in PR 4</p>
      </AuthGuard>
    </QueryClientProvider>
  );
}
