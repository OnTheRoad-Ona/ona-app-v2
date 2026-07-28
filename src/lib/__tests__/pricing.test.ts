import { describe, it, expect } from "vitest";
import {
  splitServiceChargeMinor,
  buildCustomerChargeMajor,
  PLATFORM_COMMISSION_PERCENT,
  PRO_NET_PAYOUT_PERCENT,
  VAT_PERCENT_NG,
  MAX_DISCOUNT_PERCENT,
} from "@/lib/pricing";

describe("pricing", () => {
  it("PLATFORM_COMMISSION_PERCENT is 5%", () => {
    expect(PLATFORM_COMMISSION_PERCENT).toBe(5);
  });

  it("VAT_PERCENT_NG is 7.5%", () => {
    expect(VAT_PERCENT_NG).toBe(7.5);
  });

  it("PRO_NET_PAYOUT_PERCENT is 87.5%", () => {
    expect(PRO_NET_PAYOUT_PERCENT).toBe(87.5);
  });

  it("MAX_DISCOUNT_PERCENT is 50%", () => {
    expect(MAX_DISCOUNT_PERCENT).toBe(50);
  });
});

describe("splitServiceChargeMinor", () => {
  it("splits 5000000 kobo (₦50,000) correctly", () => {
    const result = splitServiceChargeMinor(5_000_000);
    expect(result.totalMinor).toBe(5_000_000);
    expect(result.platformFeeMinor).toBe(250_000);
    expect(result.vatMinor).toBe(375_000);
    expect(result.proPayoutMinor).toBe(4_375_000);
    expect(result.proPayoutMinor + result.platformFeeMinor + result.vatMinor).toBe(
      result.totalMinor
    );
  });

  it("splits 500000 kobo (₦5,000) correctly", () => {
    const result = splitServiceChargeMinor(500_000);
    expect(result.platformFeeMinor).toBe(25_000);
    expect(result.vatMinor).toBe(37_500);
    expect(result.proPayoutMinor).toBe(437_500);
    expect(result.proPayoutMinor + result.platformFeeMinor + result.vatMinor).toBe(
      result.totalMinor
    );
  });

  it("handles minimum amount (₦120 = 12000 kobo)", () => {
    const result = splitServiceChargeMinor(12_000);
    expect(result.proPayoutMinor).toBeGreaterThanOrEqual(10_500);
    expect(result.totalMinor).toBe(12_000);
  });

  it("handles zero", () => {
    const result = splitServiceChargeMinor(0);
    expect(result.totalMinor).toBe(0);
    expect(result.proPayoutMinor).toBe(0);
    expect(result.platformFeeMinor).toBe(0);
    expect(result.vatMinor).toBe(0);
  });

  it("handles negative values", () => {
    const result = splitServiceChargeMinor(-1000);
    expect(result.totalMinor).toBe(0);
  });

  it("components always sum to total", () => {
    const testAmounts = [100, 12000, 50000, 500000, 99999999, 1234567];
    for (const amount of testAmounts) {
      const result = splitServiceChargeMinor(amount);
      expect(result.proPayoutMinor + result.platformFeeMinor + result.vatMinor).toBe(
        result.totalMinor
      );
    }
  });
});

describe("buildCustomerChargeMajor", () => {
  it("builds charge for ₦50,000 labour", () => {
    const result = buildCustomerChargeMajor(50_000);
    expect(result.labourMajor).toBe(50_000);
    expect(result.totalMajor).toBe(50_000);
    expect(result.platformFeeMajor).toBe(2_500);
    expect(result.vatMajor).toBe(3_750);
    expect(result.proPayoutMajor).toBe(43_750);
  });

  it("builds charge for ₦5,000 labour", () => {
    const result = buildCustomerChargeMajor(5_000);
    expect(result.labourMajor).toBe(5_000);
    expect(result.platformFeeMajor).toBe(250);
    expect(result.vatMajor).toBe(375);
    expect(result.proPayoutMajor).toBe(4_375);
  });

  it("handles zero labour", () => {
    const result = buildCustomerChargeMajor(0);
    expect(result.labourMajor).toBe(0);
    expect(result.totalMajor).toBe(0);
    expect(result.proPayoutMajor).toBe(0);
  });
});
