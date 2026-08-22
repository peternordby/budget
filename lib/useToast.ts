"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastState = {
  message: string;
  tone: "info" | "error";
  actionLabel?: string;
  onAction?: () => void;
};

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const dismissToast = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const showToast = useCallback(
    (next: ToastState, timeoutMs = 8000) => {
      clearTimer();
      setToast(next);
      timer.current = setTimeout(() => setToast(null), timeoutMs);
    },
    [clearTimer]
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { toast, showToast, dismissToast };
}
