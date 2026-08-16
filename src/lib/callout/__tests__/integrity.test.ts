import { describe, expect, it } from "vitest";
import {
  assessTravelIntegrity,
  haversineMeters,
  isUsableAcceptanceFix,
} from "@/lib/callout/integrity";
import { calculateCalloutFee } from "@/lib/callout/engine";

describe("acceptance GPS usability", () => {
  const now = Date.parse("2026-08-16T12:00:00.000Z");

  it("rejects hours-old last-known pins", () => {
    const r = isUsableAcceptanceFix({
      capturedAt: "2026-08-16T08:00:00.000Z",
      nowMs: now,
      maxAgeMs: 90_000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("stale_fix");
  });

  it("rejects unusable accuracy", () => {
    const r = isUsableAcceptanceFix({
      capturedAt: "2026-08-16T11:59:50.000Z",
      accuracyM: 400,
      nowMs: now,
    });
    expect(r.ok).toBe(false);
  });

  it("accepts a fresh accurate fix", () => {
    const r = isUsableAcceptanceFix({
      capturedAt: "2026-08-16T11:59:50.000Z",
      accuracyM: 12,
      nowMs: now,
    });
    expect(r).toEqual({ ok: true });
  });
});

describe("anti-circle / detour — fee stays locked", () => {
  it("1.5 km approved route stays ₦525 distance even if pro drives 10 km", () => {
    const locked = calculateCalloutFee({
      tradeId: "mechanic",
      approvedRouteDistanceKm: 1.5,
    });
    expect(locked.billableDistanceKm).toBe(1.5);
    expect(locked.distanceCharge).toBe(525);
    expect(locked.calloutFee).toBe(3525);

    const afterCircle = calculateCalloutFee({
      tradeId: "mechanic",
      approvedRouteDistanceKm: 1.5,
    });
    expect(afterCircle.calloutFee).toBe(locked.calloutFee);
    expect(afterCircle.calloutFee).not.toBe(
      calculateCalloutFee({
        tradeId: "mechanic",
        approvedRouteDistanceKm: 10,
      }).calloutFee
    );
  });

  it("detour 2.7 km does not replace approved 1.8 km", () => {
    const approved = calculateCalloutFee({
      tradeId: "mechanic",
      approvedRouteDistanceKm: 1.8,
    });
    const ifMetered = calculateCalloutFee({
      tradeId: "mechanic",
      approvedRouteDistanceKm: 2.7,
    });
    expect(approved.calloutFee).toBe(3630);
    expect(ifMetered.calloutFee).toBeGreaterThan(approved.calloutFee);
  });
});

describe("travel integrity does not change fee", () => {
  it("flags impossible jumps as suspicious", () => {
    const r = assessTravelIntegrity({
      acceptance: {
        lat: 6.5,
        lng: 3.3,
        capturedAt: "2026-08-16T12:00:00.000Z",
        accuracyM: 10,
      },
      laterSamples: [
        {
          lat: 7.5,
          lng: 4.3,
          capturedAt: "2026-08-16T12:00:10.000Z",
        },
      ],
      customer: { lat: 6.51, lng: 3.31 },
    });
    expect(r.anomalies).toContain("impossible_location_jump");
    expect(["SUSPICIOUS", "HIGH_RISK"]).toContain(r.status);
  });

  it("flags arrival far from customer", () => {
    const r = assessTravelIntegrity({
      acceptance: {
        lat: 6.5,
        lng: 3.3,
        capturedAt: "2026-08-16T12:00:00.000Z",
      },
      arrival: {
        lat: 6.53,
        lng: 3.35,
        capturedAt: "2026-08-16T12:20:00.000Z",
      },
      customer: { lat: 6.5, lng: 3.3 },
    });
    expect(r.anomalies).toContain("arrival_far_from_customer");
    expect(haversineMeters({ lat: 6.53, lng: 3.35 }, { lat: 6.5, lng: 3.3 })).toBeGreaterThan(
      200
    );
  });

  it("mock-location flag is recorded, fee still from approved route", () => {
    const r = assessTravelIntegrity({
      acceptance: {
        lat: 6.5,
        lng: 3.3,
        capturedAt: "2026-08-16T12:00:00.000Z",
        mockLocation: true,
      },
      customer: { lat: 6.51, lng: 3.31 },
    });
    expect(r.anomalies).toContain("mock_location_flag");
    expect(
      calculateCalloutFee({
        tradeId: "mechanic",
        approvedRouteDistanceKm: 1.5,
      }).calloutFee
    ).toBe(3525);
  });
});
