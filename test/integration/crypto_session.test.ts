import { beforeEach, describe, expect, it } from "vitest";
import { createKeys, resumeFromSession, lock } from "@/lib/crypto";

// Simple in-memory sessionStorage mock for Node tests
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

describe("crypto integration: session-scoped DEK", () => {
  beforeEach(() => {
    // Ensure module scope is cleared between tests
    // @ts-expect-error set global sessionStorage
    global.sessionStorage = makeSessionStorage();
    lock();
  });

  it("remembers the key under the user id and resumes only for that user", async () => {
    // Set up keys for user-a
    await createKeys("password-a", "user-a");

    // resumeFromSession for the same user should succeed
    expect(await resumeFromSession("user-a")).toBe(true);

    // Clearing the in-memory key then resuming again still works because
    // the sessionStorage entry is tied to that user id.
    lock();
    expect(await resumeFromSession("user-a")).toBe(true);

    // If sessionStorage contains a key stamped for another user, resume must
    // fail for this user and the stored item should be removed.
    // Craft a fake base64 blob (32 zero bytes)
    const fakeBase64 = Buffer.from(new Uint8Array(32)).toString("base64");
    // @ts-expect-error access sessionStorage
    sessionStorage.setItem("budget.dek.v1", `other-user:${fakeBase64}`);

    // Attempt to resume as user-a should fail and clear the item
    const resumed = await resumeFromSession("user-a");
    expect(resumed).toBe(false);
    // @ts-expect-error access sessionStorage
    expect(sessionStorage.getItem("budget.dek.v1")).toBeNull();
  });
});
