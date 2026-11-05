import { supabase } from "./supabaseClient";
import { authSecret, unlockWithPassword, type EncMeta } from "./crypto";

// Every password that reaches Supabase Auth goes through here or through
// `authSecret` directly (sign-up, reset, change), so the auth server only ever
// sees the derived secret — see lib/crypto.ts.

/** Checked in the browser only: the server sees the derived secret, never the
 *  password, so a length rule in the Supabase dashboard cannot apply to it. */
export const MIN_PASSWORD_LENGTH = 12;

/** `signInWithPassword` with the derived secret in place of the password. */
export async function signIn(email: string, password: string) {
  const secret = await authSecret(password);
  const result = await supabase.auth.signInWithPassword({ email, password: secret });
  if (result.error?.code !== "invalid_credentials") return result;

  // shortcut: an account created before the derived secret still has its raw
  // password at Supabase. Try that once and move the account over; delete this
  // branch once `select email from auth.users where
  // raw_user_meta_data->>'auth_v' is null` returns nothing. Until then a mistyped
  // password is sent raw on its second attempt.
  const legacy = await supabase.auth.signInWithPassword({ email, password });
  if (legacy.error) return result;
  // current_password: the project requires it on every password change. A
  // failure only means the raw password stays, and the next sign-in tries again.
  await supabase.auth.updateUser({
    password: secret,
    current_password: password,
    data: { auth_v: 1 },
  });
  return legacy;
}

/** Opens the data key, and saves a stronger wrap if the stored one is older. */
export async function unlock(password: string, meta: EncMeta, userId: string) {
  const upgraded = await unlockWithPassword(password, meta, userId);
  // Best effort: the old wrap still opens, so a failed save is retried next unlock.
  if (upgraded) await supabase.auth.updateUser({ data: upgraded });
}
