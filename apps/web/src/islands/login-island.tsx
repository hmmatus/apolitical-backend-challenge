import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../lib/query-client";
import { LoginForm } from "../features/auth";

// One root island per page: each `client:*` directive mounts its own React tree, so this is the
// only place on the login page that needs a QueryClientProvider. See
// docs/plans/frontend-login.md, "The Astro islands constraint".
export function LoginIsland() {
  return (
    <QueryClientProvider client={queryClient}>
      <LoginForm />
    </QueryClientProvider>
  );
}
