import { forwardRef, type ButtonHTMLAttributes } from "react";

import styles from "./Button.module.css";

export type ButtonVariant = "default" | "outline";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "default",
      size = "md",
      isLoading = false,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const classes = [styles.button, styles[variant], styles[size], className]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...rest}
      >
        {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
