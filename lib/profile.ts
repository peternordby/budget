// Who the signed-in user is, for display. There is no `profile` table: the
// name lives in `auth.users.user_metadata`, which Supabase already returns on
// every session and updates through `auth.updateUser({ data })`. A table would
// add a migration, an RLS policy and a fetch to store one string the session
// is already carrying.

import { getCategoryHue } from "@/lib/categoryColor";

export type ProfileUser = {
  email?: string | null;
  user_metadata?: { full_name?: unknown } | null;
};

export function fullName(user: ProfileUser | null | undefined) {
  const value = user?.user_metadata?.full_name;
  return typeof value === "string" ? value.trim() : "";
}

// The name if one is set, otherwise the local part of the email — "peter"
// reads better in a nav chip than "peter@example.com", which truncates to
// something unrecognisable at chip width.
export function displayName(user: ProfileUser | null | undefined) {
  const name = fullName(user);
  if (name) return name;
  const email = user?.email ?? "";
  const local = email.split("@")[0];
  return local || "Bruker";
}

// One or two letters for the avatar. A single word gives its first two
// characters ("Peter" -> "PE") rather than one lonely letter; several words
// give the first letter of the first and last ("Peter Skaar Nordby" -> "PN"),
// skipping the middle names that a monogram conventionally drops.
export function initials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) {
    return [...words[0]].slice(0, 2).join("").toUpperCase();
  }
  const first = [...words[0]][0] ?? "";
  const last = [...words[words.length - 1]][0] ?? "";
  return `${first}${last}`.toUpperCase();
}

// The same deterministic name-hash hue every category-coloured surface uses,
// so an avatar sits in the app's existing colour language instead of
// introducing a second scheme. Keyed on the display name, so the colour is
// stable for as long as the name is.
export function avatarHue(name: string) {
  return getCategoryHue(name);
}
