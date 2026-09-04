import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { FieldError } from "../../atoms/field-error";
import { Input } from "../../atoms/input";

import styles from "./FormField.module.css";

export interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Rendered inside the input row, e.g. a password show/hide toggle button. */
  endAdornment?: ReactNode;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, endAdornment, id, className, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;

    return (
      <div className={[styles.field, className].filter(Boolean).join(" ")}>
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
        <div className={styles.inputRow}>
          <Input
            ref={ref}
            id={inputId}
            invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className={endAdornment ? styles.inputWithAdornment : undefined}
            {...rest}
          />
          {endAdornment ? <div className={styles.adornment}>{endAdornment}</div> : null}
        </div>
        <FieldError id={errorId} message={error} />
      </div>
    );
  },
);

FormField.displayName = "FormField";
