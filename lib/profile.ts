// Who the signed-in user is, for display. There is no `profile` table: the
// name lives in `auth.users.user_metadata`, which Supabase already returns on
// every session and updates through `auth.updateUser({ data })`. A table would
// add a migration, an RLS policy and a fetch to store one string the session
// is already carrying.

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
