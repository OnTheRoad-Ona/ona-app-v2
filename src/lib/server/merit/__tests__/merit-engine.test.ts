import { describe, it, expect } from "vitest";
import { computeMeritScore, type MeritInput } from "@/lib/server/merit/merit-engine";

function base(): MeritInput {
  return {
    verified: false,
    ratingAvg: 0,
    ratingCount: 0,
    jobsCompleted: 0,
    completionRate: 0,
    avgResponseMinutes: null,
    disputesCount: 0,
    disputesWon: 0,
    cancellationsCount: 0,
    isOnline: false,
    isNewArtisan: false,
    hasBio: false,
    hasSkills: false,
    hasVehicleFocus: false,
    hasLabourPrices: false,
    hasGovId: false,
    hasBusinessName: false,
    guarantorCount: 0,
  };
}

describe("computeMeritScore", () => {
  it("returns a finite 0..100 score for an empty pro (never NaN)", () => {
    const r = computeMeritScore(base());
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("verified pros get the verified bonus and never a negative score", () => {
    const neutral = computeMeritScore(base());
    const verified = computeMeritScore({ ...base(), verified: true });
    expect(verified.verified_bonus).toBe(8);
    expect(verified.score).toBeGreaterThan(neutral.score);
    expect(verified.score).toBeGreaterThanOrEqual(0);
  });

  it("new artisans are penalised (D4: still eligible, just ranked lower)", () => {
    const normal = computeMeritScore(base());
    const newbie = computeMeritScore({ ...base(), isNewArtisan: true });
    expect(newbie.score).toBeLessThan(normal.score);
    expect(newbie.score).toBeGreaterThanOrEqual(0);
  });

  it("higher rating with enough reviews ranks higher", () => {
    const low = computeMeritScore({
      ...base(),
      ratingAvg: 3,
      ratingCount: 10,
      jobsCompleted: 10,
    });
    const high = computeMeritScore({
      ...base(),
      ratingAvg: 4.9,
      ratingCount: 10,
      jobsCompleted: 10,
    });
    expect(high.rating_score).toBeGreaterThan(low.rating_score);
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("rating average is count-weighted (1 rating does not dominate)", () => {
    const oneRating = computeMeritScore({ ...base(), ratingAvg: 5, ratingCount: 1 });
    const manyRatings = computeMeritScore({
      ...base(),
      ratingAvg: 5,
      ratingCount: 8,
    });
    expect(manyRatings.rating_score).toBeGreaterThan(oneRating.rating_score);
  });

  it("faster average response yields a higher response_speed_score", () => {
    const slow = computeMeritScore({ ...base(), avgResponseMinutes: 120 });
    const fast = computeMeritScore({ ...base(), avgResponseMinutes: 2 });
    expect(fast.response_speed_score).toBeGreaterThan(slow.response_speed_score);
  });

  it("more completed jobs increases jobs_completed_score (capped)", () => {
    const few = computeMeritScore({ ...base(), jobsCompleted: 2 });
    const many = computeMeritScore({ ...base(), jobsCompleted: 60 });
    const capped = computeMeritScore({ ...base(), jobsCompleted: 500 });
    expect(many.jobs_completed_score).toBeGreaterThan(few.jobs_completed_score);
    expect(capped.jobs_completed_score).toBe(many.jobs_completed_score);
  });

  it("disputes drag the dispute_rate_score down", () => {
    const clean = computeMeritScore({ ...base(), jobsCompleted: 20, disputesCount: 0 });
    const troubled = computeMeritScore({ ...base(), jobsCompleted: 20, disputesCount: 6 });
    expect(troubled.dispute_rate_score).toBeLessThan(clean.dispute_rate_score);
  });

  it("wins disputes offset some of the dispute penalty", () => {
    const lost = computeMeritScore({ ...base(), jobsCompleted: 20, disputesCount: 4, disputesWon: 0 });
    const won = computeMeritScore({ ...base(), jobsCompleted: 20, disputesCount: 4, disputesWon: 3 });
    expect(won.dispute_rate_score).toBeGreaterThan(lost.dispute_rate_score);
  });

  it("cancellations reduce reliability", () => {
    const none = computeMeritScore({ ...base(), completionRate: 1, cancellationsCount: 0 });
    const many = computeMeritScore({ ...base(), completionRate: 1, cancellationsCount: 12 });
    expect(many.reliability_score).toBeLessThan(none.reliability_score);
  });

  it("online with a fresh heartbeat scores availability highest", () => {
    const offline = computeMeritScore(base());
    const stale = computeMeritScore({
      ...base(),
      isOnline: true,
      locationUpdatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    const fresh = computeMeritScore({
      ...base(),
      isOnline: true,
      locationUpdatedAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    expect(fresh.availability_score).toBe(1);
    expect(stale.availability_score).toBe(0.7);
    expect(offline.availability_score).toBe(0.2);
  });

  it("more complete profiles rank higher", () => {
    const bare = computeMeritScore(base());
    const full = computeMeritScore({
      ...base(),
      hasBio: true,
      hasSkills: true,
      hasVehicleFocus: true,
      hasLabourPrices: true,
      hasGovId: true,
      hasBusinessName: true,
      guarantorCount: 1,
    });
    expect(full.profile_completeness_score).toBe(1);
    expect(full.score).toBeGreaterThan(bare.score);
  });

  it("recent activity rewards fresh pros", () => {
    const idle = computeMeritScore(base());
    const active = computeMeritScore({
      ...base(),
      locationUpdatedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    });
    expect(active.recent_activity_score).toBeGreaterThan(idle.recent_activity_score);
  });

  it("score stays clamped to 100 even with all positive signals", () => {
    const elite = computeMeritScore({
      ...base(),
      verified: true,
      ratingAvg: 5,
      ratingCount: 50,
      jobsCompleted: 200,
      completionRate: 1,
      avgResponseMinutes: 1,
      isOnline: true,
      locationUpdatedAt: new Date(Date.now() - 30 * 1000).toISOString(),
      hasBio: true,
      hasSkills: true,
      hasVehicleFocus: true,
      hasLabourPrices: true,
      hasGovId: true,
      hasBusinessName: true,
      guarantorCount: 1,
    });
    expect(elite.score).toBeLessThanOrEqual(100);
    expect(elite.score).toBeGreaterThan(70);
  });
});
