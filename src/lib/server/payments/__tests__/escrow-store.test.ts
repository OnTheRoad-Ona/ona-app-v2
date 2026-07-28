import { describe, it, expect, beforeEach } from "vitest";
import {
  createEscrowPayment,
  getEscrowByRef,
  getEscrowByRequest,
  type EscrowPayment,
} from "@/lib/server/payments/escrow-store";

describe("escrow-store (memory fallback)", () => {
  const sampleInput = {
    requestId: "req-123",
    motoristId: "motorist-1",
    repairProId: "pro-1",
    amountMinor: 500_000,
    baseAmountMinor: 500_000,
    discountPercent: 0,
    platformFeeMinor: 25_000,
    proPayoutMinor: 437_500,
    currency: "NGN" as const,
    provider: "flutterwave",
    providerRef: "FLW-REF-001",
    serviceType: "mechanic",
    meta: { jobId: "job-1" },
  };

  it("creates an escrow payment", async () => {
    const payment = await createEscrowPayment(sampleInput);
    expect(payment.id).toBeTruthy();
    expect(payment.requestId).toBe("req-123");
    expect(payment.motoristId).toBe("motorist-1");
    expect(payment.repairProId).toBe("pro-1");
    expect(payment.amountMinor).toBe(500_000);
    expect(payment.escrowStatus).toBe("pending_payment");
    expect(payment.status).toBe("pending");
    expect(payment.provider).toBe("flutterwave");
    expect(payment.providerRef).toBe("FLW-REF-001");
  });

  it("looks up by provider ref", async () => {
    await createEscrowPayment(sampleInput);
    const found = await getEscrowByRef("FLW-REF-001");
    expect(found).not.toBeNull();
    expect(found!.requestId).toBe("req-123");
  });

  it("looks up by request ID", async () => {
    await createEscrowPayment(sampleInput);
    const found = await getEscrowByRequest("req-123");
    expect(found).not.toBeNull();
    expect(found!.motoristId).toBe("motorist-1");
  });

  it("returns null for unknown ref", async () => {
    const found = await getEscrowByRef("NONEXISTENT");
    expect(found).toBeNull();
  });

  it("returns null for empty ref", async () => {
    const found = await getEscrowByRef("");
    expect(found).toBeNull();
  });
});
