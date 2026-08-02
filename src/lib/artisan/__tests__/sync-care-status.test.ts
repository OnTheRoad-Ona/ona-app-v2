import { describe, it, expect } from "vitest";
import {
  applyCareServerToLocalDraft,
  isServerT2Approved,
  resolveGovIdReviewFromServer,
  type CareMotoristSnapshot,
  type CareProSnapshot,
} from "@/lib/artisan/sync-care-status";
import type { ArtisanVerificationProfile } from "@/lib/artisan/types";

function draft(
  overrides: Partial<ArtisanVerificationProfile> = {}
): ArtisanVerificationProfile {
  return {
    userId: "user-1",
    fullName: "Test Pro",
    phone: "+234801",
    status: "pending_review",
    tiers: {
      tier1_phone: true,
      tier2_govId: false,
      tier2_nin: false,
      tier3_liveness: false,
      tier4_skillProof: false,
    },
    trade: { service: "mechanic" },
    yearsExperience: 3,
    serviceArea: { states: [], cities: [], lgas: [] },
    toolsOwned: [],
    guarantor: { fullName: "", phone: "" },
    portfolio: [],
    govIdReviewStatus: "submitted",
    isNewArtisan: true,
    successfulJobsCount: 0,
    visibilityTier: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("isServerT2Approved", () => {
  it("approves from pro.gov_id_review_status", () => {
    expect(
      isServerT2Approved({ gov_id_review_status: "approved" }, null)
    ).toBe(true);
  });

  it("approves from dual motorist identity", () => {
    expect(
      isServerT2Approved(null, { identity_review_status: "approved" })
    ).toBe(true);
  });

  it("approves from verified flag when status column missing", () => {
    expect(isServerT2Approved({ verified: true }, null)).toBe(true);
    expect(isServerT2Approved({ nin_verified: true }, null)).toBe(true);
  });

  it("rejects plain submitted", () => {
    expect(
      isServerT2Approved({ gov_id_review_status: "submitted" }, null)
    ).toBe(false);
  });
});

describe("resolveGovIdReviewFromServer", () => {
  it("server approved overwrites local submitted (the bug we fixed forever)", () => {
    expect(
      resolveGovIdReviewFromServer(
        { gov_id_review_status: "approved" },
        null,
        "submitted"
      )
    ).toBe("approved");
  });

  it("dual customer approved overwrites local submitted", () => {
    expect(
      resolveGovIdReviewFromServer(
        { gov_id_review_status: "submitted" },
        { identity_review_status: "approved" },
        "submitted"
      )
    ).toBe("approved");
  });

  it("keeps submitted when server still submitted", () => {
    expect(
      resolveGovIdReviewFromServer(
        { gov_id_review_status: "submitted" },
        null,
        "submitted"
      )
    ).toBe("submitted");
  });
});

describe("applyCareServerToLocalDraft", () => {
  it("flips local submitted → approved when Care approves pro ID", () => {
    const local = draft({ govIdReviewStatus: "submitted" });
    const pro: CareProSnapshot = {
      gov_id_review_status: "approved",
      verified: true,
      nin_verified: true,
      status: "approved",
      visibility_tier: 2,
      tier2_approved_at: "2026-08-02T12:00:00.000Z",
    };
    const result = applyCareServerToLocalDraft(local, {
      pro,
      motorist: null,
    });

    expect(result.changed).toBe(true);
    expect(result.t2Approved).toBe(true);
    expect(result.profile.govIdReviewStatus).toBe("approved");
    expect(result.profile.tiers.tier2_govId).toBe(true);
    expect(result.profile.govIdReviewStatus).not.toBe("submitted");
    expect(result.userMessage).toMatch(/approved/i);
  });

  it("flips local submitted → approved when dual Care approves customer only", () => {
    const local = draft({
      govIdReviewStatus: "submitted",
      status: "pending_review",
    });
    const motorist: CareMotoristSnapshot = {
      identity_review_status: "approved",
      identity_verified_at: "2026-08-02T12:00:00.000Z",
      nin_verified: true,
    };
    // Pro row may still show submitted if mirror lagged
    const pro: CareProSnapshot = {
      gov_id_review_status: "submitted",
      visibility_tier: 1,
    };
    const result = applyCareServerToLocalDraft(local, { pro, motorist });

    expect(result.t2Approved).toBe(true);
    expect(result.profile.govIdReviewStatus).toBe("approved");
    expect(result.profile.tiers.tier2_govId).toBe(true);
  });

  it("does not leave submitted when verified true even if review status empty", () => {
    const local = draft({ govIdReviewStatus: "submitted" });
    const result = applyCareServerToLocalDraft(local, {
      pro: { verified: true, visibility_tier: 2 },
      motorist: null,
    });
    expect(result.profile.govIdReviewStatus).toBe("approved");
  });

  it("applies reject and unlocks form", () => {
    const local = draft({
      govIdReviewStatus: "submitted",
      tiers: {
        tier1_phone: true,
        tier2_govId: true,
        tier2_nin: false,
        tier3_liveness: false,
        tier4_skillProof: false,
      },
    });
    const result = applyCareServerToLocalDraft(local, {
      pro: {
        gov_id_review_status: "rejected",
        rejection_reason: "Blurry photo",
      },
      motorist: null,
    });
    expect(result.profile.govIdReviewStatus).toBe("rejected");
    expect(result.profile.tiers.tier2_govId).toBe(false);
    expect(result.profile.rejectReason).toMatch(/Blurry/);
  });

  it("is empty when no pro and motorist not approved", () => {
    const local = draft();
    const result = applyCareServerToLocalDraft(local, {
      pro: null,
      motorist: { identity_review_status: "submitted" },
    });
    expect(result.empty).toBe(true);
    expect(result.profile.govIdReviewStatus).toBe("submitted");
  });
});
