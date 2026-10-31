// The look of the app: one of six styles and an accent colour, chosen on
// /profil. Synced through the account (user_metadata.appearance, written by
// AppearanceSettings, applied by AuthGate at sign-in) and cached in
// localStorage so the pre-paint script can apply it before the session
// exists. Light/dark stays per device. Applied to
// <html> (data-style, and --accent/--accent-contrast inline) — globals.css
// derives every other accent token from those two, so nothing else reads this.

export type AppStyle = "standard" | "ark" | "glass" | "neu" | "retro" | "akvarium";

export const APP_STYLES: { value: AppStyle; label: string; description: string }[] = [
  { value: "standard", label: "Standard", description: "Rene flater, tynne kanter" },
  { value: "ark", label: "Ark", description: "Rutenett og rette hjørner, som et regneark" },
  { value: "glass", label: "Glass", description: "Gjennomsiktige flater over farge" },
  { value: "neu", label: "Neumorfisme", description: "Myke former presset ut av flaten" },
  { value: "retro", label: "Retro", description: "Grå vinduer og blå tittellinjer, som Windows 98" },
  { value: "akvarium", label: "Akvarium", description: "Drømmende glass under vann, med hai, skilpadde og fisk" },
];

/** Apple's system hues, toned down a step so the accent sits in the page rather than shouting over it. */
export const ACCENTS: { label: string; value: string }[] = [
  { label: "Blå", value: "#3a73c4" },
  { label: "Indigo", value: "#5b5bbf" },
  { label: "Lilla", value: "#8b55b8" },
  { label: "Rosa", value: "#c84a72" },
  { label: "Rød", value: "#c94b42" },
  { label: "Oransje", value: "#d9822b" },
  { label: "Gul", value: "#d9b13b" },
  { label: "Grønn", value: "#3f8f5a" },
  { label: "Turkis", value: "#2f8c9c" },
  { label: "Grafitt", value: "#5e5e66" },
];

export const APPEARANCE_STORAGE_KEY = "budget-appearance";

export type Appearance = { style: AppStyle; accent: string | null };

export const DEFAULT_APPEARANCE: Appearance = { style: "standard", accent: null };

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White or near-black, whichever reads better on `hex` — so a yellow accent gets dark text. */
export function contrastInk(hex: string): string {
  const l = luminance(hex);
  return (1.05) / (l + 0.05) >= (l + 0.05) / 0.05 ? "#ffffff" : "#111111";
}

/** A stored choice — from localStorage or the account's user_metadata — or the default. */
export function toAppearance(value: unknown): Appearance {
  const v = (value ?? {}) as { style?: unknown; accent?: unknown };
  return {
    style: APP_STYLES.find((s) => s.value === v.style)?.value ?? "standard",
    accent: typeof v.accent === "string" && /^#[0-9a-f]{6}$/i.test(v.accent) ? v.accent : null,
  };
}

export function parseAppearance(raw: string | null): Appearance {
  try {
    return toAppearance(JSON.parse(raw ?? ""));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function applyAppearance(next: Appearance) {
  const root = document.documentElement;
  root.dataset.style = next.style;
  if (next.accent) {
    root.style.setProperty("--accent", next.accent);
    root.style.setProperty("--accent-contrast", contrastInk(next.accent));
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-contrast");
  }
  try {
    // `ink` is stored so the pre-paint script below needs no colour maths.
    const ink = next.accent ? contrastInk(next.accent) : null;
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ ...next, ink }));
  } catch {
    // Private mode: the choice still holds for this session.
  }
}

/** The same, as app/layout.tsx's pre-paint script, so a reload never flashes the default look. */
export const appearanceInitScript = `(function(){try{var a=JSON.parse(localStorage.getItem("${APPEARANCE_STORAGE_KEY}")||"{}"),r=document.documentElement;r.dataset.style=${JSON.stringify(APP_STYLES.map((s) => s.value))}.indexOf(a.style)>-1?a.style:"standard";if(/^#[0-9a-f]{6}$/i.test(a.accent||"")&&a.ink){r.style.setProperty("--accent",a.accent);r.style.setProperty("--accent-contrast",a.ink);}}catch(e){}})();`;
