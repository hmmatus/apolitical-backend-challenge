import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import type { ApiErrorBody } from "@pizza/shared";
import { Button } from "../../../shared/ui/atoms/button";
import { FormField } from "../../../shared/ui/molecules/form-field";
import { AuthCard } from "../../../shared/ui/organisms/auth-card";
import { useAuthStore } from "../../../stores/auth-store";
import { loginFormSchema, useLogin, type LoginFormValues } from "../api/login";
import styles from "./login-form.module.css";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const setTokens = useAuthStore((state) => state.setTokens);
  const loginMutation = useLogin();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const tokens = await loginMutation.mutateAsync(values);
      setTokens(tokens);
      window.location.assign("/orders");
    } catch (error) {
      if (axios.isAxiosError<ApiErrorBody>(error)) {
        const body = error.response?.data;

        // 400 with invalid_params: shape-level validation failure. Map each entry onto its field.
        if (error.response?.status === 400 && body?.invalid_params?.length) {
          for (const { id, message } of body.invalid_params) {
            if (id === "email" || id === "password") {
              setError(id, { message });
            }
          }
          return;
        }

        // 401: deliberately a form-level error, never field-level. The API burns a dummy bcrypt
        // hash so login timing doesn't reveal whether the email exists — a field-level "wrong
        // password" vs. "no such account" distinction in the UI would undo that.
        if (error.response?.status === 401) {
          setFormError(body?.description ?? "Invalid email or password");
          return;
        }

        setFormError(body?.description ?? "Something went wrong. Please try again.");
        return;
      }

      setFormError("Something went wrong. Please try again.");
    }
  });

  return (
    <AuthCard title="Log in to Piznek">
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />
        <FormField
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          error={errors.password?.message}
          endAdornment={
            <button
              type="button"
              className={styles.toggle}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          }
          {...register("password")}
        />
        {formError ? (
          <p role="alert" className={styles.formError}>
            {formError}
          </p>
        ) : null}
        <Button type="submit" isLoading={isSubmitting || loginMutation.isPending}>
          Log in
        </Button>
      </form>
    </AuthCard>
  );
}
