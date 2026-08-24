import { describe, it, expect } from "vitest";
import {
  effectiveGoLiveTier,
  resolveVisibilityTier,
} from "@/lib/artisan/visibility-tiers";

type Row = Record<string, unknown>;

describe("effectiveGoLiveTier (Go Live gate single source of truth)", () => {
  it("returns Tier 1 for a plain unapproved pro", () => {
    const row: Row = {
      visibility_tier: 1,
      gov_id_review_status: "submitted",
      status: "pending",
      verified: false,
      nin_verified: false,
    };
    expect(effectiveGoLiveTier(row)).toBe(1);
  });

  it("never reads a care-approved pro as Tier 1 even when visibility_tier was reset to 1", () => {
    // Regression: signup upsert clobbered visibility_tier back to 1 after approval
    const row: Row = {
      visibility_tier: 1,
      gov_id_review_status: "approved",
      status: "approved",
      verified: true,
    };
    expect(effectiveGoLiveTier(row)).toBe(2);
  });

  it("treats verified=true as Tier 2 floor", () => {
    const row: Row = { visibility_tier: 1, verified: true };
    expect(effectiveGoLiveTier(row)).toBe(2);
  });

  it("treats nin_verified=true as Tier 2 floor", () => {
    const row: Row = { visibility_tier: 1, nin_verified: true };
    expect(effectiveGoLiveTier(row)).toBe(2);
  });

  it("treats a stored tier2_approved_at as Tier 2 floor", () => {
    const row: Row = {
      visibility_tier: 1,
      tier2_approved_at: "2026-08-01T00:00:00.000Z",
    };
    expect(effectiveGoLiveTier(row)).toBe(2);
  });

  it("floors approved-account-status pros to Tier 2 even with stale tier 1", () => {
    // Live + status approved + verified but visibility_tier=1 (stale/clobbered)
    const row: Row = {
      visibility_tier: 1,
      status: "approved",
      verified: true,
      gov_id_review_status: "submitted",
    };
    expect(effectiveGoLiveTier(row)).toBe(2);
  });

  it("keeps stored Tier 3 / Tier 4 for an approved pro", () => {
    const row: Row = {
      visibility_tier: 3,
      gov_id_review_status: "approved",
      bvn_verified: true,
      face_liveness_verified: true,
    };
    expect(effectiveGoLiveTier(row)).toBe(3);
    expect(
      effectiveGoLiveTier({
        ...row,
        visibility_tier: 4,
        docs_status: "approved",
      }),
    ).toBe(4);
  });

  it("legacy rows without a stored tier default to 2 (existing pros not locked out)", () => {
    const row: Row = { status: "approved" };
    expect(effectiveGoLiveTier(row)).toBe(2);
    expect(effectiveGoLiveTier({ visibility_tier: null })).toBe(2);
  });

  it("promotes via auto ladder when stored tier is stale but flags are higher", () => {
    const row: Row = {
      visibility_tier: 1,
      gov_id_review_status: "approved",
      bvn_verified: true,
      face_liveness_verified: true,
    };
    expect(effectiveGoLiveTier(row)).toBe(3);
  });
});

describe("resolveVisibilityTier (client read)", () => {
  it("floors to Tier 2 when govIdReviewStatus approved even if visibilityTier is 1", () => {
    const tier = resolveVisibilityTier({
      visibilityTier: 1,
      status: "approved",
      govIdReviewStatus: "approved",
    });
    expect(tier).toBe(2);
  });

  it("stays Tier 1 for a non-approved draft", () => {
    const tier = resolveVisibilityTier({
      visibilityTier: 1,
      status: "pending_review",
      govIdReviewStatus: "submitted",
    });
    expect(tier).toBe(1);
  });
});
