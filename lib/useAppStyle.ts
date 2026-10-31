import { useSyncExternalStore } from "react";
import type { AppStyle } from "./appearance";

// The style on <html> (data-style), followed live: AppearanceSettings and
// AuthGate change it without a re-render anywhere else. For what CSS cannot
// carry — a chart's curve, the cursor effects.

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-style"] });
  return () => observer.disconnect();
}

export function useAppStyle(): AppStyle | undefined {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.style as AppStyle | undefined,
    () => undefined
  );
}
