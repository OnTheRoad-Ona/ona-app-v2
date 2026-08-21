import { describe, expect, it } from "vitest";
import type { CalloutQuote } from "@/lib/callout/constants";
import {
  composeCustomerPayableMajor,
  isCalloutAmountReady,
  jobTotalMajor,
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

describe("isCalloutAmountReady", () => {
  it("waits on pending / calculating so labour-only never paints first", () => {
    expect(isCalloutAmountReady(null)).toBe(false);
    expect(isCalloutAmountReady(quote({ calloutStatus: "PENDING" }))).toBe(
      false
    );
    expect(isCalloutAmountReady(quote({ calloutStatus: "CALCULATING" }))).toBe(
      false
    );
    expect(isCalloutAmountReady(quote({ calloutStatus: "CALCULATED" }))).toBe(
      true
    );
    expect(isCalloutAmountReady(quote({ calloutStatus: "LOCKED" }))).toBe(
      true
    );
    expect(isCalloutAmountReady(quote({ calloutStatus: "NOT_ELIGIBLE" }))).toBe(
      true
    );
  });
});

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

describe("jobTotalMajor", () => {
  it("is null until the call-out is settled", () => {
    expect(jobTotalMajor(12000, null)).toBeNull();
    expect(jobTotalMajor(12000, quote({ calloutStatus: "PENDING" }))).toBeNull();
    expect(jobTotalMajor(12000, quote({}))).toBe(15490);
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
