import { describe, expect, it } from "vitest";
import {
  exactFireDelayMs,
  isDeadlinePast,
  secondsLeftFloor,
} from "@/lib/jobs/countdown-math";

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

describe("secondsLeftFloor", () => {
  it("floors remaining seconds like the customer ring", () => {
    expect(secondsLeftFloor(NOW + 66_400, NOW)).toBe(66);
    expect(secondsLeftFloor(NOW + 66_000, NOW)).toBe(66);
    expect(secondsLeftFloor(NOW + 1_999, NOW)).toBe(1);
    expect(secondsLeftFloor(NOW + 1_000, NOW)).toBe(1);
    expect(secondsLeftFloor(NOW + 999, NOW)).toBe(0);
  });

  it("clamps at 0 for past / exact deadlines", () => {
    expect(secondsLeftFloor(NOW, NOW)).toBe(0);
    expect(secondsLeftFloor(NOW - 1_000, NOW)).toBe(0);
    expect(secondsLeftFloor(NOW - 60_000, NOW)).toBe(0);
  });
});

describe("isDeadlinePast", () => {
  it("stays false while the deadline is in the future", () => {
    expect(isDeadlinePast(NOW + 66_000, NOW)).toBe(false);
    expect(isDeadlinePast(NOW + 1, NOW)).toBe(false);
  });

  it("becomes true at the exact deadline and after", () => {
    expect(isDeadlinePast(NOW, NOW)).toBe(true);
    expect(isDeadlinePast(NOW - 1, NOW)).toBe(true);
    expect(isDeadlinePast(NOW - 60_000, NOW)).toBe(true);
  });
});

describe("exactFireDelayMs", () => {
  it("schedules just AFTER the deadline (never early)", () => {
    expect(exactFireDelayMs(NOW + 66_000, NOW)).toBe(66_025);
    expect(exactFireDelayMs(NOW + 1_000, NOW)).toBe(1_025);
  });

  it("returns 0 for a deadline that is already past", () => {
    expect(exactFireDelayMs(NOW, NOW)).toBe(0);
    expect(exactFireDelayMs(NOW - 1_000, NOW)).toBe(0);
  });

  it("honors a custom buffer", () => {
    expect(exactFireDelayMs(NOW + 5_000, NOW, 0)).toBe(5_000);
    expect(exactFireDelayMs(NOW + 5_000, NOW, 100)).toBe(5_100);
  });
});
