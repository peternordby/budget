"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { IconCheck } from "@/components/icons";
import {
  ACCENTS,
  APP_STYLES,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearance,
  contrastInk,
  parseAppearance,
  type Appearance,
} from "@/lib/appearance";
import styles from "./AppearanceSettings.module.css";

/**
 * /profil's Utseende card: the style and the accent, applied as they are
 * picked and saved to the account so every device gets them.
 */
export default function AppearanceSettings() {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    try {
      setAppearance(parseAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)));
    } catch {
      // No storage: the defaults are what is showing.
    }
  }, []);

  const [saveError, setSaveError] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  function update(patch: Partial<Appearance>) {
    const next = { ...appearance, ...patch };
    setAppearance(next);
    applyAppearance(next);
    // Debounced: the colour picker fires on every pixel of a drag.
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const { error } = await supabase.auth.updateUser({ data: { appearance: next } });
      setSaveError(Boolean(error));
    }, 600);
  }

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const accent = appearance.accent ?? ACCENTS[0].value;
  const custom = !ACCENTS.some((preset) => preset.value === accent);

  return (
    <div className={styles["body"]}>
      <div className={styles["styles"]} role="group" aria-label="Stil">
        {APP_STYLES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles["style"]}
            aria-pressed={appearance.style === option.value}
            onClick={() => update({ style: option.value })}
          >
            <strong>{option.label}</strong>
            <span className="helper">{option.description}</span>
          </button>
        ))}
      </div>

      <div className={styles["accents"]} role="group" aria-label="Aksentfarge">
        {ACCENTS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={styles["swatch"]}
            style={{ background: preset.value, color: contrastInk(preset.value) }}
            aria-pressed={accent === preset.value}
            aria-label={preset.label}
            title={preset.label}
            onClick={() => update({ accent: preset.value })}
          >
            {accent === preset.value && <IconCheck />}
          </button>
        ))}
        <label className={styles["custom"]} data-on={custom || undefined}>
          <input
            type="color"
            value={accent}
            onChange={(e) => update({ accent: e.target.value })}
            aria-label="Egen aksentfarge"
          />
          Egen
        </label>
      </div>
      {saveError ? (
        <p className="status">Kunne ikke lagre utseendet på kontoen. Det gjelder bare denne enheten inntil videre.</p>
      ) : null}
    </div>
  );
}
