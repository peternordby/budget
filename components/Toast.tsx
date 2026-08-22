"use client";

import type { ToastState } from "@/lib/useToast";
import styles from "./Toast.module.css";

type ToastProps = {
  toast: ToastState | null;
  onDismiss: () => void;
};

export default function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null;

  return (
    <div
      className={`${styles["toast"]} ${styles[`toast-${toast.tone}`] ?? ""}`}
      role="status"
      aria-live="polite"
    >
      <span className={styles["toast-message"]}>{toast.message}</span>
      {toast.actionLabel && toast.onAction ? (
        <button
          className="btn btn-ghost btn-small"
          type="button"
          onClick={() => {
            toast.onAction?.();
            onDismiss();
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
      <button
        className={styles["toast-close"]}
        type="button"
        onClick={onDismiss}
        aria-label="Lukk"
      >
        ×
      </button>
    </div>
  );
}
