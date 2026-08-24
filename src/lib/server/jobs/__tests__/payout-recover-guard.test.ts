import { describe, it, expect } from "vitest";
import { canRecoverReleaseFromJob } from "@/lib/server/jobs/job-store";

describe("canRecoverReleaseFromJob payout must wait for customer release", () => {
  it("never recovers a held escrow (paid_booked trip in progress)", () => {
    expect(
      canRecoverReleaseFromJob({ status: "paid_booked", escrowStatus: "held" }),
    ).toBe(false);
    expect(
      canRecoverReleaseFromJob({ status: "en_route", escrowStatus: "held" }),
    ).toBe(false);
    expect(
      canRecoverReleaseFromJob({ status: "in_progress", escrowStatus: "held" }),
    ).toBe(false);
  });

  it("never recovers a plain completed job awaiting customer confirm", () => {
    expect(
      canRecoverReleaseFromJob({ status: "completed", escrowStatus: "held" }),
    ).toBe(false);
  });

  it("recovers once the customer actually released (satisfied)", () => {
    expect(
      canRecoverReleaseFromJob({ status: "satisfied", escrowStatus: "held" }),
    ).toBe(true);
  });

  it("recovers when escrow is explicitly release-pending", () => {
    expect(
      canRecoverReleaseFromJob({
        status: "completed",
        escrowStatus: "release_pending",
      }),
    ).toBe(true);
    expect(
      canRecoverReleaseFromJob({
        status: "completed",
        escrowStatus: "pending_settlement",
      }),
    ).toBe(true);
  });

  it("never recovers an already-released job", () => {
    expect(
      canRecoverReleaseFromJob({
        status: "released",
        releasedAt: "2026-08-07T00:00:00.000Z",
        escrowStatus: "released",
      }),
    ).toBe(false);
    expect(
      canRecoverReleaseFromJob({
        status: "satisfied",
        releasedAt: "2026-08-07T00:00:00.000Z",
        escrowStatus: "held",
      }),
    ).toBe(false);
  });
});
