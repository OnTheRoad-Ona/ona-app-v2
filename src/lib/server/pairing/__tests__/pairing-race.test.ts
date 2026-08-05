import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseAdminConfigured: () => true,
}));

vi.mock("@/lib/server/merit/merit-engine", () => ({
  orderCandidatesByMerit: vi.fn(async (candidates: Array<{ user_id: string }>) => [
    ...candidates,
  ]),
  getMeritScoresForPros: vi.fn(async () => new Map<string, number>()),
  recalculateMerit: vi.fn(async () => {}),
}));

import { createServiceSupabase } from "@/lib/supabase/server";
import {
  openRequest,
  confirmRequest,
  declineRequest,
  timeoutRequest,
  advancePairing,
  sweepPairing,
} from "@/lib/server/pairing/pairing-engine";

const createServiceSupabaseMock = vi.mocked(createServiceSupabase);

type Row = {
  id: string;
  motorist_id: string;
  motorist_name: string | null;
  repair_pro_id: string | null;
  service_type: string;
  problem_text: string | null;
  description: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pairing_stage: string | null;
  pairing_deadline: string | null;
  pairing_radius_km: number | null;
  queue_position: number | null;
  remaining_candidates: number | null;
  reservation_status: string | null;
  assignment_status: string | null;
  idempotency_key: string | null;
  chosen_pro_id: string | null;
  status_history: unknown;
  flow_status: string | null;
  status: string | null;
  created_at: string | null;
};

const FULL_ROW: Row = {
  id: "job-1",
  motorist_id: "motorist-1",
  motorist_name: "Ada",
  repair_pro_id: "pro-1",
  service_type: "auto",
  problem_text: "Tyre burst on Third Mainland Bridge",
  description: null,
  pickup_lat: 6.5,
  pickup_lng: 3.3,
  pairing_stage: "waiting_for_selected",
  pairing_deadline: new Date(Date.now() + 60_000).toISOString(),
  pairing_radius_km: 15,
  queue_position: 1,
  remaining_candidates: 2,
  reservation_status: "none",
  assignment_status: "none",
  idempotency_key: null,
  chosen_pro_id: "pro-1",
  status_history: [],
  flow_status: "waiting_for_selected",
  status: "requested",
  created_at: new Date().toISOString(),
};

/** Record of (table, op, args) sent through the fake client. */
const sent: { table: string; op: string; args: unknown[] }[] = [];

type Responder =
  | { data?: unknown; error?: { message: string } | null }
  | Promise<{ data?: unknown; error?: { message: string } | null }>;

/** Per-table scripted responders; default = { error: null }. */
const responders: Record<string, (calls: { op: string; args: unknown[] }[]) => Responder> = {};

function resolveResponder(
  table: string,
  calls: { op: string; args: unknown[] }[]
): Responder {
  const fn = responders[table];
  return fn ? fn(calls) : { data: null, error: null };
}

function makeQuery(table: string) {
  const calls: { op: string; args: unknown[] }[] = [];
  const record = (op: string, args: unknown[]) => {
    calls.push({ op, args });
    sent.push({ table, op, args });
  };
  const q = {
    select: (...a: unknown[]) => {
      record("select", a);
      return q;
    },
    eq: (...a: unknown[]) => {
      record("eq", a);
      return q;
    },
    in: (...a: unknown[]) => {
      record("in", a);
      return q;
    },
    or: (...a: unknown[]) => {
      record("or", a);
      return q;
    },
    neq: (...a: unknown[]) => {
      record("neq", a);
      return q;
    },
    not: (...a: unknown[]) => {
      record("not", a);
      return q;
    },
    lte: (...a: unknown[]) => {
      record("lte", a);
      return q;
    },
    order: (...a: unknown[]) => {
      record("order", a);
      return q;
    },
    limit: (...a: unknown[]) => {
      record("limit", a);
      return q;
    },
    maybeSingle: async () => {
      record("maybeSingle", []);
      const r = resolveResponder(table, calls);
      return r instanceof Promise ? r : r;
    },
    insert: async (...a: unknown[]) => {
      record("insert", a);
      const r = resolveResponder(table, calls);
      return r instanceof Promise ? r : r;
    },
    update: (...a: unknown[]) => {
      record("update", a);
      return q;
    },
    then: (
      resolve: (v: unknown) => void,
      reject: (e: unknown) => void
    ) => {
      const r = resolveResponder(table, calls);
      Promise.resolve(r).then(resolve, reject);
    },
  };
  return q;
}

function installClient(row: Row | null) {
  const sb = {
    from: vi.fn((table: string) => makeQuery(table)),
  };
  createServiceSupabaseMock.mockReturnValue(sb as never);
  if (row) {
    // Stateful responder: apply update patches to the in-memory row so that
    // recursive radius expansion in advancePairing actually terminates.
    // `maybeSingle` queries (loadPairingRow) want a single row; everything
    // else (the sweep select) wants an array.
    responders["service_requests"] = (calls) => {
      const updateOp = calls.find((c) => c.op === "update");
      if (updateOp) Object.assign(row, updateOp.args[0]);
      if (calls.some((c) => c.op === "maybeSingle")) {
        return { data: row, error: null };
      }
      return { data: [row], error: null };
    };
  }
  return sb;
}

function callsFor(table: string, op?: string) {
  return sent.filter(
    (c) => c.table === table && (!op || c.op === op)
  );
}

beforeEach(() => {
  sent.length = 0;
  for (const k of Object.keys(responders)) delete responders[k];
  createServiceSupabaseMock.mockClear();
});

describe("openRequest — idempotency & race safety", () => {
  it("creates one active reservation and moves waiting_for_selected → selected_review", async () => {
    const row: Row = { ...FULL_ROW, pairing_stage: "waiting_for_selected" };
    installClient(row);
    responders["request_reservations"] = () => ({ data: null, error: null });

    const res = await openRequest("job-1", "pro-1", "k-1");

    if (!res.ok) console.error("OPEN_ERR", res.error, res.status);
    expect(res.ok).toBe(true);
    const reservations = callsFor("request_reservations", "insert");
    expect(reservations).toHaveLength(1);
    const inserted = reservations[0].args[0] as Record<string, unknown>;
    expect(inserted.stage).toBe("selected_review");
    expect(inserted.status).toBe("active");

    const updates = callsFor("service_requests", "update");
    expect(updates).toHaveLength(1);
    const patch = updates[0].args[0] as Record<string, unknown>;
    expect(patch.pairing_stage).toBe("selected_review");
    expect(patch.idempotency_key).toBe("k-1");
    // CAS guard on the expected stage
    const casGuard = callsFor("service_requests", "eq").some(
      (c) => c.args[0] === "pairing_stage" && c.args[1] === "waiting_for_selected"
    );
    expect(casGuard).toBe(true);
  });

  it("replays with the same idempotency key are no-ops (no second reservation)", async () => {
    const row: Row = {
      ...FULL_ROW,
      pairing_stage: "waiting_for_selected",
      idempotency_key: "k-1",
    };
    installClient(row);
    responders["request_reservations"] = () => ({ data: null, error: null });

    const first = await openRequest("job-1", "pro-1", "k-1");
    expect(first.ok).toBe(true);
    const second = await openRequest("job-1", "pro-1", "k-1");
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.noop).toBe(true);
    expect(callsFor("request_reservations", "insert")).toHaveLength(0);
    expect(callsFor("service_requests", "update")).toHaveLength(0);
  });

  it("rejects re-opening when already in a review stage (409)", async () => {
    const row: Row = { ...FULL_ROW, pairing_stage: "selected_review" };
    installClient(row);
    const res = await openRequest("job-1", "pro-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });

  it("rejects a pro who is not the current holder (403)", async () => {
    installClient(FULL_ROW);
    const res = await openRequest("job-1", "pro-other");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it("fails safely when a concurrent CAS update loses the race", async () => {
    const row: Row = { ...FULL_ROW, pairing_stage: "waiting_for_selected" };
    installClient(row);
    responders["request_reservations"] = () => ({ data: null, error: null });
    // Simulate the stage having moved while we were mid-flight.
    responders["service_requests"] = () => ({
      error: { message: "stage moved" },
    });

    const res = await openRequest("job-1", "pro-1", "k-2");
    expect(res.ok).toBe(false);
  });
});

describe("confirmRequest — assignment point", () => {
  it("confirms the reservation, arms the 20-min negotiation clock, and nulls pairing timers", async () => {
    const row: Row = { ...FULL_ROW, pairing_stage: "reserved" };
    installClient(row);
    responders["request_reservations"] = () => ({ data: null, error: null });

    const before = Date.now();
    const res = await confirmRequest("job-1", "pro-1", "k-3");
    expect(res.ok).toBe(true);

    const resUpdates = callsFor("request_reservations", "update");
    expect(resUpdates).toHaveLength(1);
    const resPatch = resUpdates[0].args[0] as Record<string, unknown>;
    expect(resPatch.status).toBe("confirmed");
    expect(resPatch.released_by).toBe("confirm");

    const updates = callsFor("service_requests", "update");
    const patch = updates[0].args[0] as Record<string, unknown>;
    expect(patch.pairing_stage).toBe("negotiating");
    expect(patch.pairing_deadline).toBeNull();
    expect(patch.reservation_status).toBe("confirmed");
    expect(patch.assignment_status).toBe("assigned");
    const armed = Date.parse(String(patch.negotiate_ends_at));
    expect(Number.isFinite(armed)).toBe(true);
    expect(armed - before).toBeGreaterThanOrEqual(19 * 60_000);

    const { recalculateMerit } = await import(
      "@/lib/server/merit/merit-engine"
    );
    expect(recalculateMerit).toHaveBeenCalledWith("pro-1");
  });

  it("replays with the same idempotency key are no-ops", async () => {
    const row: Row = {
      ...FULL_ROW,
      pairing_stage: "reserved",
      idempotency_key: "k-4",
    };
    installClient(row);
    responders["request_reservations"] = () => ({ data: null, error: null });

    const res = await confirmRequest("job-1", "pro-1", "k-4");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.noop).toBe(true);
    expect(callsFor("request_reservations", "update")).toHaveLength(0);
    expect(callsFor("service_requests", "update")).toHaveLength(0);
  });

  it("rejects confirming from waiting_for_pro (must Open first) (409)", async () => {
    const row: Row = { ...FULL_ROW, pairing_stage: "waiting_for_pro" };
    installClient(row);
    const res = await confirmRequest("job-1", "pro-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });
});

describe("declineRequest — per-request permanent exclusion (D6)", () => {
  it("writes excluded:<proId> history, marks queue declined, and advances to the next pro", async () => {
    const row: Row = { ...FULL_ROW, pairing_stage: "waiting_for_selected" };
    installClient(row);
    responders["request_pairing_queue"] = () => ({ data: null, error: null });
    responders["repair_pro_profiles"] = () => ({
      data: [{ user_id: "pro-2", business_name: "Beta", primary_service: "auto", lat: 6.5, lng: 3.3 }],
      error: null,
    });
    responders["profiles"] = () => ({
      data: { full_name: "Beta", avatar_url: null },
      error: null,
    });

    const res = await declineRequest("job-1", "pro-1", "Too far away");
    expect(res.ok).toBe(true);

    const queueUpdates = callsFor("request_pairing_queue", "update");
    expect(queueUpdates).toHaveLength(1);
    const qPatch = queueUpdates[0].args[0] as Record<string, unknown>;
    expect(qPatch.status).toBe("declined");

    const updates = callsFor("service_requests", "update");
    const declinePatch = updates[0].args[0] as Record<string, unknown>;
    const history = declinePatch.status_history as Array<{
      by?: string;
      note?: string;
    }>;
    const excluded = history.find((h) => h.by === "excluded:pro-1");
    expect(excluded).toBeTruthy();
    const note = history.find((h) => h.by === "declined:pro-1");
    expect(note?.note).toBe("Too far away");

    // advancePairing hands off to the next pro at the same radius (merit order).
    const advanceUpdates = updates[1]?.args[0] as Record<string, unknown>;
    expect(advanceUpdates.pairing_stage).toBe("waiting_for_pro");
    expect(advanceUpdates.repair_pro_id).toBe("pro-2");
  });

  it("never creates a cross-request cooldown (only per-request history markers)", async () => {
    const row: Row = { ...FULL_ROW, pairing_stage: "waiting_for_pro" };
    installClient(row);
    responders["request_pairing_queue"] = () => ({ data: null, error: null });
    responders["repair_pro_profiles"] = () => ({
      data: [{ user_id: "pro-2", business_name: "Beta", primary_service: "auto", lat: 6.5, lng: 3.3 }],
      error: null,
    });
    responders["profiles"] = () => ({ data: null, error: null });

    await declineRequest("job-1", "pro-1");
    const allPatches = callsFor("service_requests", "update").map(
      (c) => c.args[0] as Record<string, unknown>
    );
    const history = (allPatches[0].status_history ?? []) as Array<{
      by?: string;
    }>;
    expect(history.some((h) => h.by === "excluded:pro-1")).toBe(true);
  });
});

describe("timeoutRequest — sweep enforcement", () => {
  it("never settles or advances a sequential_pairing row (noop)", async () => {
    const row: Row = { ...FULL_ROW, pairing_stage: "sequential_pairing" };
    installClient(row);
    const res = await timeoutRequest("job-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.noop).toBe(true);
    expect(callsFor("request_pairing_queue", "update")).toHaveLength(0);
    expect(callsFor("service_requests", "update")).toHaveLength(0);
  });

  it("times out an unresponsive waiting_for_pro and advances", async () => {
    const row: Row = {
      ...FULL_ROW,
      pairing_stage: "waiting_for_pro",
      pairing_deadline: new Date(Date.now() - 1000).toISOString(),
    };
    installClient(row);
    responders["request_pairing_queue"] = () => ({ data: null, error: null });
    responders["repair_pro_profiles"] = () => ({
      data: [{ user_id: "pro-2", business_name: "Beta", primary_service: "auto", lat: 6.5, lng: 3.3 }],
      error: null,
    });
    responders["profiles"] = () => ({ data: null, error: null });

    const res = await timeoutRequest("job-1");
    expect(res.ok).toBe(true);

    const qPatch = callsFor("request_pairing_queue", "update")[0]
      .args[0] as Record<string, unknown>;
    expect(qPatch.status).toBe("timed_out");
    expect(qPatch.result_note).toContain("pairing deadline exceeded");

    const advancePatch = callsFor("service_requests", "update").at(-1)
      ?.args[0] as Record<string, unknown>;
    expect(advancePatch.pairing_stage).toBe("waiting_for_pro");
    expect(advancePatch.repair_pro_id).toBe("pro-2");
  });

  it("is a noop when the deadline was refreshed mid-sweep (pro just opened)", async () => {
    // The sweep selected the row while its deadline had lapsed, but the pro
    // opened (refreshing pairing_deadline) before timeoutRequest ran. The
    // timeout must not settle or advance the fresh window.
    const row: Row = {
      ...FULL_ROW,
      pairing_stage: "selected_review",
      pairing_deadline: new Date(Date.now() + 30_000).toISOString(),
    };
    installClient(row);
    responders["request_pairing_queue"] = () => ({ data: null, error: null });

    const res = await timeoutRequest("job-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.noop).toBe(true);
    expect(callsFor("request_pairing_queue", "update")).toHaveLength(0);
    expect(callsFor("service_requests", "update")).toHaveLength(0);
  });

  it("is a noop when the stage CAS loses the confirm race", async () => {
    // confirmRequest already moved the row to negotiating — the stale timeout's
    // CAS on the old stage matches nothing, so nothing advances.
    const row: Row = { ...FULL_ROW, pairing_stage: "negotiating" };
    installClient(row);
    responders["request_pairing_queue"] = () => ({ data: null, error: null });

    const res = await timeoutRequest("job-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.noop).toBe(true);
  });
});

describe("confirmRequest — marks the queue accepted (race-safe vs sweep)", () => {
  it("writes status=accepted to the queue so a racing timeout never marks it timed_out", async () => {
    const row: Row = { ...FULL_ROW, pairing_stage: "selected_review" };
    installClient(row);
    responders["request_reservations"] = () => ({ data: null, error: null });
    responders["request_pairing_queue"] = () => ({ data: null, error: null });

    const res = await confirmRequest("job-1", "pro-1", "k-acc");
    expect(res.ok).toBe(true);

    const qUpdate = callsFor("request_pairing_queue", "update").find(
      (c) => (c.args[0] as Record<string, unknown>).status === "accepted"
    );
    expect(qUpdate).toBeTruthy();
  });
});

describe("deferRequest — Later keeps the request acceptable until the deadline", () => {
  it("records deferred, keeps pairing state and does not advance", async () => {
    const row: Row = { ...FULL_ROW, pairing_stage: "waiting_for_pro" };
    installClient(row);
    responders["request_pairing_queue"] = () => ({ data: null, error: null });

    const { deferRequest } = await import(
      "@/lib/server/pairing/pairing-engine"
    );
    const res = await deferRequest("job-1", "pro-1");
    expect(res.ok).toBe(true);

    const qPatch = callsFor("request_pairing_queue", "update").find(
      (c) => (c.args[0] as Record<string, unknown>).status === "deferred"
    );
    expect(qPatch).toBeTruthy();

    // No sequential_pairing / no next-pro dispatch, no deadline clobber.
    const srUpdates = callsFor("service_requests", "update");
    expect(srUpdates).toHaveLength(0);
  });
});

describe("advancePairing — never clobbers an assigned negotiation", () => {
  it("is a no-op when the job has already advanced to negotiating", async () => {
    // Simulates the race: a stale decline/defer/timeout read the row while it
    // was "reserved", but the pro "I can fix this" (confirmRequest) already moved
    // it to negotiating. advancePairing must NOT flip it back to sequential
    // pairing — otherwise the 20-min negotiation "closes after a few seconds".
    const row: Row = {
      ...FULL_ROW,
      pairing_stage: "negotiating",
      reservation_status: "confirmed",
      assignment_status: "assigned",
    };
    installClient(row);
    const res = await advancePairing("job-1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.noop).toBe(true);
    expect(callsFor("service_requests", "update")).toHaveLength(0);
    expect(callsFor("request_pairing_queue", "insert")).toHaveLength(0);
  });
});

describe("sweepPairing — recovery loop", () => {
  it("sweeps a fresh waiting_for_selected row whose reservation_status is NULL (stuck-chosen-pro bug)", async () => {
    const row: Row = {
      ...FULL_ROW,
      pairing_stage: "waiting_for_selected",
      reservation_status: null,
      pairing_deadline: new Date(Date.now() - 1000).toISOString(),
    };
    installClient(row);
    responders["request_pairing_queue"] = () => ({ data: [], error: null });
    responders["repair_pro_profiles"] = () => ({ data: [], error: null });

    const res = await sweepPairing();
    expect(res.checked).toBe(1);
    // Must have been timed out of the chosen-pro wait (not skipped forever).
    const timedOut = callsFor("service_requests", "update").find((c) => {
      const p = c.args[0] as Record<string, unknown>;
      return p.pairing_stage === "sequential_pairing";
    });
    expect(timedOut).toBeTruthy();
  });

  it("advances expired sequential_pairing holds (refreshes search) instead of timing out", async () => {
    const row: Row = {
      ...FULL_ROW,
      pairing_stage: "sequential_pairing",
      pairing_deadline: new Date(Date.now() - 1000).toISOString(),
      repair_pro_id: null,
      pairing_radius_km: 15,
    };
    installClient(row);
    // Sweep select + loadPairingRow share the same stateful responder.
    responders["request_pairing_queue"] = () => ({ data: [], error: null });
    responders["repair_pro_profiles"] = () => ({ data: [], error: null });

    const res = await sweepPairing();
    expect(res.checked).toBe(1);
    // No candidates → radius expanded 15 → 20, not a hard timeout.
    const radiusUpdate = callsFor("service_requests", "update").find(
      (c) => {
        const p = c.args[0] as Record<string, unknown>;
        return p.pairing_radius_km === 20;
      }
    );
    expect(radiusUpdate).toBeTruthy();
    expect(
      callsFor("request_pairing_queue", "update").filter(
        (c) => (c.args[0] as Record<string, unknown>).status === "timed_out"
      )
    ).toHaveLength(0);
  });

  it("times out expired waiting_for_pro rows and hands to the next pro", async () => {
    const row: Row = {
      ...FULL_ROW,
      pairing_stage: "waiting_for_pro",
      pairing_deadline: new Date(Date.now() - 1000).toISOString(),
    };
    installClient(row);
    responders["request_pairing_queue"] = () => ({ data: [], error: null });
    responders["repair_pro_profiles"] = () => ({
      data: [{ user_id: "pro-2", business_name: "Beta", primary_service: "auto", lat: 6.5, lng: 3.3 }],
      error: null,
    });
    responders["profiles"] = () => ({ data: null, error: null });

    const res = await sweepPairing();
    expect(res.checked).toBe(1);
    const timedOut = callsFor("request_pairing_queue", "update").filter(
      (c) => (c.args[0] as Record<string, unknown>).status === "timed_out"
    );
    expect(timedOut).toHaveLength(1);
    const advancePatch = callsFor("service_requests", "update").at(-1)
      ?.args[0] as Record<string, unknown>;
    expect(advancePatch.repair_pro_id).toBe("pro-2");
  });
});
