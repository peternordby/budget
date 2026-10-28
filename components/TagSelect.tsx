"use client";

import { useState } from "react";
import { useLedger } from "@/components/LedgerProvider";

const NEW = "__new__";

/**
 * The merkelapp picker: a select over the account's merkelapper, whose last
 * option turns it into a name field. Enter (or leaving the field) creates the
 * merkelapp undated — dates and budget are set on /profil/merkelapper — and
 * selects it, so a trip can be started while the first ticket is entered.
 * `value` is a tag id as a string, "" for none.
 */
export default function TagSelect({
  value,
  onChange,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
}) {
  const ledger = useLedger();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function commit() {
    const trimmed = name.trim();
    if (!trimmed || busy) {
      setAdding(false);
      return;
    }
    setBusy(true);
    try {
      const tag = await ledger.createTag(trimmed);
      onChange(String(tag.id));
      setAdding(false);
      setName("");
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "Kunne ikke opprette merkelappen.");
    }
    setBusy(false);
  }

  if (adding) {
    return (
      <input
        id={id}
        className={className}
        value={name}
        onChange={(event) => setName(event.target.value)}
        // Stopped here so the row's own Enter (save) and Escape (clear) wait
        // until the merkelapp exists.
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            commit();
          } else if (event.key === "Escape") {
            event.stopPropagation();
            setAdding(false);
            setName("");
          }
        }}
        onBlur={commit}
        placeholder="Ny merkelapp"
        aria-label="Navn på ny merkelapp"
        disabled={busy}
        autoFocus
      />
    );
  }

  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(event) => {
        if (event.target.value === NEW) setAdding(true);
        else onChange(event.target.value);
      }}
      aria-label="Merkelapp"
    >
      <option value="">Ingen</option>
      {ledger.tags.map((tag) => (
        <option key={tag.id} value={String(tag.id)}>
          {tag.name}
        </option>
      ))}
      <option value={NEW}>+ Ny merkelapp…</option>
    </select>
  );
}
