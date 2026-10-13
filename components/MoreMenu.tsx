"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconMore } from "@/components/icons";
import styles from "./MoreMenu.module.css";

export type MoreMenuItem =
  | { label: string; onSelect: () => void; disabled?: boolean }
  | { label: string; href: string };

/**
 * The "⋮" menu: actions that belong to a card but are not what the card is
 * for (importing, exporting, settings), so they do not get a button each in
 * its header. Closes on a choice, an outside click and Escape; the arrow keys
 * move between items.
 */
export default function MoreMenu({ items, label }: { items: MoreMenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // Focus the first item so the menu is usable from the keyboard at once.
    root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onMenuKey(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const entries = [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const next = (at + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length;
    entries[next]?.focus();
  }

  return (
    <div className={styles["root"]} ref={root}>
      <button
        className={`icon-btn ${open ? "is-on" : ""}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <IconMore />
      </button>
      {open ? (
        <div className={styles["menu"]} role="menu" onKeyDown={onMenuKey}>
          {items.map((item) =>
            "href" in item ? (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                className={styles["item"]}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={styles["item"]}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
