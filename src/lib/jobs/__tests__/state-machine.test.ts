import { describe, it, expect } from "vitest";
import {
  canTransition,
  nextStatus,
  assertTransition,
  canPlaceOffer,
  validateOfferAmount,
  negotiationUiStatus,
  actorMay,
  type TransitionEvent,
} from "@/lib/jobs/state-machine";
import type { JobFlowStatus } from "@/lib/jobs/types";

describe("state-machine", () => {
  describe("canTransition", () => {
    it("allows ACCEPT_OFFER from negotiating", () => {
      expect(canTransition("negotiating", { type: "ACCEPT_OFFER", by: "motorist" })).toBe(true);
    });

    it("allows EXPIRE_NEGOTIATION from negotiating", () => {
      expect(canTransition("negotiating", { type: "EXPIRE_NEGOTIATION" })).toBe(true);
    });

    it("allows CANCEL from negotiating", () => {
      expect(canTransition("negotiating", { type: "CANCEL", by: "motorist" })).toBe(true);
    });

    it("allows PAYMENT_SUCCESS from agreed", () => {
      expect(canTransition("agreed", { type: "PAYMENT_SUCCESS" })).toBe(true);
    });

    it("allows EXPIRE_UNPAID_BOOK from agreed", () => {
      expect(canTransition("agreed", { type: "EXPIRE_UNPAID_BOOK" })).toBe(true);
    });

    it("rejects EXPIRE_UNPAID_BOOK from paid_booked", () => {
      expect(canTransition("paid_booked", { type: "EXPIRE_UNPAID_BOOK" })).toBe(
        false
      );
    });

    it("rejects PAYMENT_SUCCESS from negotiating", () => {
      expect(canTransition("negotiating", { type: "PAYMENT_SUCCESS" })).toBe(false);
    });

    it("allows START_TRIP from paid_booked", () => {
      expect(canTransition("paid_booked", { type: "START_TRIP" })).toBe(true);
    });

    it("allows OPEN_DISPUTE from disputable statuses", () => {
      const disputable = ["paid_booked", "en_route", "arrived", "in_progress", "completed", "satisfied", "released"];
      for (const status of disputable) {
        expect(canTransition(status as JobFlowStatus, { type: "OPEN_DISPUTE", by: "motorist" })).toBe(true);
      }
    });

    it("rejects OPEN_DISPUTE from negotiating", () => {
      expect(canTransition("negotiating", { type: "OPEN_DISPUTE", by: "motorist" })).toBe(false);
    });

    it("allows REFUND from paid_booked", () => {
      expect(canTransition("paid_booked", { type: "REFUND" })).toBe(true);
    });

    it("allows REFUND from disputed", () => {
      expect(canTransition("disputed", { type: "REFUND" })).toBe(true);
    });

    it("rejects REFUND from negotiating", () => {
      expect(canTransition("negotiating", { type: "REFUND" })).toBe(false);
    });

    it("terminal statuses have no transitions", () => {
      for (const status of ["cancelled", "expired", "refunded"] as const) {
        expect(canTransition(status, { type: "CANCEL", by: "system" })).toBe(false);
        expect(canTransition(status, { type: "PAYMENT_SUCCESS" })).toBe(false);
      }
    });

    it("allows RESOLVE_DISPUTE from disputed", () => {
      expect(canTransition("disputed", { type: "RESOLVE_DISPUTE", outcome: "release" })).toBe(true);
    });

    it("allows OPEN_APPEAL from disputed", () => {
      expect(canTransition("disputed", { type: "OPEN_APPEAL", by: "motorist" })).toBe(true);
    });

    it("allows RESOLVE_APPEAL from under_appeal", () => {
      expect(canTransition("under_appeal", { type: "RESOLVE_APPEAL", outcome: "release" })).toBe(true);
    });
  });

  describe("SSPE dispatch transitions", () => {
    it("OPEN moves waiting_for_selected → selected_review", () => {
      expect(canTransition("waiting_for_selected", { type: "OPEN", by: "repair_pro" })).toBe(true);
      expect(nextStatus("waiting_for_selected", { type: "OPEN", by: "repair_pro" })).toBe("selected_review");
    });

    it("OPEN moves waiting_for_pro → reserved", () => {
      expect(nextStatus("waiting_for_pro", { type: "OPEN", by: "repair_pro" })).toBe("reserved");
    });

    it("CONFIRM moves selected_review → negotiating", () => {
      expect(nextStatus("selected_review", { type: "CONFIRM", by: "repair_pro" })).toBe("negotiating");
    });

    it("CONFIRM moves reserved → negotiating", () => {
      expect(nextStatus("reserved", { type: "CONFIRM", by: "repair_pro" })).toBe("negotiating");
    });

    it("LATER / DECLINE / PAIRING_TIMEOUT move to sequential_pairing", () => {
      expect(nextStatus("waiting_for_selected", { type: "LATER", by: "repair_pro" })).toBe("sequential_pairing");
      expect(nextStatus("waiting_for_pro", { type: "DECLINE", by: "repair_pro" })).toBe("sequential_pairing");
      expect(nextStatus("waiting_for_pro", { type: "PAIRING_TIMEOUT" })).toBe("sequential_pairing");
      expect(nextStatus("selected_review", { type: "PAIRING_TIMEOUT" })).toBe("sequential_pairing");
    });

    it("DISPATCH moves sequential_pairing → waiting_for_pro", () => {
      expect(nextStatus("sequential_pairing", { type: "DISPATCH" })).toBe("waiting_for_pro");
    });

    it("PAIRING_TIMEOUT from sequential_pairing → expired (exhausted)", () => {
      expect(nextStatus("sequential_pairing", { type: "PAIRING_TIMEOUT" })).toBe("expired");
    });

    it("CANCEL allowed from all pairing states", () => {
      for (const s of ["waiting_for_selected", "selected_review", "sequential_pairing", "waiting_for_pro", "reserved"] as const) {
        expect(canTransition(s, { type: "CANCEL", by: "motorist" })).toBe(true);
        expect(nextStatus(s, { type: "CANCEL", by: "motorist" })).toBe("cancelled");
      }
    });

    it("illegal: DISPATCH not allowed from waiting_for_pro", () => {
      expect(canTransition("waiting_for_pro", { type: "DISPATCH" })).toBe(false);
    });

    it("illegal: OPEN not allowed from negotiating", () => {
      expect(canTransition("negotiating", { type: "OPEN", by: "repair_pro" })).toBe(false);
    });
  });

  describe("nextStatus", () => {
    it("returns agreed after ACCEPT_OFFER", () => {
      expect(nextStatus("negotiating", { type: "ACCEPT_OFFER", by: "motorist" })).toBe("agreed");
    });

    it("returns paid_booked after PAYMENT_SUCCESS", () => {
      expect(nextStatus("agreed", { type: "PAYMENT_SUCCESS" })).toBe("paid_booked");
    });

    it("returns en_route after START_TRIP", () => {
      expect(nextStatus("paid_booked", { type: "START_TRIP" })).toBe("en_route");
    });

    it("returns arrived after MARK_ARRIVED", () => {
      expect(nextStatus("en_route", { type: "MARK_ARRIVED" })).toBe("arrived");
    });

    it("returns in_progress after START_WORK", () => {
      expect(nextStatus("arrived", { type: "START_WORK" })).toBe("in_progress");
    });

    it("returns completed after MARK_COMPLETED", () => {
      expect(nextStatus("in_progress", { type: "MARK_COMPLETED" })).toBe("completed");
    });

    it("returns satisfied after SATISFIED", () => {
      expect(nextStatus("completed", { type: "SATISFIED" })).toBe("satisfied");
    });

    it("returns released after RELEASE from satisfied", () => {
      expect(nextStatus("satisfied", { type: "RELEASE" })).toBe("released");
    });

    it("returns expired after EXPIRE_NEGOTIATION", () => {
      expect(nextStatus("negotiating", { type: "EXPIRE_NEGOTIATION" })).toBe("expired");
    });

    it("returns expired after EXPIRE_UNPAID_BOOK from agreed", () => {
      expect(nextStatus("agreed", { type: "EXPIRE_UNPAID_BOOK" })).toBe("expired");
    });

    it("returns cancelled after CANCEL from agreed", () => {
      expect(nextStatus("agreed", { type: "CANCEL", by: "motorist" })).toBe("cancelled");
    });

    it("returns cancelled after CANCEL from paid_booked (refund path)", () => {
      expect(nextStatus("paid_booked", { type: "CANCEL", by: "system" })).toBe("cancelled");
    });

    it("returns disputed after OPEN_DISPUTE", () => {
      expect(nextStatus("completed", { type: "OPEN_DISPUTE", by: "motorist" })).toBe("disputed");
    });

    it("returns under_appeal after OPEN_APPEAL", () => {
      expect(nextStatus("disputed", { type: "OPEN_APPEAL", by: "repair_pro" })).toBe("under_appeal");
    });

    it("returns refunded after RESOLVE_DISPUTE with refund outcome", () => {
      expect(nextStatus("disputed", { type: "RESOLVE_DISPUTE", outcome: "refund" })).toBe("refunded");
    });

    it("returns released after RESOLVE_DISPUTE with release outcome", () => {
      expect(nextStatus("disputed", { type: "RESOLVE_DISPUTE", outcome: "release" })).toBe("released");
    });

    it("returns released after RESOLVE_DISPUTE with split outcome", () => {
      expect(nextStatus("disputed", { type: "RESOLVE_DISPUTE", outcome: "split" })).toBe("released");
    });

    it("returns null for illegal transitions", () => {
      expect(nextStatus("cancelled", { type: "PAYMENT_SUCCESS" })).toBeNull();
      expect(nextStatus("expired", { type: "START_TRIP" })).toBeNull();
      expect(nextStatus("released", { type: "MARK_COMPLETED" })).toBeNull();
    });
  });

  describe("assertTransition", () => {
    it("returns the next status for valid transitions", () => {
      expect(assertTransition("negotiating", { type: "ACCEPT_OFFER", by: "motorist" })).toBe("agreed");
    });

    it("throws for illegal transitions", () => {
      expect(() => assertTransition("released", { type: "MARK_COMPLETED" })).toThrow("Illegal transition");
    });
  });

  describe("canPlaceOffer", () => {
    const base = {
      status: "negotiating" as const,
      offerCount: 0,
      side: "repair_pro" as const,
      negotiateEndsAt: new Date(Date.now() + 600_000).toISOString(),
      now: Date.now(),
      timerArmed: true,
    };

    it("allows first offer from repair_pro", () => {
      expect(canPlaceOffer(base)).toEqual({ ok: true });
    });

    it("rejects first offer from motorist", () => {
      expect(canPlaceOffer({ ...base, side: "motorist" })).toEqual({
        ok: false,
        reason: "Repair Pro must set the labour price first.",
      });
    });

    it("rejects offers when status is not negotiating", () => {
      expect(canPlaceOffer({ ...base, status: "agreed" })).toEqual({
        ok: false,
        reason: "Negotiation is closed.",
      });
    });

    it("rejects offers when timer expired", () => {
      expect(
        canPlaceOffer({
          ...base,
          negotiateEndsAt: new Date(Date.now() - 60_000).toISOString(),
        })
      ).toEqual({
        ok: false,
        reason: "Negotiation timer expired.",
      });
    });

    it("rejects offers at max count", () => {
      expect(canPlaceOffer({ ...base, offerCount: 6 })).toEqual({
        ok: false,
        reason: "Maximum of 6 offers reached.",
      });
    });

    it("allows motorist counter-offer after pro's first offer", () => {
      expect(canPlaceOffer({ ...base, offerCount: 1, side: "motorist" })).toEqual({ ok: true });
    });

    it("does not enforce expiry when timerArmed is false", () => {
      expect(
        canPlaceOffer({
          ...base,
          negotiateEndsAt: new Date(Date.now() - 60_000).toISOString(),
          timerArmed: false,
        })
      ).toEqual({ ok: true });
    });
  });

  describe("validateOfferAmount", () => {
    it("accepts valid pro offer", () => {
      expect(validateOfferAmount({ side: "repair_pro", amountMajor: 5000, proBaseMajor: null, lastProOfferMajor: null })).toEqual({ ok: true });
    });

    it("rejects amount below minimum", () => {
      expect(validateOfferAmount({ side: "repair_pro", amountMajor: 50, proBaseMajor: null, lastProOfferMajor: null })).toEqual({
        ok: false,
        reason: expect.stringContaining("Minimum"),
      });
    });

    it("rejects amount above maximum (6 digits)", () => {
      expect(validateOfferAmount({ side: "repair_pro", amountMajor: 1_000_000, proBaseMajor: null, lastProOfferMajor: null })).toEqual({
        ok: false,
        reason: expect.stringContaining("6 digits"),
      });
    });

    it("rejects non-finite amount", () => {
      expect(validateOfferAmount({ side: "repair_pro", amountMajor: NaN, proBaseMajor: null, lastProOfferMajor: null })).toEqual({
        ok: false,
        reason: "Enter a valid labour price.",
      });
    });

    it("rejects motorist counter below 50% of pro base", () => {
      expect(
        validateOfferAmount({ side: "motorist", amountMajor: 2000, proBaseMajor: 5000, lastProOfferMajor: 5000 })
      ).toEqual({
        ok: false,
        reason: expect.stringContaining("50%"),
      });
    });

    it("accepts motorist counter at exactly 50% of pro base", () => {
      expect(
        validateOfferAmount({ side: "motorist", amountMajor: 2500, proBaseMajor: 5000, lastProOfferMajor: 5000 })
      ).toEqual({ ok: true });
    });

    it("returns waiting message when pro base is null for motorist", () => {
      expect(
        validateOfferAmount({ side: "motorist", amountMajor: 5000, proBaseMajor: null, lastProOfferMajor: null })
      ).toEqual({
        ok: false,
        reason: "Wait for the Repair Pro to set a price.",
      });
    });
  });

  describe("negotiationUiStatus", () => {
    it("returns expired when status is expired", () => {
      expect(negotiationUiStatus({ status: "expired", offerCount: 0, negotiateEndsAt: "" })).toBe("expired");
    });

    it("returns agreed when status is agreed", () => {
      expect(negotiationUiStatus({ status: "agreed", offerCount: 2, negotiateEndsAt: "" })).toBe("agreed");
    });

    it("returns waiting when no offers placed", () => {
      expect(negotiationUiStatus({ status: "negotiating", offerCount: 0, negotiateEndsAt: new Date(Date.now() + 600_000).toISOString() })).toBe("waiting");
    });

    it("returns countered when lastSide is set", () => {
      expect(
        negotiationUiStatus({
          status: "negotiating",
          offerCount: 2,
          lastSide: "motorist",
          negotiateEndsAt: new Date(Date.now() + 600_000).toISOString(),
        })
      ).toBe("countered");
    });

    it("returns expired when past deadline while negotiating", () => {
      expect(
        negotiationUiStatus({
          status: "negotiating",
          offerCount: 1,
          negotiateEndsAt: new Date(Date.now() - 60_000).toISOString(),
        })
      ).toBe("expired");
    });
  });

  describe("actorMay", () => {
    const repairProEvents: TransitionEvent["type"][] = ["START_TRIP", "MARK_ARRIVED", "START_WORK", "MARK_COMPLETED", "START_NEGOTIATION"];

    for (const event of repairProEvents) {
      it(`allows repair_pro to ${event}`, () => {
        expect(actorMay(event, "repair_pro")).toBe(true);
      });

      it(`denies motorist to ${event}`, () => {
        expect(actorMay(event, "motorist")).toBe(false);
      });
    }

    it("allows motorist to SATISFIED", () => {
      expect(actorMay("SATISFIED", "motorist")).toBe(true);
    });

    it("denies repair_pro to SATISFIED", () => {
      expect(actorMay("SATISFIED", "repair_pro")).toBe(false);
    });

    it("allows admin to RESOLVE_DISPUTE", () => {
      expect(actorMay("RESOLVE_DISPUTE", "admin")).toBe(true);
    });

    it("denies motorist to RESOLVE_DISPUTE", () => {
      expect(actorMay("RESOLVE_DISPUTE", "motorist")).toBe(false);
    });

    it("allows motorist or repair_pro to OPEN_DISPUTE", () => {
      expect(actorMay("OPEN_DISPUTE", "motorist")).toBe(true);
      expect(actorMay("OPEN_DISPUTE", "repair_pro")).toBe(true);
    });

    it("allows system to EXPIRE_NEGOTIATION", () => {
      expect(actorMay("EXPIRE_NEGOTIATION", "system")).toBe(true);
    });

    it("allows only system to EXPIRE_UNPAID_BOOK", () => {
      expect(actorMay("EXPIRE_UNPAID_BOOK", "system")).toBe(true);
      expect(actorMay("EXPIRE_UNPAID_BOOK", "motorist")).toBe(false);
      expect(actorMay("EXPIRE_UNPAID_BOOK", "repair_pro")).toBe(false);
    });

    it("allows repair_pro to OPEN/CONFIRM/LATER/DECLINE", () => {
      for (const e of ["OPEN", "CONFIRM", "LATER", "DECLINE"] as const) {
        expect(actorMay(e, "repair_pro")).toBe(true);
        expect(actorMay(e, "motorist")).toBe(false);
      }
    });

    it("allows only system to PAIRING_TIMEOUT/DISPATCH", () => {
      for (const e of ["PAIRING_TIMEOUT", "DISPATCH"] as const) {
        expect(actorMay(e, "system")).toBe(true);
        expect(actorMay(e, "repair_pro")).toBe(false);
        expect(actorMay(e, "motorist")).toBe(false);
      }
    });

    it("allows admin to REFUND", () => {
      expect(actorMay("REFUND", "admin")).toBe(true);
    });

    it("denies motorist to REFUND", () => {
      expect(actorMay("REFUND", "motorist")).toBe(false);
    });
  });
});
