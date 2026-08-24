import { describe, it, expect } from "vitest";
import {
  nextPayoutRetryAt,
  isPayoutAutoRetryExhausted,
  isSettlementInsufficientError,
  isHardPayoutFailure,
  stableProTransferReference,
  PAYOUT_RETRY_INTERVAL_MS,
  PAYOUT_AUTO_RETRY_WINDOW_MS,
  PAYOUT_MAX_AUTO_RETRIES,
} from "@/lib/server/payments/payout-settlement";

describe("payout-settlement constants", () => {
  it("retry interval is 10 minutes", () => {
    expect(PAYOUT_RETRY_INTERVAL_MS).toBe(10 * 60 * 1000);
  });

  it("auto-retry window is 24 hours", () => {
    expect(PAYOUT_AUTO_RETRY_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("max auto retries is 144 (24h / 10min)", () => {
    expect(PAYOUT_MAX_AUTO_RETRIES).toBe(144);
  });
});

describe("nextPayoutRetryAt", () => {
  it("returns ISO string 10 minutes from now", () => {
    const now = Date.now();
    const result = nextPayoutRetryAt(0, now);
    expect(new Date(result).getTime()).toBeCloseTo(
      now + PAYOUT_RETRY_INTERVAL_MS,
      -2,
    );
  });

  it("accepts custom fromMs", () => {
    const from = new Date("2026-07-28T12:00:00.000Z").getTime();
    const result = nextPayoutRetryAt(0, from);
    expect(new Date(result).getTime()).toBe(from + PAYOUT_RETRY_INTERVAL_MS);
  });
});

describe("isPayoutAutoRetryExhausted", () => {
  it("returns true when suspended by admin", () => {
    expect(isPayoutAutoRetryExhausted({ payoutSuspended: true })).toBe(true);
    expect(
      isPayoutAutoRetryExhausted({ payoutStatus: "suspended_admin" }),
    ).toBe(true);
  });

  it("returns true when suspended by admin via payoutStatus", () => {
    expect(
      isPayoutAutoRetryExhausted({ payoutStatus: "suspended_admin" }),
    ).toBe(true);
  });

  it("returns true when retry count exceeds max", () => {
    expect(isPayoutAutoRetryExhausted({ payoutRetryCount: 150 })).toBe(true);
  });

  it("returns true when window has passed", () => {
    const past = new Date(
      Date.now() - (PAYOUT_AUTO_RETRY_WINDOW_MS + 60_000),
    ).toISOString();
    expect(isPayoutAutoRetryExhausted({ payoutRetryStartedAt: past })).toBe(
      true,
    );
  });

  it("returns false for fresh retry", () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    expect(
      isPayoutAutoRetryExhausted({
        payoutRetryStartedAt: recent,
        payoutRetryCount: 1,
      }),
    ).toBe(false);
  });

  it("returns false for empty meta", () => {
    expect(isPayoutAutoRetryExhausted({})).toBe(false);
  });
});

describe("isSettlementInsufficientError", () => {
  it("detects available balance errors", () => {
    expect(
      isSettlementInsufficientError("Available NGN balance insufficient"),
    ).toBe(true);
  });

  it("detects insufficient errors", () => {
    expect(isSettlementInsufficientError("Insufficient funds")).toBe(true);
  });

  it("detects network errors", () => {
    expect(isSettlementInsufficientError("Network error")).toBe(true);
    expect(isSettlementInsufficientError("Fetch failed")).toBe(true);
    expect(isSettlementInsufficientError("ETIMEDOUT")).toBe(true);
  });

  it("detects settlement errors", () => {
    expect(isSettlementInsufficientError("pending_settlement")).toBe(true);
    expect(isSettlementInsufficientError("Ledger balance")).toBe(true);
  });

  it("returns false for null/undefined", () => {
    expect(isSettlementInsufficientError(null)).toBe(false);
    expect(isSettlementInsufficientError(undefined)).toBe(false);
  });

  it("returns false for hard failures", () => {
    expect(isSettlementInsufficientError("Invalid account")).toBe(false);
  });
});

describe("isHardPayoutFailure", () => {
  it("detects invalid account", () => {
    expect(isHardPayoutFailure("Invalid account number")).toBe(true);
  });

  it("detects below minimum", () => {
    expect(isHardPayoutFailure("Amount is below minimum")).toBe(true);
  });

  it("detects bank incomplete", () => {
    expect(isHardPayoutFailure("Bank incomplete")).toBe(true);
  });

  it("returns false for settlement errors", () => {
    expect(isHardPayoutFailure("Available NGN balance insufficient")).toBe(
      false,
    );
  });

  it("returns false for null/undefined", () => {
    expect(isHardPayoutFailure(null)).toBe(false);
  });
});

describe("stableProTransferReference", () => {
  it("generates consistent reference from escrow and request IDs", () => {
    const ref = stableProTransferReference(
      "escrow-uuid-1234",
      "request-uuid-5678",
    );
    expect(ref).toMatch(/^ona_rel_/);
    expect(ref.length).toBeLessThanOrEqual(50);
  });

  it("generates the same reference for same inputs", () => {
    const ref1 = stableProTransferReference("escrow-abc", "request-def");
    const ref2 = stableProTransferReference("escrow-abc", "request-def");
    expect(ref1).toBe(ref2);
  });

  it("generates different references for different inputs", () => {
    const ref1 = stableProTransferReference("escrow-abc", "request-def");
    const ref2 = stableProTransferReference("escrow-xyz", "request-def");
    expect(ref1).not.toBe(ref2);
  });
});
