import { forwardRef, type InputHTMLAttributes } from "react";

import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid = false, className, ...rest }, ref) => {
    const classes = [styles.input, invalid ? styles.invalid : null, className]
      .filter(Boolean)
      .join(" ");

    return (
      <input
        ref={ref}
        className={classes}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  },
);

Input.displayName = "Input";
