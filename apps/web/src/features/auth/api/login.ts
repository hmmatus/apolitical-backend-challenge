import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { z } from "zod";
import type { TokenPair } from "@pizza/shared";
import { apiClient } from "../../../lib/api-client";

// Mirrors `apps/api`'s `loginSchema` (src/modules/auth/auth.dto.ts): email format, password
// non-empty. Deliberately *not* signup's `min(8)` rule — this form must never be stricter than
// what the API actually accepts for login, or it would lock out accounts created before a
// password-policy change.
export const loginFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export async function login(input: LoginFormValues): Promise<TokenPair> {
  const response = await apiClient.post<TokenPair>("/auth/login", input);
  return response.data;
}

export function useLogin(): UseMutationResult<TokenPair, unknown, LoginFormValues> {
  return useMutation({
    mutationFn: login,
  });
}
