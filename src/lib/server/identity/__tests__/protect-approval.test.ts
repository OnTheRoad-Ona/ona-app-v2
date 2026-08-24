import { describe, expect, it } from "vitest";
import {
  isMotoristT2ApprovedLocked,
  isProT2ApprovedLocked,
  protectMotoristClientPatch,
  protectProClientPatch,
} from "@/lib/server/identity/protect-approval";

describe("protect-approval", () => {
  it("locks pro T2 when gov_id_review_status is approved", () => {
    expect(isProT2ApprovedLocked({ gov_id_review_status: "approved" })).toBe(
      true,
    );
  });

  it("does not demote approved pro on gov_id re-submit patch", () => {
    const { patch, locked } = protectProClientPatch(
      {
        status: "approved",
        gov_id_review_status: "approved",
        verified: true,
        nin_verified: true,
        bvn_verified: true,
        tier2_approved_at: "2026-01-01T00:00:00Z",
      },
      {
        status: "pending",
        gov_id_review_status: "submitted",
        verified: false,
        nin_verified: false,
        bvn_verified: false,
        gov_id_number: "12345",
        pipeline_status: "pending_verification",
      },
    );
    expect(locked).toBe(true);
    expect(patch.gov_id_review_status).toBe("approved");
    expect(patch.status).toBe("approved");
    expect(patch.verified).toBe(true);
    expect(patch.gov_id_number).toBe("12345");
    expect(patch.pipeline_status).toBeUndefined();
  });

  it("allows skill docs under_review without demoting account", () => {
    const { patch, locked } = protectProClientPatch(
      {
        status: "approved",
        gov_id_review_status: "approved",
        verified: true,
      },
      {
        status: "pending",
        docs_status: "under_review",
        pipeline_status: "pending_document_review",
      },
    );
    expect(locked).toBe(true);
    expect(patch.status).toBe("approved");
    expect(patch.docs_status).toBe("under_review");
  });

  it("allows full demotion when care opened needs_resubmit", () => {
    const { patch, locked } = protectProClientPatch(
      {
        status: "pending",
        gov_id_review_status: "none",
        pipeline_status: "needs_resubmit",
        rejection_reason: "Care: please re-submit",
      },
      {
        status: "pending",
        gov_id_review_status: "submitted",
        verified: false,
      },
    );
    expect(locked).toBe(false);
    expect(patch.gov_id_review_status).toBe("submitted");
  });

  it("locks motorist T2 and preserves approved on re-submit", () => {
    expect(
      isMotoristT2ApprovedLocked({
        identity_review_status: "approved",
        nin_verified: true,
        identity_verified_at: "2026-01-01T00:00:00Z",
      }),
    ).toBe(true);

    const { patch, locked } = protectMotoristClientPatch(
      {
        identity_review_status: "approved",
        nin_verified: true,
        bvn_verified: true,
        identity_verified_at: "2026-01-01T00:00:00Z",
      },
      {
        identity_review_status: "submitted",
        nin_verified: false,
        bvn_verified: false,
        identity_verified_at: null,
        gov_id_number: "ABC",
      },
    );
    expect(locked).toBe(true);
    expect(patch.identity_review_status).toBe("approved");
    expect(patch.nin_verified).toBe(true);
    expect(patch.identity_verified_at).toBe("2026-01-01T00:00:00Z");
    expect(patch.gov_id_number).toBe("ABC");
  });

  it("allows motorist re-submit after reject", () => {
    const { locked, patch } = protectMotoristClientPatch(
      { identity_review_status: "rejected", nin_verified: false },
      {
        identity_review_status: "submitted",
        nin_verified: false,
      },
    );
    expect(locked).toBe(false);
    expect(patch.identity_review_status).toBe("submitted");
  });
});
