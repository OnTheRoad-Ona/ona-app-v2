import { describe, expect, it, beforeEach, vi } from "vitest";
import { windowLeftMs, windowStillOpen } from "@/lib/jobs/deadline";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("windowLeftMs / windowStillOpen (server-clock base)", () => {
  it("returns 0 for missing / invalid deadlines", () => {
    expect(windowLeftMs(null)).toBe(0);
    expect(windowLeftMs(undefined)).toBe(0);
    expect(windowLeftMs("")).toBe(0);
    expect(windowLeftMs("not-a-date")).toBe(0);
    expect(windowStillOpen(null)).toBe(false);
  });

  it("stays open while a deadline is in the future", () => {
    const endsAt = new Date(Date.now() + 60_000).toISOString();
    expect(windowLeftMs(endsAt)).toBeGreaterThan(0);
    expect(windowStillOpen(endsAt)).toBe(true);
  });

  it("closes once the deadline has passed", () => {
    const endsAt = new Date(Date.now() - 1_000).toISOString();
    expect(windowLeftMs(endsAt)).toBe(0);
    expect(windowStillOpen(endsAt)).toBe(false);
  });

  it("honors an explicit nowMs (fixed-clock determinism)", () => {
    const NOW = Date.parse("2026-08-04T12:00:00.000Z");
    const endsAt = new Date(NOW + 60_000).toISOString();
    expect(windowStillOpen(endsAt, NOW)).toBe(true);
    expect(windowStillOpen(endsAt, NOW + 120_000)).toBe(false);
  });
});