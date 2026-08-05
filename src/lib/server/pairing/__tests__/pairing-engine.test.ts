import { describe, it, expect } from "vitest";
import {
  MAX_PAIRING_RADIUS_KM,
  nextRadiusKm,
  PAIRING_STAGES,
  PAIRING_WINDOW_MS,
} from "@/lib/server/pairing/pairing-engine";

describe("pairing-engine constants", () => {
  it("uses a 66s pairing window", () => {
    expect(PAIRING_WINDOW_MS).toBe(66_000);
  });

  it("defines all five dispatch stages", () => {
    expect(PAIRING_STAGES).toEqual([
      "waiting_for_selected",
      "selected_review",
      "sequential_pairing",
      "waiting_for_pro",
      "reserved",
    ]);
  });

  it("max radius is the last step (50 km)", () => {
    expect(MAX_PAIRING_RADIUS_KM).toBe(50);
  });
});

describe("nextRadiusKm", () => {
  it("returns 20 when current is 15", () => {
    expect(nextRadiusKm(15)).toBe(20);
  });

  it("returns 30 when current is 20", () => {
    expect(nextRadiusKm(20)).toBe(30);
  });

  it("returns 50 when current is 30", () => {
    expect(nextRadiusKm(30)).toBe(50);
  });

  it("returns null when at max radius", () => {
    expect(nextRadiusKm(50)).toBeNull();
    expect(nextRadiusKm(60)).toBeNull();
  });

  it("returns the first step for a missing radius", () => {
    expect(nextRadiusKm(null)).toBe(15);
  });

  it("returns the next strict step for an intermediate value", () => {
    expect(nextRadiusKm(0)).toBe(15);
    expect(nextRadiusKm(22)).toBe(30);
  });
});
