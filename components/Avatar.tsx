"use client";

import { useMemo, useRef, useSyncExternalStore } from "react";
import { Style, Avatar as DicebearAvatar } from "@dicebear/core";
import definition from "@dicebear/styles/croodles-neutral.json" with { type: "json" };
import styles from "./Avatar.module.css";

// Built once, at module scope: the Style is a parsed definition, not per-avatar
// state, and constructing it on every render would re-parse 24KB of JSON on
// every nav re-render.
const style = new Style(definition);

// The easter egg: seven quick clicks on the avatar on /profil swap it for a
// scuba diver (public/diver.svg), and seven more swap it back. Per device, in
// localStorage; the custom event tells the nav's copy in the same tab, which
// `storage` does not.
const DIVER_KEY = "budget-diver";
const DIVER_CLICKS = 7;

function subscribeDiver(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(DIVER_KEY, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DIVER_KEY, onChange);
  };
}

function isDiver() {
  try {
    return window.localStorage.getItem(DIVER_KEY) === "1";
  } catch {
    return false;
  }
}

function toggleDiver() {
  try {
    if (isDiver()) window.localStorage.removeItem(DIVER_KEY);
    else window.localStorage.setItem(DIVER_KEY, "1");
  } catch {
    // No storage: the diver stays a secret.
  }
  window.dispatchEvent(new Event(DIVER_KEY));
}

type AvatarProps = {
  name: string;
  size?: "sm" | "lg";
  /** Counts clicks toward the diver (only /profil's copy). */
  diveable?: boolean;
};

/**
 * A DiceBear "croodles-neutral" avatar, seeded on the name.
 *
 * Seeded rather than stored, for the same reason category colours are derived
 * from the category name: the picture exists the moment the account has a name,
 * with no storage bucket, no upload and nothing that can 404. The drawing is
 * transparent; the circle behind it is a tint of the user's accent colour
 * (Avatar.module.css), so it follows the accent picked on /profil.
 *
 * Rendered as an `<img>` off `toDataUri()` rather than as inline SVG: the markup
 * would otherwise have to go through `dangerouslySetInnerHTML`, and an `<img>`
 * closes that path entirely (a data-URI SVG in an `<img>` cannot execute
 * script). The seed is a user-supplied string, so that matters even though
 * DiceBear does not echo it into the output.
 *
 * Presentation-only and aria-hidden: every place it appears, the name is already
 * written next to it, so announcing it as well would just repeat it.
 */
export default function Avatar({ name, size = "sm", diveable = false }: AvatarProps) {
  const diver = useSyncExternalStore(subscribeDiver, isDiver, () => false);
  // Clicks count while they come within 1.5s of each other.
  const clicks = useRef({ count: 0, at: 0 });

  function onClick() {
    const now = Date.now();
    const c = clicks.current;
    c.count = now - c.at < 1500 ? c.count + 1 : 1;
    c.at = now;
    if (c.count === DIVER_CLICKS) {
      c.count = 0;
      toggleDiver();
    }
  }

  const drawn = useMemo(
    () =>
      // Transparent: the style file defaults to white, which would cover the
      // accent tint behind the image.
      new DicebearAvatar(style, { seed: name, backgroundColor: ["ffffff00"] }).toDataUri(),
    [name]
  );

  return (
    <img
      // Keyed on the diver so the swap replays the entrance.
      key={diver ? "diver" : "drawn"}
      className={`${styles["avatar"]} ${size === "lg" ? styles["lg"] : ""} ${diver ? styles["diver"] : ""}`}
      src={diver ? "/diver.svg" : drawn}
      onClick={diveable ? onClick : undefined}
      alt=""
      width={size === "lg" ? 56 : 26}
      height={size === "lg" ? 56 : 26}
      aria-hidden="true"
      draggable={false}
    />
  );
}
