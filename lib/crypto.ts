// End-to-end encryption of the money and the descriptions.
//
// The point of this file is that the database — and whoever administers it —
// only ever holds ciphertext. Amounts and item/tag text are encrypted in the
// browser under a key the server never sees, so `select * from expense` in the
// Supabase dashboard shows `gc:...` where the kroner used to be.
//
// This is only affordable because nothing server-side does arithmetic on the
// money: every query in this app orders by date/id/category and filters by
// date/user_id, and all the aggregation lives in lib/insights.ts, lib/trends.ts
// and friends, on rows already decrypted in memory. The moment something wants
// `sum(price)` in SQL, this scheme is what stands in the way.
//
// Shape of the key material, all of it in auth.users.user_metadata (where
// full_name already lives, so this needs no table, no policy and no fetch):
//
//   enc_salt          random 16 bytes, base64. The PBKDF2 salt.
//   enc_dek           the data key, wrapped under PBKDF2(password, salt).
//   enc_dek_recovery  the same data key, wrapped under PBKDF2(phrase, salt).
//
// The data key is random and wrapped rather than derived from the password
// directly. That is the cheaper design, not the fancier one: changing a
// password rewraps 40 bytes instead of re-encrypting the whole ledger.
//
// A random salt rather than the user id, because the salt has to be known
// before the account exists and must survive an email change.

const PREFIX = "gc:";
const ITERATIONS = 300_000;
const IV_BYTES = 12;
const SESSION_KEY = "budget.dek.v1";

/** The key material this module keeps in `user_metadata`. */
export type EncMeta = {
  enc_salt?: string;
  enc_dek?: string;
  enc_dek_recovery?: string;
};

// Crockford-style base32: no I, L, O or U, so a phrase read off paper cannot
// be transcribed into a different phrase.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function toBase64(bytes: Uint8Array) {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return btoa(out);
}

function fromBase64(value: string) {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function importDek(raw: Uint8Array) {
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

/** PBKDF2 over a secret the user knows, salted with the account's own salt. */
async function deriveKek(secret: string, salt: string) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(salt) as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function sealBytes(key: CryptoKey, plaintext: Uint8Array) {
  const iv = randomBytes(IV_BYTES);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      plaintext as BufferSource
    )
  );
  const joined = new Uint8Array(iv.length + sealed.length);
  joined.set(iv);
  joined.set(sealed, iv.length);
  return toBase64(joined);
}

async function openBytes(key: CryptoKey, blob: string) {
  const joined = fromBase64(blob);
  // AES-GCM's own auth tag is the wrong-password check: a bad key throws here,
  // so nothing separate has to verify the password.
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: joined.slice(0, IV_BYTES) as BufferSource },
    key,
    joined.slice(IV_BYTES) as BufferSource
  );
  return new Uint8Array(plain);
}

// The unlocked data key, for as long as this tab lives. Deliberately not in
// localStorage: the Supabase session persists across browser restarts and the
// key must not, or "encrypted at rest" would mean "until someone opens the
// laptop".
let dek: CryptoKey | null = null;

function session() {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    // Safari in private mode throws on access rather than returning null.
    return null;
  }
}

// Stamped with the account the key belongs to. Without that, a second account
// signing in on the same tab (a shared laptop, or a refresh token that failed
// without a SIGNED_OUT event) would resume the first one's key and decrypt its
// own rows to zeroes — wrong numbers, quietly, which is worse than a locked
// screen.
async function remember(raw: Uint8Array, userId: string) {
  dek = await importDek(raw);
  session()?.setItem(SESSION_KEY, `${userId}:${toBase64(raw)}`);
  return dek;
}

/** True once the data key is available, so rows can be read. */
export function isUnlocked() {
  return dek !== null;
}

/** Restores the key a page reload dropped from module scope, but only for the
 *  account it was stored for. */
export async function resumeFromSession(userId: string) {
  if (dek) return true;
  const stored = session()?.getItem(SESSION_KEY);
  if (!stored) return false;
  const separator = stored.indexOf(":");
  if (separator < 0 || stored.slice(0, separator) !== userId) {
    session()?.removeItem(SESSION_KEY);
    return false;
  }
  try {
    dek = await importDek(fromBase64(stored.slice(separator + 1)));
    return true;
  } catch {
    session()?.removeItem(SESSION_KEY);
    return false;
  }
}

/** Drop the key. Called on sign-out — a second user in the same tab must not
 *  inherit the first one's key. */
export function lock() {
  dek = null;
  session()?.removeItem(SESSION_KEY);
}

/** True when this account has key material at all. False for accounts that
 *  predate encryption, and for invited users who have not set it up yet. */
export function hasEncryption(meta: EncMeta | null | undefined) {
  return Boolean(meta?.enc_salt && meta?.enc_dek);
}

function formatPhrase(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }
  return (out.match(/.{1,4}/g) ?? []).join("-");
}

/** Written down once, at setup. 120 bits, in groups of four. */
export function newRecoveryPhrase() {
  return formatPhrase(randomBytes(15));
}

/** Typed-in phrases arrive with stray spaces, dashes and lowercase. */
export function normalisePhrase(value: string) {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/**
 * First-time setup: a fresh data key, wrapped under the password and under a
 * brand-new recovery phrase. Returns what to store in `user_metadata` and the
 * phrase to show the user exactly once. Leaves the account unlocked.
 */
export async function createKeys(password: string, userId: string) {
  const salt = toBase64(randomBytes(16));
  const raw = randomBytes(32);
  const phrase = newRecoveryPhrase();

  const meta: EncMeta = {
    enc_salt: salt,
    enc_dek: await sealBytes(await deriveKek(password, salt), raw),
    enc_dek_recovery: await sealBytes(
      await deriveKek(normalisePhrase(phrase), salt),
      raw
    ),
  };

  await remember(raw, userId);
  return { meta, phrase };
}

/** Unwraps with the password. Throws if it is wrong. */
export async function unlockWithPassword(
  password: string,
  meta: EncMeta,
  userId: string
) {
  if (!meta.enc_salt || !meta.enc_dek) throw new Error("Mangler nøkkelmateriale.");
  const raw = await openBytes(
    await deriveKek(password, meta.enc_salt),
    meta.enc_dek
  );
  await remember(raw, userId);
}

/**
 * Unwraps with the recovery phrase and rewraps under `newPassword`, which is
 * the only way back in after a password reset: the reset changed the password
 * without touching `enc_dek`, so the old wrap is now unopenable. Returns the
 * metadata to write back.
 */
export async function recoverWithPhrase(
  phrase: string,
  newPassword: string,
  meta: EncMeta,
  userId: string
) {
  if (!meta.enc_salt || !meta.enc_dek_recovery) {
    throw new Error("Kontoen har ingen gjenopprettingskode.");
  }
  const raw = await openBytes(
    await deriveKek(normalisePhrase(phrase), meta.enc_salt),
    meta.enc_dek_recovery
  );
  await remember(raw, userId);
  return {
    ...meta,
    enc_dek: await sealBytes(await deriveKek(newPassword, meta.enc_salt), raw),
  } satisfies EncMeta;
}

/**
 * Rewraps the data key under a new password, for the change-password flow on
 * /profil. The recovery wrap is untouched — the phrase on the user's paper
 * keeps working.
 */
export async function rewrapForPassword(
  currentPassword: string,
  newPassword: string,
  meta: EncMeta
) {
  if (!meta.enc_salt || !meta.enc_dek) throw new Error("Mangler nøkkelmateriale.");
  const raw = await openBytes(
    await deriveKek(currentPassword, meta.enc_salt),
    meta.enc_dek
  );
  return {
    ...meta,
    enc_dek: await sealBytes(await deriveKek(newPassword, meta.enc_salt), raw),
  } satisfies EncMeta;
}

// ---------------------------------------------------------------------------
// Field encryption. Async, because WebCrypto is — there is no synchronous
// AES-GCM in the platform and shipping a JS implementation to avoid an `await`
// would be trading audited code for convenience. Call sites map with
// Promise.all; the row counts here are hundreds, not millions.
// ---------------------------------------------------------------------------

function requireDek() {
  if (!dek) throw new Error("Dataene er låst.");
  return dek;
}

/** Encrypts one field. Numbers are stored as their decimal text. */
export async function encField(value: string | number | null): Promise<string | null> {
  if (value === null || value === "") return null;
  const text = typeof value === "number" ? String(value) : value;
  return PREFIX + (await sealBytes(requireDek(), new TextEncoder().encode(text)));
}

/**
 * Decrypts one field, passing through anything without the marker.
 *
 * The passthrough is what makes the rollout a background pass rather than a
 * flag day: after `alter column price type text` the old rows are still bare
 * digit strings, and they keep rendering correctly until the re-encrypt pass
 * gets to them. It also means a half-finished pass is a consistent state.
 */
export async function decField(value: string | null): Promise<string | null> {
  if (value === null) return null;
  if (!value.startsWith(PREFIX)) return value;
  const plain = await openBytes(requireDek(), value.slice(PREFIX.length));
  return new TextDecoder().decode(plain);
}

/** As decField, for the money columns. Unreadable values become 0 rather than
 *  throwing: one corrupt row must not blank the whole ledger. */
export async function decNumber(value: string | number | null): Promise<number> {
  if (typeof value === "number") return value;
  try {
    const text = await decField(value);
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

/** True for a value still stored in the clear, i.e. one the re-encrypt pass
 *  has yet to reach. */
export function isPlaintext(value: string | number | null) {
  return value !== null && !String(value).startsWith(PREFIX);
}
