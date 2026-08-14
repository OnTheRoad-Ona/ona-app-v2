import { describe, it, expect, beforeEach } from "vitest";
import {
  createEscrowPayment,
  getEscrowByRef,
  getEscrowByRequest,
  preferPaymentRow,
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

describe("preferPaymentRow (one row per request)", () => {
  function make(id: string, requestId: string, escrowStatus: string, createdAt = "2026-08-01T00:00:00.000Z"): EscrowPayment {
    return {
      id,
      requestId,
      motoristId: "m-1",
      repairProId: "pro-1",
      amountMinor: 100_000,
      baseAmountMinor: 100_000,
      discountPercent: 0,
      platformFeeMinor: 5_000,
      proPayoutMinor: 87_500,
      currency: "NGN",
      status: escrowStatus,
      escrowStatus: escrowStatus as EscrowPayment["escrowStatus"],
      provider: "flutterwave",
      providerRef: null,
      providerChannel: null,
      serviceType: null,
      labourOnly: false,
      paidAt: null,
      releasedAt: null,
      refundedAt: null,
      motoristCompletedAt: null,
      proCompletedAt: null,
      meta: {},
      createdAt,
      updatedAt: createdAt,
      motoristName: null,
      motoristVehicle: null,
      motoristPhoto: null,
      repairProName: null,
      repairProPhoto: null,
      serviceTitle: null,
      agreedMajor: null,
      nextRetryAt: null,
      version: null,
    } as EscrowPayment;
  }

  it("collapses multiple attempt rows for one request to a single row", () => {
    const rows = preferPaymentRow([
      make("a", "req-1", "pending_payment"),
      make("b", "req-1", "pending_payment"),
      make("c", "req-1", "pending_payment"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("a");
  });

  it("prefers released over pending_payment for the same request", () => {
    const rows = preferPaymentRow([
      make("a", "req-1", "pending_payment"),
      make("b", "req-1", "released"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("b");
  });

  it("prefers pending_settlement over held", () => {
    const rows = preferPaymentRow([
      make("a", "req-1", "held"),
      make("b", "req-1", "pending_settlement"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("b");
  });

  it("keeps distinct requests as separate rows", () => {
    const rows = preferPaymentRow([
      make("a", "req-1", "released"),
      make("b", "req-2", "pending_settlement"),
    ]);
    expect(rows).toHaveLength(2);
  });
});
