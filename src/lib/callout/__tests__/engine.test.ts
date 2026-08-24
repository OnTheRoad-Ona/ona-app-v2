import { describe, expect, it } from "vitest";
import { ALL_PRO_SERVICES, isProService } from "@/lib/services";
import {
  DEFAULT_RATE_PER_KM,
  DEFAULT_TRADE_BASE_FEES,
} from "@/lib/callout/constants";
import { calloutStatusFromJobFlow } from "@/lib/callout/status";
import {
  billableDistanceKm,
  calculateCalloutFee,
  classifyRequest,
  classifyServiceIntent,
  isCalloutExcludedTrade,
  isWithinCalloutRadius,
  resolveCalloutEligibility,
} from "@/lib/callout/engine";
import type { ProService } from "@/lib/types";

describe("billableDistanceKm 500 m minimum", () => {
  it.each([
    [0, 0.5],
    [0.1, 0.5],
    [0.2, 0.5],
    [0.3, 0.5],
    [0.4, 0.5],
    [0.5, 0.5],
    [0.6, 0.6],
    [1, 1],
    [1.02, 1.1],
    [1.4, 1.4],
    [1.43, 1.5],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
  ])("%s km → billable %s km", (raw, expected) => {
    expect(billableDistanceKm(raw)).toBe(expected);
  });
});

describe("isWithinCalloutRadius 5 km max", () => {
  it("includes 0 through 5 km", () => {
    expect(isWithinCalloutRadius(0)).toBe(true);
    expect(isWithinCalloutRadius(2)).toBe(true);
    expect(isWithinCalloutRadius(5)).toBe(true);
  });

  it("excludes 5.1 km", () => {
    expect(isWithinCalloutRadius(5.1)).toBe(false);
  });

  it("excludes 5.01 km and 6 km", () => {
    expect(isWithinCalloutRadius(5.01)).toBe(false);
    expect(isWithinCalloutRadius(6)).toBe(false);
  });
});

describe("calculateCalloutFee mechanic examples", () => {
  const trade = "mechanic" as const;
  const base = 3000;

  it.each([
    [0.5, 3175],
    [1, 3350],
    [1.02, 3385],
    [1.4, 3490],
    [1.43, 3525],
    [2, 3700],
    [3, 4050],
    [4, 4400],
    [5, 4750],
  ])("%s km → ₦%s", (km, fee) => {
    const q = calculateCalloutFee({
      tradeId: trade,
      approvedRouteDistanceKm: km,
      baseFee: base,
    });
    expect(q.tradeBaseFee).toBe(3000);
    expect(q.distanceRate).toBe(DEFAULT_RATE_PER_KM);
    expect(q.calloutFee).toBe(fee);
    expect(q.withinRadius).toBe(true);
    expect(q.shortDistanceReduction).toBe(false);
  });

  it("5.1 km is outside the standard radius", () => {
    const q = calculateCalloutFee({
      tradeId: trade,
      approvedRouteDistanceKm: 5.1,
      baseFee: base,
    });
    expect(q.withinRadius).toBe(false);
  });
});

describe("short-distance rule approved route < 500 m", () => {
  const trade = "mechanic" as const;
  const base = 3000;

  it.each([
    [0, 1270],
    [0.1, 1270],
    [0.3, 1270],
  ])("%s km → ₦%s (both fees × 0.40 after multiplier)", (km, fee) => {
    const q = calculateCalloutFee({
      tradeId: trade,
      approvedRouteDistanceKm: km,
      baseFee: base,
    });
    // 0.5 km billing floor still applies, then the whole call-out is reduced 60%.
    expect(q.billableDistanceKm).toBe(0.5);
    expect(q.tradeBaseFee).toBe(1200); // 3000 × 0.40
    expect(q.distanceCharge).toBe(70); // 0.5 km × 350 × 0.40
    expect(q.calloutFee).toBe(fee);
    expect(q.shortDistanceReduction).toBe(true);
  });

  it("reduction applies AFTER the urgency multiplier", () => {
    const q = calculateCalloutFee({
      tradeId: trade,
      approvedRouteDistanceKm: 0.3,
      baseFee: base,
      urgencyMultiplier: 1.5,
    });
    // (1200 + 70) × 1.5
    expect(q.calloutFee).toBe(1905);
    expect(q.shortDistanceReduction).toBe(true);
  });

  it("0.5 km exactly is NOT short full fee", () => {
    const q = calculateCalloutFee({
      tradeId: trade,
      approvedRouteDistanceKm: 0.5,
      baseFee: base,
    });
    expect(q.calloutFee).toBe(3175);
    expect(q.shortDistanceReduction).toBe(false);
  });
});

describe("call-out excluded trades", () => {
  it("Vulcanizer and Battery are hard-excluded, everyone else may charge", () => {
    expect(isCalloutExcludedTrade("vulcanizer")).toBe(true);
    expect(isCalloutExcludedTrade("battery")).toBe(true);
    expect(isCalloutExcludedTrade("mechanic")).toBe(false);
    expect(isCalloutExcludedTrade("fashion")).toBe(false);
    expect(isCalloutExcludedTrade("diagnostics")).toBe(false);
    expect(isCalloutExcludedTrade(null)).toBe(false);
    expect(isCalloutExcludedTrade(undefined)).toBe(false);
  });
});

describe("calculateCalloutFee vulcanizer / tow examples", () => {
  it("vulcanizer 500m / 1km / 2km / 5km", () => {
    expect(
      calculateCalloutFee({
        tradeId: "vulcanizer",
        approvedRouteDistanceKm: 0.5,
      }).calloutFee,
    ).toBe(1675);
    expect(
      calculateCalloutFee({
        tradeId: "vulcanizer",
        approvedRouteDistanceKm: 1,
      }).calloutFee,
    ).toBe(1850);
    expect(
      calculateCalloutFee({
        tradeId: "vulcanizer",
        approvedRouteDistanceKm: 2,
      }).calloutFee,
    ).toBe(2200);
    expect(
      calculateCalloutFee({
        tradeId: "vulcanizer",
        approvedRouteDistanceKm: 5,
      }).calloutFee,
    ).toBe(3250);
  });

  it("tow 500m / 1km / 5km", () => {
    expect(
      calculateCalloutFee({ tradeId: "towing", approvedRouteDistanceKm: 0.5 })
        .calloutFee,
    ).toBe(4175);
    expect(
      calculateCalloutFee({ tradeId: "towing", approvedRouteDistanceKm: 1 })
        .calloutFee,
    ).toBe(4350);
    expect(
      calculateCalloutFee({ tradeId: "towing", approvedRouteDistanceKm: 5 })
        .calloutFee,
    ).toBe(5750);
  });
});

describe("every trade Base Fee", () => {
  it("has a seed fee for all 14 existing Ona trades", () => {
    expect(ALL_PRO_SERVICES).toHaveLength(14);
    for (const trade of ALL_PRO_SERVICES) {
      expect(DEFAULT_TRADE_BASE_FEES[trade]).toBeGreaterThan(0);
    }
  });

  it.each(Object.entries(DEFAULT_TRADE_BASE_FEES) as [ProService, number][])(
    "%s base ₦%s + 1 km = base + 350",
    (trade, base) => {
      expect(isProService(trade)).toBe(true);
      const q = calculateCalloutFee({
        tradeId: trade,
        approvedRouteDistanceKm: 1,
        baseFee: base,
      });
      expect(q.tradeBaseFee).toBe(base);
      expect(q.distanceCharge).toBe(350);
      expect(q.calloutFee).toBe(base + 350);
    },
  );
});

describe("eligibility is service-agnostic", () => {
  it("requires attendance AND callout_eligible", () => {
    expect(
      resolveCalloutEligibility({
        physicalAttendanceRequired: true,
        calloutEligible: true,
      }),
    ).toBe(true);
    expect(
      resolveCalloutEligibility({
        physicalAttendanceRequired: false,
        calloutEligible: true,
      }),
    ).toBe(false);
    expect(
      resolveCalloutEligibility({
        physicalAttendanceRequired: true,
        calloutEligible: false,
      }),
    ).toBe(false);
    expect(
      resolveCalloutEligibility({
        physicalAttendanceRequired: true,
        calloutEligible: true,
        policyEnabled: false,
      }),
    ).toBe(false);
  });
});

describe("customer problem is a symptom, not a diagnosis", () => {
  it("won't start → breakdown, diagnosis required, no confirmed trade", () => {
    const c = classifyRequest({
      problem: "My car won't start.",
      selectedTrade: "mechanic",
    });
    expect(c.serviceIntent).toBe("VEHICLE_BREAKDOWN");
    expect(c.diagnosisRequired).toBe(true);
    expect(c.physicalAttendanceRequired).toBe(true);
    expect(c.calloutEligible).toBe(true);
    expect(c.confirmedTradeId).toBeNull();
  });

  it("I don't know what's wrong → diagnostic", () => {
    const c = classifyRequest({
      problem: "I don't know what's wrong with my car.",
    });
    expect(c.serviceIntent).toBe("DIAGNOSTIC");
    expect(c.diagnosisRequired).toBe(true);
    expect(c.calloutEligible).toBe(true);
    expect(c.confirmedTradeId).toBeNull();
  });

  it("mobile battery replacement → specific repair, still call-out", () => {
    const c = classifyRequest({
      problem: "I need a mobile battery replacement.",
      selectedTrade: "battery",
    });
    expect(c.serviceIntent).toBe("SPECIFIC_REPAIR");
    expect(c.diagnosisRequired).toBe(false);
    expect(c.physicalAttendanceRequired).toBe(true);
    expect(c.calloutEligible).toBe(true);
    expect(c.confirmedTradeId).toBeNull();
  });

  it("already at the workshop → not call-out eligible", () => {
    const c = classifyRequest({
      problem: "Vehicle is already at the Repair Pro workshop.",
    });
    expect(c.serviceIntent).toBe("WORKSHOP");
    expect(c.physicalAttendanceRequired).toBe(false);
    expect(c.calloutEligible).toBe(false);
  });

  it("maps existing job flow onto call-out status (no second FSM)", () => {
    expect(calloutStatusFromJobFlow("en_route", "CALCULATED")).toBe(
      "IN_PROGRESS",
    );
    expect(calloutStatusFromJobFlow("arrived", "IN_PROGRESS")).toBe("ARRIVED");
    expect(calloutStatusFromJobFlow("completed", "ARRIVED")).toBe("COMPLETED");
    expect(calloutStatusFromJobFlow("cancelled", "CALCULATED")).toBe(
      "CANCELLED",
    );
    expect(calloutStatusFromJobFlow("disputed", "CALCULATED")).toBe("DISPUTED");
    expect(calloutStatusFromJobFlow("en_route", "NOT_ELIGIBLE")).toBe(
      "NOT_ELIGIBLE",
    );
    expect(
      calloutStatusFromJobFlow("waiting_for_pro", "CALCULATED"),
    ).toBeNull();
  });

  it("remote consultation → not call-out eligible", () => {
    expect(
      classifyServiceIntent({ problem: "Need a remote consultation" }),
    ).toBe("REMOTE_CONSULTATION");
    const c = classifyRequest({
      problem: "Need a remote consultation",
    });
    expect(c.calloutEligible).toBe(false);
    expect(c.physicalAttendanceRequired).toBe(false);
  });
});
