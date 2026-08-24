import { describe, expect, it } from "vitest";
import {
  calculateCalloutFee,
  resolveAppliedMultiplier,
} from "@/lib/callout/engine";
import {
  autoCalloutUrgency,
  calloutUrgencyMultiplier,
} from "@/lib/callout/urgency";
import { nearestProDistanceKm } from "@/lib/callout/use-auto-urgency";

describe("call-out urgency multiplier", () => {
  it("maps Normal / Emergency / Remote / Night", () => {
    expect(calloutUrgencyMultiplier("normal")).toBe(1);
    expect(calloutUrgencyMultiplier("emergency")).toBe(1.25);
    expect(calloutUrgencyMultiplier("remote")).toBe(1.35);
    expect(calloutUrgencyMultiplier("night")).toBe(1.5);
    expect(calloutUrgencyMultiplier(null)).toBe(1);
  });

  it("multiplies call-out only, not the labour base", () => {
    const normal = calculateCalloutFee({
      tradeId: "mechanic",
      approvedRouteDistanceKm: 1.43,
    });
    const night = calculateCalloutFee({
      tradeId: "mechanic",
      approvedRouteDistanceKm: 1.43,
      urgencyMultiplier: 1.5,
    });
    expect(normal.calloutFee).toBe(3525);
    expect(night.calloutFee).toBe(5287.5);
    expect(night.tradeBaseFee).toBe(normal.tradeBaseFee);
  });
});

describe("resolveAppliedMultiplier chips kept, auto overrides when higher", () => {
  // 22:30 Lagos = 21:30 UTC (Lagos is UTC+1, no DST).
  const NIGHT_LAGOS = "2026-08-18T21:30:00Z";
  const DAY_LAGOS = "2026-08-18T12:00:00Z";

  it("Normal chip + daytime + short route stays 1.00", () => {
    expect(
      resolveAppliedMultiplier({
        chipKind: "normal",
        approvedDistanceKm: 3,
        acceptedAt: DAY_LAGOS,
      }),
    ).toEqual({ multiplier: 1, kind: "normal", auto: false });
  });

  it("Night auto (9PM-5AM local) overrides a Normal chip", () => {
    expect(
      resolveAppliedMultiplier({
        chipKind: "normal",
        approvedDistanceKm: 3,
        acceptedAt: NIGHT_LAGOS,
      }),
    ).toEqual({ multiplier: 1.5, kind: "night", auto: true });
  });

  it("Remote auto (4.95-5.00 km) overrides a Normal chip", () => {
    expect(
      resolveAppliedMultiplier({
        chipKind: "normal",
        approvedDistanceKm: 4.98,
        acceptedAt: DAY_LAGOS,
      }),
    ).toEqual({ multiplier: 1.35, kind: "remote", auto: true });
  });

  it("Night beats Remote when both apply never stacked", () => {
    const r = resolveAppliedMultiplier({
      chipKind: "normal",
      approvedDistanceKm: 4.99,
      acceptedAt: NIGHT_LAGOS,
    });
    expect(r).toEqual({ multiplier: 1.5, kind: "night", auto: true });
  });

  it("keeps an Emergency chip when no auto band is active", () => {
    expect(
      resolveAppliedMultiplier({
        chipKind: "emergency",
        approvedDistanceKm: 3,
        acceptedAt: DAY_LAGOS,
      }),
    ).toEqual({ multiplier: 1.25, kind: "emergency", auto: false });
  });

  it("keeps a Night chip even in daytime (chip stays in effect)", () => {
    expect(
      resolveAppliedMultiplier({
        chipKind: "night",
        approvedDistanceKm: 3,
        acceptedAt: DAY_LAGOS,
      }),
    ).toEqual({ multiplier: 1.5, kind: "night", auto: false });
  });

  it("chipMultiplier wins over a stale/mismatched chipKind", () => {
    expect(
      resolveAppliedMultiplier({
        chipKind: "night",
        chipMultiplier: 1.25,
        approvedDistanceKm: 3,
        acceptedAt: DAY_LAGOS,
      }),
    ).toEqual({ multiplier: 1.25, kind: "night", auto: false });
  });

  it("5.0 km exactly is in the Remote band; 4.94 km is not", () => {
    expect(
      resolveAppliedMultiplier({
        approvedDistanceKm: 5,
        acceptedAt: DAY_LAGOS,
      }).multiplier,
    ).toBe(1.35);
    expect(
      resolveAppliedMultiplier({
        approvedDistanceKm: 4.94,
        acceptedAt: DAY_LAGOS,
      }).multiplier,
    ).toBe(1);
  });

  it("5AM exactly is day; 4:59AM is night (Lagos)", () => {
    // 04:59 Lagos = 03:59 UTC; 05:00 Lagos = 04:00 UTC.
    expect(
      resolveAppliedMultiplier({
        acceptedAt: "2026-08-18T03:59:00Z",
        approvedDistanceKm: 3,
      }).multiplier,
    ).toBe(1.5);
    expect(
      resolveAppliedMultiplier({
        acceptedAt: "2026-08-18T04:00:00Z",
        approvedDistanceKm: 3,
      }).multiplier,
    ).toBe(1);
  });
});

describe("autoCalloutUrgency chip auto-select, still changeable", () => {
  // Lagos is UTC+1 (no DST). 12:00 UTC = 13:00 Lagos (day); 21:30 UTC = 22:30 Lagos (night).
  const DAY = "2026-08-18T12:00:00Z";
  const NIGHT = "2026-08-18T21:30:00Z";

  it("day + safe + short route → normal", () => {
    expect(autoCalloutUrgency({ now: new Date(DAY) })).toBe("normal");
  });

  it("day + not safe to drive → emergency", () => {
    expect(autoCalloutUrgency({ unsafe: true, now: new Date(DAY) })).toBe(
      "emergency",
    );
  });

  it("day + 4.98 km → remote (4.95-5 km band)", () => {
    expect(autoCalloutUrgency({ distanceKm: 4.98, now: new Date(DAY) })).toBe(
      "remote",
    );
  });

  it("5.0 km exactly is remote; 4.94 km and 5.01 km are not", () => {
    expect(autoCalloutUrgency({ distanceKm: 5, now: new Date(DAY) })).toBe(
      "remote",
    );
    expect(autoCalloutUrgency({ distanceKm: 4.94, now: new Date(DAY) })).toBe(
      "normal",
    );
    expect(autoCalloutUrgency({ distanceKm: 5.01, now: new Date(DAY) })).toBe(
      "normal",
    );
  });

  it("unknown distance → normal, never remote", () => {
    expect(autoCalloutUrgency({ distanceKm: null, now: new Date(DAY) })).toBe(
      "normal",
    );
  });

  it("night beats an unsafe diagnosis and the remote band", () => {
    expect(
      autoCalloutUrgency({
        unsafe: true,
        distanceKm: 4.98,
        now: new Date(NIGHT),
      }),
    ).toBe("night");
  });

  it("05:00 Lagos exactly is day; 04:59 Lagos is night", () => {
    expect(autoCalloutUrgency({ now: new Date("2026-08-18T04:00:00Z") })).toBe(
      "normal",
    );
    expect(autoCalloutUrgency({ now: new Date("2026-08-18T03:59:00Z") })).toBe(
      "night",
    );
  });
});

describe("nearestProDistanceKm", () => {
  const techs = [
    { serviceType: "mechanic", distanceKm: 1.2 },
    { serviceType: "mechanic", distanceKm: 0.9 },
    { serviceType: "towing", distanceKm: 6 },
    { serviceType: "body", distanceKm: Number.NaN },
  ];

  it("returns the nearest matching pro's distance", () => {
    expect(nearestProDistanceKm(techs, ["mechanic"])).toBe(0.9);
    expect(nearestProDistanceKm(techs, ["body"])).toBeNull();
  });

  it("returns null when no trade matches", () => {
    expect(nearestProDistanceKm(techs, ["plumber"])).toBeNull();
    expect(nearestProDistanceKm(techs, [])).toBeNull();
  });

  it("ignores non-finite distances", () => {
    expect(nearestProDistanceKm(techs, ["body", "mechanic"])).toBe(0.9);
  });
});
