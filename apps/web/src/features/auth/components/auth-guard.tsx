import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "../../../stores/auth-store";

export interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Client-side only, and deliberately not a security boundary — `authMiddleware` and the per-user
 * ownership scoping already in apps/api are the real one. This exists so a logged-out visitor
 * lands on /login instead of an empty screen that 401s. See docs/plans/frontend-login.md,
 * "Route guard — two layers": this is layer 2, catching expiry that happens mid-session. Layer 1
 * is the inline pre-paint script in base-layout.astro, which avoids the flash of authenticated
 * content this layer alone can't prevent (it only runs after the island hydrates).
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "anonymous") {
      window.location.replace("/login");
    }
  }, [status]);

  if (status === "unknown") {
    return (
      <p role="status" aria-live="polite">
        Loading…
      </p>
    );
  }

  if (status === "anonymous") {
    return null;
  }

  return <>{children}</>;
}
