"use client";

import { useMemo } from "react";
import { Style, Avatar as DicebearAvatar } from "@dicebear/core";
import definition from "@dicebear/styles/croodles-neutral.json" with { type: "json" };
import styles from "./Avatar.module.css";

// Built once, at module scope: the Style is a parsed definition, not per-avatar
// state, and constructing it on every render would re-parse 24KB of JSON on
// every nav re-render.
const style = new Style(definition);

const BACKGROUNDS = ["ff5d8f", "ffb703", "43aa8b", "4d96ff", "b57bff"];

type AvatarProps = {
  name: string;
  size?: "sm" | "lg";
};

/**
 * A DiceBear "croodles-neutral" avatar, seeded on the name.
 *
 * Seeded rather than stored, for the same reason category colours are derived
 * from the category name: the picture exists the moment the account has a name,
 * with no storage bucket, no upload and nothing that can 404. DiceBear picks the
 * background from the list above off the same seed, so it is stable for as long
 * as the name is.
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
export default function Avatar({ name, size = "sm" }: AvatarProps) {
  const src = useMemo(
    () =>
      new DicebearAvatar(style, {
        backgroundColor: BACKGROUNDS,
        seed: name,
      }).toDataUri(),
    [name]
  );

  return (
    <img
      className={`${styles["avatar"]} ${size === "lg" ? styles["lg"] : ""}`}
      src={src}
      alt=""
      width={size === "lg" ? 56 : 26}
      height={size === "lg" ? 56 : 26}
      aria-hidden="true"
      draggable={false}
    />
  );
}
