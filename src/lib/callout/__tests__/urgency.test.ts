import { describe, expect, it } from "vitest";
import { calculateCalloutFee } from "@/lib/callout/engine";
import { calloutUrgencyMultiplier } from "@/lib/callout/urgency";

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
