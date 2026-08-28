import { describe, expect, it } from "vitest";
import type { CalloutQuote } from "@/lib/callout/constants";
import {
  composeCustomerPayableMajor,
  getDisplayTotalMajor,
  isCalloutAmountReady,
  jobCalloutQuoteOf,
  jobEscrowAmountMinor,
  jobTotalMajor,
  payableCalloutMajor,
  quoteCalloutFeeMajor,
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
      false,
    );
    expect(isCalloutAmountReady(quote({ calloutStatus: "CALCULATING" }))).toBe(
      false,
    );
    expect(isCalloutAmountReady(quote({ calloutStatus: "CALCULATED" }))).toBe(
      true,
    );
    expect(isCalloutAmountReady(quote({ calloutStatus: "LOCKED" }))).toBe(true);
    expect(isCalloutAmountReady(quote({ calloutStatus: "NOT_ELIGIBLE" }))).toBe(
      true,
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
      payableCalloutMajor(
        quote({ calloutEligible: false, calloutStatus: "NOT_ELIGIBLE" }),
      ),
    ).toBe(0);
    expect(payableCalloutMajor(quote({ calloutStatus: "WAIVED" }))).toBe(0);
    expect(payableCalloutMajor(quote({ calloutStatus: "PENDING" }))).toBe(0);
    expect(payableCalloutMajor(null)).toBe(0);
  });
});

describe("jobTotalMajor", () => {
  it("is null until the call-out is settled", () => {
    expect(jobTotalMajor(12000, null)).toBeNull();
    expect(
      jobTotalMajor(12000, quote({ calloutStatus: "PENDING" })),
    ).toBeNull();
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
    const p = composeCustomerPayableMajor(
      12000,
      quote({ calloutStatus: "NOT_ELIGIBLE" }),
    );
    expect(p.totalMajor).toBe(12000);
    expect(p.calloutMajor).toBe(0);
  });
});

describe("getDisplayTotalMajor", () => {
  it("prefers escrow amountMinor over computed total", () => {
    expect(
      getDisplayTotalMajor({ agreedMajor: 150, amountMinor: 142000, quote: quote({ calloutFee: 1270 }) }),
    ).toBe(1420);
    expect(
      getDisplayTotalMajor({ agreedMajor: 150, amountMinor: 15000, quote: quote({ calloutFee: 500 }) }),
    ).toBe(150);
  });

  it("falls back to labour + raw calloutFee when pending", () => {
    expect(
      getDisplayTotalMajor({ agreedMajor: 150, quote: quote({ calloutStatus: "PENDING", calloutFee: 1270 }) }),
    ).toBe(1420);
    expect(
      getDisplayTotalMajor({ agreedMajor: 150, quote: quote({ calloutStatus: "PENDING", calloutFee: 0 }) }),
    ).toBe(150);
  });

  it("shows total for in_progress/completed even when not yet LOCKED", () => {
    expect(getDisplayTotalMajor({ agreedMajor: 150, quote: quote({ calloutFee: 500 }) })).toBe(650);
    expect(getDisplayTotalMajor({ labourMajor: 1420, quote: quote({ calloutFee: 0 }) })).toBe(1420);
  });

  it("returns null when no labour", () => {
    expect(getDisplayTotalMajor({ agreedMajor: null, quote: quote({}) })).toBeNull();
  });

  it("reads snake_case escrow and quote aliases without any-casts", () => {
    expect(jobEscrowAmountMinor({ amount_minor: 142000 })).toBe(142000);
    expect(jobEscrowAmountMinor({ amountMinor: 15000 })).toBe(15000);
    expect(
      quoteCalloutFeeMajor(quote({ calloutFee: null, callout_fee: 1270 })),
    ).toBe(1270);
    expect(jobCalloutQuoteOf({ callout_quote: quote({}) })?.requestId).toBe(
      "job-1",
    );
  });
});
