import { afterEach, beforeEach, describe, expect, it } from "vitest";

function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    _snapshot: () => JSON.parse(JSON.stringify(store)),
  };
}

describe("client idempotency sticker store", () => {
  let ls: ReturnType<typeof makeLocalStorage>;

  beforeEach(() => {
    ls = makeLocalStorage();
    Object.defineProperty(globalThis, "localStorage", {
      value: ls,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("reuses the same sticker across retries of the same intent", async () => {
    const { getOrCreateIdemKey } = await import("@/lib/jobs/idempotency");
    const a = getOrCreateIdemKey("offer|job1|repair_pro|5000");
    const b = getOrCreateIdemKey("offer|job1|repair_pro|5000");
    expect(a).toBe(b);
    expect(a).toBeTruthy();
  });

  it("mints a different sticker per intent", async () => {
    const { getOrCreateIdemKey } = await import("@/lib/jobs/idempotency");
    const a = getOrCreateIdemKey("offer|job1|repair_pro|5000");
    const b = getOrCreateIdemKey("offer|job1|repair_pro|6000");
    expect(a).not.toBe(b);
  });

  it("mints a fresh sticker after the intent succeeds", async () => {
    const { clearIdemKey, getOrCreateIdemKey } =
      await import("@/lib/jobs/idempotency");
    const a = getOrCreateIdemKey("offer|job1|repair_pro|5000");
    clearIdemKey("offer|job1|repair_pro|5000");
    const b = getOrCreateIdemKey("offer|job1|repair_pro|5000");
    expect(b).toBeTruthy();
    expect(b).not.toBe(a);
  });

  it("returns null when localStorage is unavailable", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const { getOrCreateIdemKey } = await import("@/lib/jobs/idempotency");
    expect(getOrCreateIdemKey("offer|job1|repair_pro|5000")).toBeNull();
  });
});
