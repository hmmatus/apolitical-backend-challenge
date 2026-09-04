import type { ReactNode } from "react";

import styles from "./AuthCard.module.css";

export interface AuthCardProps {
  children: ReactNode;
  title: string;
}

export function AuthCard({ children, title }: AuthCardProps) {
  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </div>
  );
}
