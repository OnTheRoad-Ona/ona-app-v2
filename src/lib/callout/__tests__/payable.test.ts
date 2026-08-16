import { describe, expect, it } from "vitest";
import type { CalloutQuote } from "@/lib/callout/constants";
import {
  composeCustomerPayableMajor,
  payableCalloutMajor,
} from "@/lib/callout/payable";

function quote(partial: Partial<CalloutQuote>): CalloutQuote {
  return {
    requestId: "job-1",
    calloutEligible: true,
    calloutStatus: "CALCULATED",
    tradeId: "mechanic",
    tradeBaseFee: 3000,
    distanceRate: 350,
    approvedRouteDistanceKm: 1.4,
    billableDistanceKm: 1.4,
    distanceCharge: 490,
    calloutFee: 3490,
    currency: "NGN",
    originLatitude: null,
    originLongitude: null,
    destinationLatitude: null,
    destinationLongitude: null,
    routeSource: "test",
    calculatedAt: null,
    lockedAt: null,
    ...partial,
  };
}

describe("payableCalloutMajor", () => {
  it("uses calculated / locked fees", () => {
    expect(payableCalloutMajor(quote({}))).toBe(3490);
    expect(payableCalloutMajor(quote({ calloutStatus: "LOCKED" }))).toBe(3490);
  });

  it("is zero when not eligible or waived", () => {
    expect(
      payableCalloutMajor(quote({ calloutEligible: false, calloutStatus: "NOT_ELIGIBLE" }))
    ).toBe(0);
    expect(payableCalloutMajor(quote({ calloutStatus: "WAIVED" }))).toBe(0);
    expect(payableCalloutMajor(quote({ calloutStatus: "PENDING" }))).toBe(0);
    expect(payableCalloutMajor(null)).toBe(0);
  });
});

describe("composeCustomerPayableMajor", () => {
  it("adds call-out beside labour without changing labour", () => {
    const p = composeCustomerPayableMajor(12000, quote({}));
    expect(p.labourMajor).toBe(12000);
    expect(p.calloutMajor).toBe(3490);
    expect(p.totalMajor).toBe(15490);
  });

  it("labour-only when there is no payable call-out", () => {
    const p = composeCustomerPayableMajor(12000, quote({ calloutStatus: "NOT_ELIGIBLE" }));
    expect(p.totalMajor).toBe(12000);
    expect(p.calloutMajor).toBe(0);
  });
});
