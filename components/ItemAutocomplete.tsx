"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { suggestItems, type ItemSuggestion } from "@/lib/autocomplete";
import styles from "./ItemAutocomplete.module.css";

type ItemAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: ItemSuggestion) => void;
  index: ItemSuggestion[];
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Set when a visible <label htmlFor> points at this input. */
  inputId?: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

export default function ItemAutocomplete({
  value,
  onChange,
  onSelect,
  index,
  className,
  placeholder,
  ariaLabel,
  inputId,
  autoFocus,
  inputRef,
}: ItemAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const matches = useMemo(
    () => suggestItems(index, value),
    [index, value]
  );

  // A suggestion list that outlives its matches would swallow the next Enter.
  useEffect(() => {
    setHighlight(0);
  }, [value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const visible = open && matches.length > 0;
  // `matches` can shrink out from under `highlight` when the index prop is
  // rebuilt (a save, delete, or recurring-expense generation refetches the
  // trailing history) while the dropdown is open with a deeper row
  // highlighted. Clamp so rendering and selection can never reference a
  // position past the end of the current match list.
  const activeHighlight = matches.length
    ? Math.min(highlight, matches.length - 1)
    : 0;

  function choose(suggestion?: ItemSuggestion) {
    // Defensive no-op: a stale highlight clamped this render, or the list
    // emptied between keydown and click, should never throw.
    if (!suggestion) return;
    onSelect(suggestion);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!visible) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((activeHighlight + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((activeHighlight - 1 + matches.length) % matches.length);
    } else if (event.key === "Enter") {
      // Take the suggestion instead of letting the row save half-filled.
      event.preventDefault();
      event.stopPropagation();
      choose(matches[activeHighlight]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div
      className={styles["autocomplete"]}
      ref={wrapRef}
      onBlur={(event) => {
        // focusout semantics: relatedTarget is whatever is receiving focus.
        // A click on an option button focuses (or, in Safari, never blurs
        // the input at all) an element inside this wrapper, so this only
        // fires for focus genuinely leaving the component (e.g. Tab away).
        if (wrapRef.current?.contains(event.relatedTarget as Node)) return;
        setOpen(false);
      }}
    >
      <input
        ref={inputRef}
        type="text"
        className={className}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        id={inputId}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
      />
      {visible ? (
        <ul className={styles["autocomplete-list"]} id={listId} role="listbox">
          {matches.map((suggestion, position) => (
            <li key={suggestion.item} role="option" aria-selected={position === activeHighlight}>
              <button
                type="button"
                className={`${styles["autocomplete-option"]} ${position === activeHighlight ? styles["active"] : ""}`}
                onMouseEnter={() => setHighlight(position)}
                onClick={() => choose(suggestion)}
                tabIndex={-1}
              >
                <span className={styles["autocomplete-item"]}>{suggestion.item}</span>
                <span className={`${styles["autocomplete-meta"]} helper`}>
                  {formatCurrency(suggestion.price)}
                  {suggestion.tag ? ` · ${suggestion.tag}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
