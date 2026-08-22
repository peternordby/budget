import { beforeEach, describe, expect, it } from "vitest";
import { createKeys, resumeFromSession, lock } from "@/lib/crypto";

// E2E-style test exercising the sign-out -> lock -> resume flow.
// This is kept as a vitest test since no external e2e runner is present.

function makeSessionStorage() {
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

describe("e2e: sign-out clears DEK and prevents resume", () => {
  beforeEach(() => {
    // @ts-expect-error set global sessionStorage
    global.sessionStorage = makeSessionStorage();
    lock();
  });

  it("user key is cleared on sign-out and cannot be resumed afterwards", async () => {
    // User signs up / enables encryption
    await createKeys("pw-e2e", "e2e-user");

    // The key can be resumed after a page reload
    expect(await resumeFromSession("e2e-user")).toBe(true);

    // Simulate sign-out event clearing the key
    lock();

    // After sign-out, resuming must fail
    expect(await resumeFromSession("e2e-user")).toBe(false);

    // And any existing sessionStorage entry (if present) must be gone
    // @ts-expect-error access sessionStorage
    expect(sessionStorage.getItem("budget.dek.v1")).toBeNull();
  });
});
