import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateCalloutQuote } from "@/lib/server/callout/estimate";
import { isJobParty } from "@/lib/server/auth-utils";
import type { JobRecord } from "@/lib/jobs/types";

const pairingJob = {
  id: "j1",
  motoristId: "m1",
  repairProId: "p1",
  serviceType: "mechanic",
  status: "requested",
  pairingStage: "waiting_for_pro",
  updatedAt: "2026-08-20T10:00:00.000Z",
  motoristLocation: { lat: 6.5, lng: 3.4 },
  proLocation: null,
} as unknown as JobRecord;

describe("pairing-state quote", () => {
  it("authorizes the dispatched pro for a requested/pairing job", () => {
    expect(isJobParty("p1", pairingJob)).toBe(true);
    expect(isJobParty("m1", pairingJob)).toBe(true);
    expect(isJobParty("p2", pairingJob)).toBe(false);
  });

  it("returns a payable CALCULATED estimate for a pairing job", async () => {
    const q = await estimateCalloutQuote(pairingJob, null);
    expect(q?.calloutStatus).toBe("CALCULATED");
    expect(q?.calloutEligible).toBe(true);
    expect(Number(q?.calloutFee)).toBeGreaterThan(0);
  });

  it("applies Night ×1.5 at the current time even for a daytime-created request", async () => {
    // 22:00 UTC = 23:00 Lagos (night band 9PM-5AM). The job was created at
    // 10:00 UTC (daytime) the fee must still carry the Night multiplier
    // because it's night NOW, never an un-multiplied fee.
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-20T22:00:00.000Z"));
    try {
      const q = await estimateCalloutQuote(pairingJob, null);
      expect(q?.urgencyKind).toBe("night");
      expect(q?.urgencyMultiplier).toBe(1.5);
      // mechanic: (3000×0.4 + 0.5×350×0.4) × 1.5 = 1905
      expect(q?.calloutFee).toBe(1905);
    } finally {
      vi.useRealTimers();
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
});
