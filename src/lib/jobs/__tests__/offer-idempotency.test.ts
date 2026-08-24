import { describe, expect, it } from "vitest";
import { hasIdempotentOffer } from "@/lib/jobs/state-machine";
import type { JobOffer } from "@/lib/jobs/types";

function offer(
  id: string,
  side: JobOffer["side"],
  clientOfferId?: string | null,
): JobOffer {
  return {
    id,
    side,
    amountMajor: 5000,
    amountMinor: 500000,
    currency: "NGN",
    createdAt: "2026-08-11T00:00:00.000Z",
    offerIndex: 1,
    clientOfferId: clientOfferId ?? null,
  };
}

describe("hasIdempotentOffer", () => {
  it("matches a sticker already placed on the same side", () => {
    const offers = [offer("o1", "repair_pro", "sticker-a")];
    expect(hasIdempotentOffer(offers, "sticker-a", "repair_pro")).toBe(true);
  });

  it("ignores the same sticker on the other side", () => {
    const offers = [offer("o1", "repair_pro", "sticker-a")];
    expect(hasIdempotentOffer(offers, "sticker-a", "motorist")).toBe(false);
  });

  it("ignores a different sticker", () => {
    const offers = [offer("o1", "repair_pro", "sticker-a")];
    expect(hasIdempotentOffer(offers, "sticker-b", "repair_pro")).toBe(false);
  });

  it("never matches when no sticker is supplied", () => {
    const offers = [offer("o1", "repair_pro", "sticker-a")];
    expect(hasIdempotentOffer(offers, null, "repair_pro")).toBe(false);
    expect(hasIdempotentOffer(offers, undefined, "repair_pro")).toBe(false);
  });

  it("never matches a bare (unstamped) offer", () => {
    const offers = [offer("o1", "repair_pro")];
    expect(hasIdempotentOffer(offers, "sticker-a", "repair_pro")).toBe(false);
  });
});
