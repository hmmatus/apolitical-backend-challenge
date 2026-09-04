import styles from "./FieldError.module.css";

export interface FieldErrorProps {
  message?: string;
  id?: string;
}

export function FieldError({ message, id }: FieldErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} role="alert" className={styles.error}>
      {message}
    </p>
  );
}
