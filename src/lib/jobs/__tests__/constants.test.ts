import { describe, it, expect } from "vitest";
import {
  MIN_OFFER_AMOUNT_MAJOR,
  MAX_OFFER_AMOUNT_MAJOR,
  MAX_NEGOTIATION_OFFERS,
  NEGOTIATE_WINDOW_MS,
  PAYMENT_WINDOW_MS,
  MAX_PAYMENT_ATTEMPTS,
  BOOKED_COMPLETION_WINDOW_MS,
  COMPLETED_AUTO_RELEASE_WINDOW_MS,
  PRO_PAYOUT_PERCENT,
  PLATFORM_FEE_PERCENT,
  DISPUTABLE_STATUSES,
  TERMINAL_STATUSES,
  isBookedAutoCancelStatus,
  bookedPaymentStartMs,
  isBookedPastCompletionDeadline,
  paymentWindowsExpiredCount,
  getOpenPaymentSessionStartMs,
  paymentEndsAtIso,
  isAgreedPastPaymentDeadline,
  paymentAttemptsRemaining,
  completedAtMs,
  satisfiedReleaseEndsAtIso,
  isCompletedPastAutoReleaseDeadline,
  needsCustomerReleaseConfirm,
  isPayoutPendingSettlement,
  canOpenDisputeNow,
  isNegotiationTimerArmed,
  PAY_HISTORY,
} from "@/lib/jobs/constants";

describe("constants", () => {
  it("MIN_OFFER_AMOUNT_MAJOR is 120", () => {
    expect(MIN_OFFER_AMOUNT_MAJOR).toBe(120);
  });

  it("MAX_OFFER_AMOUNT_MAJOR is 999,999", () => {
    expect(MAX_OFFER_AMOUNT_MAJOR).toBe(999_999);
  });

  it("MAX_NEGOTIATION_OFFERS is 6", () => {
    expect(MAX_NEGOTIATION_OFFERS).toBe(6);
  });

  it("negotiation window is 20 minutes", () => {
    expect(NEGOTIATE_WINDOW_MS).toBe(20 * 60 * 1000);
  });

  it("payment window is 20 minutes", () => {
    expect(PAYMENT_WINDOW_MS).toBe(20 * 60 * 1000);
  });

  it("max payment attempts is 3", () => {
    expect(MAX_PAYMENT_ATTEMPTS).toBe(3);
  });

  it("completion window is 6 hours", () => {
    expect(BOOKED_COMPLETION_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("auto-release window is 6 hours", () => {
    expect(COMPLETED_AUTO_RELEASE_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("pro payout is 95% and platform fee is 5%", () => {
    expect(PRO_PAYOUT_PERCENT).toBe(95);
    expect(PLATFORM_FEE_PERCENT).toBe(5);
  });

  it("has 7 disputable statuses", () => {
    expect(DISPUTABLE_STATUSES).toHaveLength(7);
  });

  it("terminal statuses are released, refunded, cancelled, expired", () => {
    expect(TERMINAL_STATUSES).toEqual(["released", "refunded", "cancelled", "expired"]);
  });
});

describe("isBookedAutoCancelStatus", () => {
  it("returns true for paid_booked", () => {
    expect(isBookedAutoCancelStatus("paid_booked")).toBe(true);
  });

  it("returns true for en_route", () => {
    expect(isBookedAutoCancelStatus("en_route")).toBe(true);
  });

  it("returns true for in_progress", () => {
    expect(isBookedAutoCancelStatus("in_progress")).toBe(true);
  });

  it("returns false for negotiating", () => {
    expect(isBookedAutoCancelStatus("negotiating")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isBookedAutoCancelStatus(null)).toBe(false);
  });
});

describe("bookedPaymentStartMs", () => {
  it("returns paidAt timestamp when available", () => {
    const paidAt = "2026-07-28T12:00:00.000Z";
    const result = bookedPaymentStartMs({ paidAt });
    expect(result).toBe(new Date(paidAt).getTime());
  });

  it("returns null when no payment info", () => {
    expect(bookedPaymentStartMs({})).toBeNull();
  });

  it("finds paid_booked in statusHistory", () => {
    const at = "2026-07-28T12:00:00.000Z";
    const result = bookedPaymentStartMs({
      statusHistory: [{ status: "paid_booked", at }],
    });
    expect(result).toBe(new Date(at).getTime());
  });

  it("falls back to updatedAt for legacy paid_booked rows", () => {
    const updatedAt = "2026-07-28T12:00:00.000Z";
    const result = bookedPaymentStartMs({
      status: "paid_booked",
      updatedAt,
    });
    expect(result).toBe(new Date(updatedAt).getTime());
  });
});

describe("isBookedPastCompletionDeadline", () => {
  it("returns true when past 6h deadline", () => {
    const paidAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    expect(isBookedPastCompletionDeadline({ status: "paid_booked", paidAt })).toBe(true);
  });

  it("returns false when within 6h deadline", () => {
    const paidAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isBookedPastCompletionDeadline({ status: "paid_booked", paidAt })).toBe(false);
  });

  it("returns false for non-booked statuses", () => {
    expect(isBookedPastCompletionDeadline({ status: "negotiating" })).toBe(false);
  });
});

describe("paymentWindowsExpiredCount", () => {
  it("returns paymentAttemptCount when available", () => {
    expect(paymentWindowsExpiredCount({ paymentAttemptCount: 2 })).toBe(2);
  });

  it("caps at MAX_PAYMENT_ATTEMPTS", () => {
    expect(paymentWindowsExpiredCount({ paymentAttemptCount: 10 })).toBe(3);
  });

  it("counts window_expired from statusHistory", () => {
    const result = paymentWindowsExpiredCount({
      statusHistory: [
        { status: "agreed", at: "2026-01-01", by: PAY_HISTORY.WINDOW_EXPIRED },
        { status: "agreed", at: "2026-01-01", by: PAY_HISTORY.WINDOW_EXPIRED },
      ],
    });
    expect(result).toBe(2);
  });
});

describe("getOpenPaymentSessionStartMs", () => {
  it("returns null when status is not agreed", () => {
    expect(getOpenPaymentSessionStartMs({ status: "negotiating" })).toBeNull();
  });

  it("returns null when no session start", () => {
    expect(getOpenPaymentSessionStartMs({ status: "agreed" })).toBeNull();
  });

  it("returns session start when open", () => {
    const at = new Date().toISOString();
    const result = getOpenPaymentSessionStartMs({
      status: "agreed",
      statusHistory: [{ status: "agreed", at, by: PAY_HISTORY.SESSION_START }],
    });
    expect(result).toBe(new Date(at).getTime());
  });

  it("returns null when session was cancelled", () => {
    const result = getOpenPaymentSessionStartMs({
      status: "agreed",
      statusHistory: [
        { status: "agreed", at: "2026-01-01T12:00:00Z", by: PAY_HISTORY.SESSION_START },
        { status: "agreed", at: "2026-01-01T12:05:00Z", by: PAY_HISTORY.SESSION_CANCELLED },
      ],
    });
    expect(result).toBeNull();
  });
});

describe("paymentEndsAtIso", () => {
  it("returns null when no open session", () => {
    expect(paymentEndsAtIso({ status: "agreed" })).toBeNull();
  });

  it("returns cached paymentSessionEndsAt when valid", () => {
    const endsAt = new Date(Date.now() + 600_000).toISOString();
    const result = paymentEndsAtIso({
      status: "agreed",
      paymentSessionEndsAt: endsAt,
      statusHistory: [
        { status: "agreed", at: new Date().toISOString(), by: PAY_HISTORY.SESSION_START },
      ],
    });
    expect(result).toBe(endsAt);
  });

  it("computes endsAt from session start + window", () => {
    const start = new Date(Date.now() - 60_000).toISOString();
    const result = paymentEndsAtIso({
      status: "agreed",
      statusHistory: [
        { status: "agreed", at: start, by: PAY_HISTORY.SESSION_START },
      ],
    });
    expect(result).toBeTruthy();
    expect(new Date(result!).getTime()).toBeCloseTo(
      new Date(start).getTime() + PAYMENT_WINDOW_MS,
      -2
    );
  });
});

describe("isAgreedPastPaymentDeadline", () => {
  it("returns true when past from computed window", () => {
    const start = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    expect(
      isAgreedPastPaymentDeadline({
        status: "agreed",
        statusHistory: [{ status: "agreed", at: start, by: "payment_session_start" }],
      })
    ).toBe(true);
  });

  it("returns false when within payment window", () => {
    const endsAt = new Date(Date.now() + 600_000).toISOString();
    expect(isAgreedPastPaymentDeadline({ status: "agreed", paymentSessionEndsAt: endsAt })).toBe(false);
  });

  it("returns false when not agreed", () => {
    expect(isAgreedPastPaymentDeadline({ status: "negotiating" })).toBe(false);
  });
});

describe("paymentAttemptsRemaining", () => {
  it("returns 3 when no attempts", () => {
    expect(paymentAttemptsRemaining({})).toBe(3);
  });

  it("returns 1 after 2 expired windows", () => {
    expect(paymentAttemptsRemaining({ paymentAttemptCount: 2 })).toBe(1);
  });

  it("returns 0 at max attempts", () => {
    expect(paymentAttemptsRemaining({ paymentAttemptCount: 3 })).toBe(0);
  });
});

describe("completedAtMs", () => {
  it("returns completed timestamp from history", () => {
    const at = "2026-07-28T12:00:00.000Z";
    expect(completedAtMs({ statusHistory: [{ status: "completed", at }] })).toBe(new Date(at).getTime());
  });

  it("returns updatedAt fallback", () => {
    const updatedAt = "2026-07-28T12:00:00.000Z";
    expect(completedAtMs({ status: "completed", updatedAt })).toBe(new Date(updatedAt).getTime());
  });

  it("returns null when not completed", () => {
    expect(completedAtMs({ status: "negotiating" })).toBeNull();
  });
});

describe("satisfiedReleaseEndsAtIso", () => {
  it("returns null when not completed", () => {
    expect(satisfiedReleaseEndsAtIso({ status: "negotiating" })).toBeNull();
  });

  it("returns computed end time", () => {
    const at = new Date(Date.now() - 60_000).toISOString();
    const result = satisfiedReleaseEndsAtIso({
      status: "completed",
      statusHistory: [{ status: "completed", at }],
    });
    expect(result).toBeTruthy();
    expect(new Date(result!).getTime()).toBeCloseTo(
      new Date(at).getTime() + COMPLETED_AUTO_RELEASE_WINDOW_MS,
      -2
    );
  });
});

describe("isCompletedPastAutoReleaseDeadline", () => {
  it("returns true when past 6h and no dispute", () => {
    const updatedAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    expect(isCompletedPastAutoReleaseDeadline({ status: "completed", updatedAt })).toBe(true);
  });

  it("returns false when within 6h", () => {
    const updatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isCompletedPastAutoReleaseDeadline({ status: "completed", updatedAt })).toBe(false);
  });

  it("returns false when dispute is open", () => {
    const updatedAt = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    expect(
      isCompletedPastAutoReleaseDeadline({
        status: "completed",
        updatedAt,
        dispute: { status: "open" },
      })
    ).toBe(false);
  });

  it("returns false when not completed", () => {
    expect(isCompletedPastAutoReleaseDeadline({ status: "paid_booked" })).toBe(false);
  });
});

describe("needsCustomerReleaseConfirm", () => {
  it("returns true for completed with no satisfied/release info", () => {
    expect(needsCustomerReleaseConfirm({ id: "1", status: "completed" })).toBe(true);
  });

  it("returns false for released", () => {
    expect(needsCustomerReleaseConfirm({ id: "1", status: "released" })).toBe(false);
  });

  it("returns false when satisfiedAt set", () => {
    expect(needsCustomerReleaseConfirm({ id: "1", status: "completed", satisfiedAt: "2026-01-01" })).toBe(false);
  });

  it("returns false for terminal statuses", () => {
    expect(needsCustomerReleaseConfirm({ id: "1", status: "cancelled" })).toBe(false);
    expect(needsCustomerReleaseConfirm({ id: "1", status: "refunded" })).toBe(false);
    expect(needsCustomerReleaseConfirm({ id: "1", status: "expired" })).toBe(false);
  });

  it("returns false when escrow is settled", () => {
    expect(needsCustomerReleaseConfirm({ id: "1", status: "completed", escrowStatus: "released" })).toBe(false);
  });

  it("returns false for unsatisfied completed with pending settlement", () => {
    expect(needsCustomerReleaseConfirm({ id: "1", status: "completed", escrowStatus: "pending_settlement" })).toBe(false);
  });
});

describe("isPayoutPendingSettlement", () => {
  it("returns true for pending_settlement", () => {
    expect(isPayoutPendingSettlement({ escrowStatus: "pending_settlement" })).toBe(true);
  });

  it("returns true for release_pending", () => {
    expect(isPayoutPendingSettlement({ escrowStatus: "release_pending" })).toBe(true);
  });

  it("returns false when releasedAt is set", () => {
    expect(isPayoutPendingSettlement({ releasedAt: "2026-01-01", escrowStatus: "pending_settlement" })).toBe(false);
  });

  it("returns false when released", () => {
    expect(isPayoutPendingSettlement({ status: "released" })).toBe(false);
  });

  it("returns false when escrow is released", () => {
    expect(isPayoutPendingSettlement({ escrowStatus: "released" })).toBe(false);
  });

  it("returns false when escrow is refunded", () => {
    expect(isPayoutPendingSettlement({ escrowStatus: "refunded" })).toBe(false);
  });
});

describe("canOpenDisputeNow", () => {
  it("returns true for active job statuses", () => {
    expect(canOpenDisputeNow({ status: "paid_booked" })).toBe(true);
    expect(canOpenDisputeNow({ status: "in_progress" })).toBe(true);
    expect(canOpenDisputeNow({ status: "completed" })).toBe(true);
  });

  it("returns false when an open dispute exists", () => {
    expect(canOpenDisputeNow({ status: "paid_booked", dispute: { status: "open" } })).toBe(false);
  });

  it("returns true when dispute is resolved", () => {
    expect(canOpenDisputeNow({ status: "paid_booked", dispute: { status: "resolved" } })).toBe(true);
  });

  it("returns true for released within 48h of satisfiedAt", () => {
    const satisfiedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(canOpenDisputeNow({ status: "released", satisfiedAt })).toBe(true);
  });

  it("returns false for released past 48h", () => {
    const satisfiedAt = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
    expect(canOpenDisputeNow({ status: "released", satisfiedAt })).toBe(false);
  });

  it("returns false for negotiating", () => {
    expect(canOpenDisputeNow({ status: "negotiating" })).toBe(false);
  });

  it("returns false for cancelled/expired", () => {
    expect(canOpenDisputeNow({ status: "cancelled" })).toBe(false);
    expect(canOpenDisputeNow({ status: "expired" })).toBe(false);
  });
});

describe("isNegotiationTimerArmed", () => {
  it("returns false when negotiateEndsAt is missing", () => {
    expect(isNegotiationTimerArmed({})).toBe(false);
  });

  it("returns false when endsAt is a far-future sentinel", () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(isNegotiationTimerArmed({ negotiateEndsAt: farFuture })).toBe(false);
  });

  it("returns true when pro_can_fix in history", () => {
    const nearFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(
      isNegotiationTimerArmed({
        negotiateEndsAt: nearFuture,
        statusHistory: [{ by: "pro_can_fix", status: "negotiating" }],
      })
    ).toBe(true);
  });

  it("returns true when offers exist", () => {
    const nearFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(
      isNegotiationTimerArmed({
        negotiateEndsAt: nearFuture,
        offers: [{ id: "1" }],
      })
    ).toBe(true);
  });

  it("returns true when endsAt is within negotiation window", () => {
    const nearFuture = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(isNegotiationTimerArmed({ negotiateEndsAt: nearFuture })).toBe(true);
  });
});
