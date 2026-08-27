import { beforeEach, describe, expect, it } from "vitest";
import { createKeys, resumeStoredKey, lock } from "@/lib/crypto";

const KEY = "budget.dek.v2";

// Simple in-memory localStorage mock for Node tests
function makeStorage() {
  const store: Record<string, string> = {};
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
    removeItem(key: string) {
      delete store[key];
    },
  } as Storage;
}

/** The stored entry with its expiry rewritten, for the cases that turn on it. */
function restamp(expiry: number) {
  const [owner, , ...rest] = localStorage.getItem(KEY)!.split(":");
  localStorage.setItem(KEY, `${owner}:${expiry}:${rest.join(":")}`);
}

describe("crypto integration: the stored DEK", () => {
  beforeEach(() => {
    // Ensure module scope is cleared between tests
    global.localStorage = makeStorage();
    lock();
  });

  it("remembers the key under the user id and resumes only for that user", async () => {
    // Set up keys for user-a
    await createKeys("password-a", "user-a");

    // A reload — or a new tab, or a browser restart — drops module scope but
    // keeps localStorage, which is the whole point of storing it there. lock()
    // clears both, so the reload is simulated by putting the stored entry back:
    // resumeStoredKey would otherwise short-circuit on the key still in scope
    // and test nothing.
    const stored = localStorage.getItem(KEY);
    expect(stored).not.toBeNull();
    lock();
    localStorage.setItem(KEY, stored!);
    expect(await resumeStoredKey("user-a")).toBe(true);

    // A reload finding an entry stamped for another user must not resume it,
    // and must not leave it lying around either.
    lock();
    const fakeBase64 = Buffer.from(new Uint8Array(32)).toString("base64");
    localStorage.setItem(KEY, `other-user:${Date.now() + 60_000}:${fakeBase64}`);

    expect(await resumeStoredKey("user-a")).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("does not hand a second account the key still in scope", async () => {
    await createKeys("password-a", "user-a");

    // No SIGNED_OUT event, so lock() never ran and user-a's key is still in
    // module scope. Resuming as someone else must drop it rather than reuse it.
    expect(await resumeStoredKey("user-b")).toBe(false);
    expect(await resumeStoredKey("user-a")).toBe(false);
  });

  it("refuses a key past its window and clears it", async () => {
    await createKeys("password-a", "user-a");
    const stored = localStorage.getItem(KEY)!;
    lock();
    localStorage.setItem(KEY, stored);

    restamp(Date.now() - 1);

    expect(await resumeStoredKey("user-a")).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("slides the window forward on every resume", async () => {
    await createKeys("password-a", "user-a");
    const stored = localStorage.getItem(KEY)!;
    lock();
    localStorage.setItem(KEY, stored);

    // A day left. Opening the app must push it back out to the full window,
    // or a week of daily use would still end in a password prompt.
    const nearly = Date.now() + 24 * 60 * 60 * 1000;
    restamp(nearly);

    expect(await resumeStoredKey("user-a")).toBe(true);
    expect(Number(localStorage.getItem(KEY)!.split(":")[1])).toBeGreaterThan(nearly);
  });

  it("ignores a v1 entry rather than reading it as a v2 one", async () => {
    const fakeBase64 = Buffer.from(new Uint8Array(32)).toString("base64");
    // v1 had no expiry field, so its key bytes sit where the expiry now goes.
    localStorage.setItem("budget.dek.v1", `user-a:${fakeBase64}`);

    expect(await resumeStoredKey("user-a")).toBe(false);
  });
});
