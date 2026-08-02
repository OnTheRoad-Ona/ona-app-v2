import { describe, expect, it, beforeEach } from "vitest";
import {
  INCOMING_POPUP_THROTTLE_MS,
  INCOMING_POPUP_VISIBLE_MS,
  canSurfaceIncomingJob,
  markJobShown,
  readLastWaveAt,
  writeLastWaveAt,
} from "@/lib/jobs/incoming-popup-timing";

function mockWebStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  };
}

describe("canSurfaceIncomingJob", () => {
  beforeEach(() => {
    // Node vitest has no browser storage by default
    Object.defineProperty(globalThis, "localStorage", {
      value: mockWebStorage(),
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: mockWebStorage(),
      configurable: true,
    });
  });

  it("allows first job as new wave", () => {
    expect(canSurfaceIncomingJob("j1", 1_000_000)).toEqual({
      allow: true,
      reason: "new_wave",
    });
  });

  it("blocks already shown job", () => {
    markJobShown("j1");
    expect(canSurfaceIncomingJob("j1", 1_000_000).allow).toBe(false);
  });

  it("piles during 66s window", () => {
    writeLastWaveAt(1_000_000);
    expect(canSurfaceIncomingJob("j2", 1_000_000 + 10_000)).toEqual({
      allow: true,
      reason: "pile",
    });
  });

  it("throttles after hide until 10 min", () => {
    writeLastWaveAt(1_000_000);
    expect(
      canSurfaceIncomingJob("j3", 1_000_000 + INCOMING_POPUP_VISIBLE_MS).allow
    ).toBe(false);
    expect(
      canSurfaceIncomingJob(
        "j3",
        1_000_000 + INCOMING_POPUP_THROTTLE_MS - 1
      ).allow
    ).toBe(false);
  });

  it("new wave after 10 minutes", () => {
    writeLastWaveAt(1_000_000);
    expect(
      canSurfaceIncomingJob(
        "j4",
        1_000_000 + INCOMING_POPUP_THROTTLE_MS
      )
    ).toEqual({ allow: true, reason: "new_wave" });
  });

  it("persists wave timestamp", () => {
    writeLastWaveAt(42);
    expect(readLastWaveAt()).toBe(42);
  });
});
