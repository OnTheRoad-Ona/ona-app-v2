import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canSurfaceIncomingJob,
  isIncomingJobOpen,
  isProRequestCardKeepable,
  markJobShown,
  readShownJobIds,
  requestCloseText,
} from "@/lib/jobs/incoming-popup-timing";
import type { JobRecord } from "@/lib/jobs/types";

const store: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  });
});

describe("canSurfaceIncomingJob", () => {
  it("allows every new job (no 10-minute throttle)", () => {
    expect(canSurfaceIncomingJob("j1")).toEqual({
      allow: true,
      reason: "new_wave",
    });
    expect(canSurfaceIncomingJob("j2")).toEqual({
      allow: true,
      reason: "new_wave",
    });
  });

  it("blocks already shown jobs for the same offer window", () => {
    const dl = "2026-08-08T12:00:00.000Z";
    markJobShown("j1", undefined, dl);
    expect(
      canSurfaceIncomingJob("j1", { pairingDeadline: dl }).allow
    ).toBe(false);
  });

  it("allows re-surface when pairing deadline changes (new offer / Retry)", () => {
    markJobShown("j1", undefined, "2026-08-08T12:00:00.000Z");
    expect(
      canSurfaceIncomingJob("j1", {
        pairingDeadline: "2026-08-08T12:01:06.000Z",
      }).allow
    ).toBe(true);
  });

  it("piles when a wave is open", () => {
    expect(canSurfaceIncomingJob("j3", { waveOpen: true })).toEqual({
      allow: true,
      reason: "pile",
    });
  });
});

const NOW = Date.parse("2026-08-04T12:00:00.000Z");

function job(overrides: Partial<JobRecord>): JobRecord {
  return {
    id: "j1",
    motoristId: "m1",
    motoristName: "M",
    repairProId: "p1",
    repairProName: "P",
    serviceType: "mechanic",
    problem: "Engine won't start",
    status: "reserved",
    createdAt: new Date(NOW - 60_000).toISOString(),
    statusHistory: [],
    ...overrides,
  } as JobRecord;
}

describe("isIncomingJobOpen", () => {
  it("stays open for a normal reserved pairing job", () => {
    expect(
      isIncomingJobOpen(
        job({
          status: "reserved",
          pairingStage: "reserved",
          pairingDeadline: new Date(NOW + 60_000).toISOString(),
        }),
        "p1",
        NOW
      )
    ).toBe(true);
  });

  it("closes a cancelled job even with a stale reserved stage (sticky bug)", () => {
    expect(
      isIncomingJobOpen(
        job({
          status: "cancelled",
          pairingStage: "reserved",
          pairingDeadline: new Date(NOW + 60_000).toISOString(),
        }),
        "p1",
        NOW
      )
    ).toBe(false);
  });

  it("closes a completed job even with a stale waiting_for_pro stage", () => {
    expect(
      isIncomingJobOpen(
        job({
          status: "completed",
          pairingStage: "waiting_for_pro",
          pairingDeadline: new Date(NOW + 60_000).toISOString(),
        }),
        "p1",
        NOW
      )
    ).toBe(false);
  });

  it("closes an expired / declined (sequential_pairing) job", () => {
    expect(
      isIncomingJobOpen(
        job({
          status: "sequential_pairing",
          pairingStage: "sequential_pairing",
        }),
        "p1",
        NOW
      )
    ).toBe(false);
  });

  it("closes a pairing job past its pairing deadline", () => {
    expect(
      isIncomingJobOpen(
        job({
          status: "reserved",
          pairingStage: "reserved",
          pairingDeadline: new Date(NOW - 1_000).toISOString(),
        }),
        "p1",
        NOW
      )
    ).toBe(false);
  });

  it("keeps negotiating open inside the window and closed after it", () => {
    expect(
      isIncomingJobOpen(
        job({
          status: "negotiating",
          negotiateEndsAt: new Date(NOW + 60_000).toISOString(),
        }),
        "p1",
        NOW
      )
    ).toBe(true);
    expect(
      isIncomingJobOpen(
        job({
          status: "negotiating",
          negotiateEndsAt: new Date(NOW - 1_000).toISOString(),
        }),
        "p1",
        NOW
      )
    ).toBe(false);
  });

  it("keeps agreed open and never opens for another pro", () => {
    expect(
      isIncomingJobOpen(job({ status: "agreed" }), "p1", NOW)
    ).toBe(true);
    expect(
      isIncomingJobOpen(job({ status: "agreed" }), "p2", NOW)
    ).toBe(false);
  });

  it("closes a released / satisfied job", () => {
    for (const status of [
      "released",
      "satisfied",
      "refunded",
      "expired",
    ] as const) {
      expect(
        isIncomingJobOpen(
          job({ status, pairingStage: "reserved" }),
          "p1",
          NOW
        )
      ).toBe(false);
    }
  });
});

describe("isProRequestCardKeepable — fast-close contract (never regress)", () => {
  it("keeps a live pairing card", () => {
    for (const stage of [
      "waiting_for_selected",
      "selected_review",
      "waiting_for_pro",
      "reserved",
    ]) {
      expect(isProRequestCardKeepable(stage, stage)).toBe(true);
      // Legacy `status` column is "requested" for pairing rows — must keep.
      expect(isProRequestCardKeepable("requested", stage)).toBe(true);
    }
  });

  it("keeps sequential_pairing / negotiating / agreed", () => {
    expect(
      isProRequestCardKeepable("sequential_pairing", "sequential_pairing")
    ).toBe(true);
    expect(isProRequestCardKeepable("negotiating", null)).toBe(true);
    expect(isProRequestCardKeepable("agreed", null)).toBe(true);
  });

  it("drops a customer-cancelled request even with a stale stage", () => {
    expect(isProRequestCardKeepable("cancelled", null)).toBe(false);
    expect(isProRequestCardKeepable("cancelled", "waiting_for_pro")).toBe(
      false
    );
    expect(isProRequestCardKeepable("cancelled", "reserved")).toBe(false);
    expect(isProRequestCardKeepable("requested", "cancelled")).toBe(false);
  });

  it("drops terminal statuses and empty rows", () => {
    for (const status of [
      "expired",
      "refunded",
      "completed",
      "released",
      "disputed",
    ]) {
      expect(isProRequestCardKeepable(status, null)).toBe(false);
      expect(isProRequestCardKeepable(status, "waiting_for_pro")).toBe(false);
    }
    expect(isProRequestCardKeepable("", null)).toBe(false);
    expect(isProRequestCardKeepable(null, null)).toBe(false);
  });
});

describe("requestCloseText — rich notifications, never a silent vanish", () => {
  const auto: Pick<JobRecord, "motoristName" | "motoristVehicle" | "serviceType"> = {
    motoristName: "Mina Smith",
    motoristVehicle: "Toyota Camry",
    serviceType: "mechanic",
  };
  const generic: Pick<JobRecord, "motoristName" | "serviceType"> = {
    motoristName: "Bola Ade",
    serviceType: "electrical",
  };

  it("names the customer + vehicle for an automotive cancel", () => {
    expect(requestCloseText({ job: auto, status: "cancelled" })).toBe(
      "Mina cancelled the Toyota Camry request."
    );
  });

  it("falls back to a plain name / generic text without vehicle or job", () => {
    expect(requestCloseText({ job: generic, status: "cancelled" })).toBe(
      "Bola cancelled this request."
    );
    expect(requestCloseText({ status: "cancelled" })).toBe(
      "A customer cancelled this request."
    );
  });

  it("explains expiry and reassignment distinctly", () => {
    expect(requestCloseText({ job: generic, status: "expired" })).toBe(
      "Bola's request expired."
    );
    expect(requestCloseText({ job: auto, movedOn: true })).toBe(
      "This request was assigned to another pro."
    );
    expect(requestCloseText({ status: "expired" })).toBe(
      "This request expired."
    );
  });

  it("has a generic fallback for any other close", () => {
    expect(
      requestCloseText({ job: generic, status: "refunded" })
    ).toBe("Bola's request is no longer open.");
    expect(requestCloseText({ status: "under_appeal" })).toBe(
      "This request is no longer open."
    );
  });
});
