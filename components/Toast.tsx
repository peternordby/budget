"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ToastState } from "@/lib/useToast";
import { T_BASE } from "@/lib/motion";
import styles from "./Toast.module.css";

type ToastProps = {
  toast: ToastState | null;
  onDismiss: () => void;
};

export default function Toast({ toast, onDismiss }: ToastProps) {
  // AnimatePresence, so a toast leaves the way it arrived. It used to be
  // unmounted outright: it slid in and then vanished mid-sentence.
  return (
    <AnimatePresence>
      {toast ? (
    <motion.div
      key="toast"
      className={`${styles["toast"]} ${styles[`toast-${toast.tone}`] ?? ""}`}
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={T_BASE}
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
    </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
