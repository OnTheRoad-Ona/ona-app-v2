import { describe, expect, it } from "vitest";
import {
  computeCashoutNet,
  validateAgainstLimits,
  cashoutTransferRef,
  type CashoutLimits,
} from "@/lib/server/security/cashout-engine";

const LIMITS: CashoutLimits = {
  minimum: 2000,
  feePercent: 5,
  dailyLimit: 50000,
  monthlyLimit: 200000,
  maxPerDay: 2,
  autoApproveUnder: 0,
};

describe("computeCashoutNet", () => {
  it("computes 5% fee and rounds net down to whole naira", () => {
    // 10000 @ 5% = fee 500, net 9500
    expect(computeCashoutNet(10000, 5)).toEqual({ fee: 500, net: 9500 });
    // 3333 @ 5% = 166.65 fee → net floors to 3166 (never over-pay)
    const r = computeCashoutNet(3333, 5);
    expect(r.net).toBe(3166);
    expect(r.fee + r.net).toBe(3333);
  });

  it("handles zero and clamps absurd inputs", () => {
    expect(computeCashoutNet(0, 5)).toEqual({ fee: 0, net: 0 });
    expect(computeCashoutNet(1000, 999)).toEqual({ fee: 1000, net: 0 });
    expect(computeCashoutNet(-5, 5)).toEqual({ fee: 0, net: 0 });
  });
});

describe("validateAgainstLimits", () => {
  const base = {
    requestedAmount: 5000,
    availableCredits: 10000,
    blockedCredits: 0,
    todayCount: 0,
    todaySum: 0,
    monthSum: 0,
  };

  it("accepts a clean request", () => {
    expect(validateAgainstLimits(base, LIMITS)).toEqual({ ok: true });
  });

  it("rejects below minimum", () => {
    expect(
      validateAgainstLimits({ ...base, requestedAmount: 1000 }, LIMITS),
    ).toMatchObject({ ok: false });
  });

  it("rejects insufficient available", () => {
    expect(
      validateAgainstLimits({ ...base, availableCredits: 100 }, LIMITS),
    ).toMatchObject({ ok: false });
  });

  it("rejects when a hold already exists (one in-flight cashout)", () => {
    expect(
      validateAgainstLimits({ ...base, blockedCredits: 500 }, LIMITS),
    ).toMatchObject({ ok: false });
  });

  it("rejects over daily frequency and daily/monthly caps", () => {
    expect(
      validateAgainstLimits({ ...base, todayCount: 2 }, LIMITS),
    ).toMatchObject({ ok: false });
    expect(
      validateAgainstLimits({ ...base, todaySum: 48000 }, LIMITS),
    ).toMatchObject({ ok: false });
    expect(
      validateAgainstLimits({ ...base, monthSum: 198000 }, LIMITS),
    ).toMatchObject({ ok: false });
  });
});

describe("cashoutTransferRef", () => {
  it("is stable and bounded", () => {
    expect(cashoutTransferRef("abc")).toBe("ona_cash_abc");
    expect(cashoutTransferRef("abc")).toBe(cashoutTransferRef("abc"));
    expect(cashoutTransferRef("x".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});
