import { avatarHue, initials } from "@/lib/profile";
import styles from "./Avatar.module.css";

type AvatarProps = {
  name: string;
  size?: "sm" | "lg";
};

// Initials on a hue derived from the name — the same deterministic hash the
// categories use. Presentation-only and aria-hidden: every place it appears,
// the name is already written next to it, so announcing "PN" as well would
// just repeat it in a less useful form.
export default function Avatar({ name, size = "sm" }: AvatarProps) {
  const hue = avatarHue(name);
  return (
    <span
      className={`${styles["avatar"]} ${size === "lg" ? styles["lg"] : ""}`}
      style={{
        background: `hsl(${hue} var(--dot-s) var(--dot-l))`,
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
