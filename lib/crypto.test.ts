import { beforeEach, describe, expect, it } from "vitest";
import {
  createKeys,
  decField,
  decNumber,
  encField,
  hasEncryption,
  isPlaintext,
  isUnlocked,
  lock,
  newRecoveryPhrase,
  normalisePhrase,
  recoverWithPhrase,
  rewrapForPassword,
  unlockWithPassword,
} from "./crypto";

// btoa/atob are globals in the browser; in node they exist too, but
// sessionStorage does not — crypto.ts guards for that, and these tests
// exercise the no-storage path.

describe("crypto", () => {
  beforeEach(() => {
    lock();
  });

  it("round-trips a number through the wire format", async () => {
    await createKeys("riktig passord", "t");
    const sealed = await encField(1234);
    expect(sealed).toMatch(/^gc:/);
    expect(sealed).not.toContain("1234");
    expect(await decNumber(sealed)).toBe(1234);
  });

  it("round-trips text, including Norwegian letters", async () => {
    await createKeys("passord", "t");
    const sealed = await encField("Rema 1000 — brød og øl");
    expect(await decField(sealed)).toBe("Rema 1000 — brød og øl");
  });

  it("never produces the same ciphertext twice for the same input", async () => {
    await createKeys("passord", "t");
    // A deterministic scheme would let the admin see that March and April cost
    // exactly the same, or match a known amount against every row.
    expect(await encField(500)).not.toBe(await encField(500));
  });

  it("passes plaintext through, so a half-migrated table still reads", async () => {
    await createKeys("passord", "t");
    expect(await decNumber("4200")).toBe(4200);
    expect(await decField("Rema 1000")).toBe("Rema 1000");
    expect(isPlaintext("4200")).toBe(true);
    expect(isPlaintext(await encField(4200))).toBe(false);
  });

  it("keeps null null", async () => {
    await createKeys("passord", "t");
    expect(await encField(null)).toBeNull();
    expect(await encField("")).toBeNull();
    expect(await decField(null)).toBeNull();
  });

  it("unlocks with the right password and refuses the wrong one", async () => {
    const { meta } = await createKeys("riktig", "t");
    const sealed = await encField(999);
    lock();
    expect(isUnlocked()).toBe(false);

    await expect(unlockWithPassword("galt", meta, "t")).rejects.toThrow();
    expect(isUnlocked()).toBe(false);

    await unlockWithPassword("riktig", meta, "t");
    expect(await decNumber(sealed)).toBe(999);
  });

  it("cannot read anything while locked", async () => {
    await createKeys("passord", "t");
    const sealed = await encField(1);
    lock();
    await expect(encField(1)).rejects.toThrow("låst");
    // decNumber swallows failures so one bad row cannot blank the ledger.
    expect(await decNumber(sealed)).toBe(0);
    await expect(decField(sealed)).rejects.toThrow("låst");
  });

  it("recovers with the phrase after a password reset, and rewraps", async () => {
    const { meta, phrase } = await createKeys("gammelt", "t");
    const sealed = await encField(7777);
    lock();

    // The reset changed the password without touching enc_dek, so the password
    // wrap is now dead and the phrase is the only way in.
    await expect(unlockWithPassword("nytt", meta, "t")).rejects.toThrow();

    const rewrapped = await recoverWithPhrase(phrase, "nytt", meta, "t");
    expect(await decNumber(sealed)).toBe(7777);

    // ...and afterwards the new password opens it directly.
    lock();
    await unlockWithPassword("nytt", rewrapped, "t");
    expect(await decNumber(sealed)).toBe(7777);
  });

  it("accepts a phrase typed back with stray spacing and lowercase", async () => {
    const { meta, phrase } = await createKeys("gammelt", "t");
    const sloppy = ` ${phrase.toLowerCase().replace(/-/g, " ")} `;
    await expect(recoverWithPhrase(sloppy, "nytt", meta, "t")).resolves.toBeTruthy();
  });

  it("rewraps on a password change without disturbing the phrase", async () => {
    const { meta, phrase } = await createKeys("gammelt", "t");
    const sealed = await encField(4200);

    const next = await rewrapForPassword("gammelt", "nytt", meta);
    expect(next.enc_dek).not.toBe(meta.enc_dek);
    expect(next.enc_dek_recovery).toBe(meta.enc_dek_recovery);
    expect(next.enc_salt).toBe(meta.enc_salt);

    lock();
    await unlockWithPassword("nytt", next, "t");
    expect(await decNumber(sealed)).toBe(4200);

    // The paper the user wrote the phrase on is still valid.
    lock();
    await recoverWithPhrase(phrase, "nytt", next, "t");
    expect(await decNumber(sealed)).toBe(4200);
  });

  it("refuses to rewrap on a wrong current password", async () => {
    const { meta } = await createKeys("gammelt", "t");
    await expect(rewrapForPassword("feil", "nytt", meta)).rejects.toThrow();
  });

  it("recognises accounts with and without key material", async () => {
    const { meta } = await createKeys("passord", "t");
    expect(hasEncryption(meta)).toBe(true);
    expect(hasEncryption({})).toBe(false);
    expect(hasEncryption(null)).toBe(false);
    // An account that never finished setup must not be treated as unlockable.
    expect(hasEncryption({ enc_salt: meta.enc_salt })).toBe(false);
  });

  it("mints readable phrases with no ambiguous characters", () => {
    for (let i = 0; i < 20; i += 1) {
      const phrase = newRecoveryPhrase();
      expect(phrase).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/);
      expect(normalisePhrase(phrase)).toHaveLength(24);
    }
  });
});
