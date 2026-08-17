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

vi.mock("@/lib/server/notifications", () => ({
  insertNotification: vi.fn(async () => ({ id: "notif-1" })),
}));

vi.mock("@/lib/server/push/webpush", () => ({
  sendPushToUser: vi.fn(async () => {}),
}));

import { createServiceSupabase } from "@/lib/supabase/server";
import { confirmRequest, sweepScheduledDispatches } from "@/lib/server/pairing/pairing-engine";

const createServiceSupabaseMock = vi.mocked(createServiceSupabase);

type ScheduledRow = {
  id: string;
  linked_request_id: string | null;
  scheduled_dispatch_at: string | null;
  dispatch_notified_at: string | null;
  motorist_id: string;
  service_type: string;
  problem: string | null;
  pickup_address: string | null;
  status_history: unknown;
  flow_status: string | null;
  status: string | null;
};

const PRIMARY_ID = "tow-1";
const SECOND_ID = "second-1";
const MOTORIST_ID = "motorist-1";

const ARMED_ROW: ScheduledRow = {
  id: SECOND_ID,
  linked_request_id: PRIMARY_ID,
  scheduled_dispatch_at: new Date(Date.now() - 60_000).toISOString(),
  dispatch_notified_at: null,
  motorist_id: MOTORIST_ID,
  service_type: "mechanic",
  problem: "Vehicle: Toyota Camry\nTowed to workshop",
  pickup_address: "Near you",
  status_history: [{ status: "scheduled", at: new Date().toISOString(), by: "motorist" }],
  flow_status: "scheduled",
  status: "requested",
};

const sent: { table: string; calls: { op: string; args: unknown[] }[] }[] = [];

type Responder =
  | { data?: unknown; error?: { message: string } | null }
  | Promise<{ data?: unknown; error?: { message: string } | null }>;

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
    sent.push({ table, calls });
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
    not: (...a: unknown[]) => {
      record("not", a);
      return q;
    },
    is: (...a: unknown[]) => {
      record("is", a);
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
    update: (...a: unknown[]) => {
      record("update", a);
      return q;
    },
    selectSingle: (...a: unknown[]) => {
      record("select", a);
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

function installClient() {
  const sb = { from: vi.fn((table: string) => makeQuery(table)) };
  createServiceSupabaseMock.mockReturnValue(sb as never);
  return sb;
}

function findQuery(pred: (calls: { op: string; args: unknown[] }[]) => boolean) {
  return sent.find((q) => pred(q.calls))?.calls ?? null;
}

beforeEach(() => {
  sent.length = 0;
  responders["service_requests"] = () => ({ data: null, error: null });
  responders["request_reservations"] = () => ({ data: null, error: null });
  responders["request_pairing_queue"] = () => ({ data: null, error: null });
  vi.clearAllMocks();
});

describe("add-another-repair-pro (linked scheduled second request)", () => {
  it("confirmRequest arms the linked scheduled request ~60 min after acceptance", async () => {
    const primary: Record<string, unknown> = {
      id: PRIMARY_ID,
      motorist_id: MOTORIST_ID,
      motorist_name: "Ada",
      repair_pro_id: "pro-1",
      service_type: "auto",
      problem_text: "Tyre burst",
      description: null,
      pickup_lat: 6.5,
      pickup_lng: 3.3,
      pairing_stage: "reserved",
      pairing_deadline: new Date(Date.now() + 60_000).toISOString(),
      pairing_radius_km: 15,
      radius_km: 10,
      queue_position: 1,
      remaining_candidates: 0,
      reservation_status: "active",
      assignment_status: "none",
      idempotency_key: null,
      chosen_pro_id: "pro-1",
      status_history: [],
      flow_status: "reserved",
      status: "requested",
      created_at: new Date().toISOString(),
    };
    installClient();
    responders["service_requests"] = (calls) => {
      const updateOp = calls.find((c) => c.op === "update");
      if (updateOp) Object.assign(primary, updateOp.args[0]);
      if (calls.some((c) => c.op === "maybeSingle")) return { data: primary, error: null };
      // The main confirm CAS update is awaited via .select("id") → array of ids
      return { data: [{ id: PRIMARY_ID }], error: null };
    };

    const before = Date.now();
    const res = await confirmRequest(PRIMARY_ID, "pro-1", "arm-k1");
    expect(res.ok).toBe(true);

    const armCalls = findQuery(
      (c) => c.some((x) => x.op === "is" && x.args[0] === "scheduled_dispatch_at")
    );
    expect(armCalls).not.toBeNull();
    const armPatch = armCalls!.find((c) => c.op === "update")!.args[0] as Record<string, unknown>;
    const armedMs = Date.parse(String(armPatch.scheduled_dispatch_at));
    expect(Number.isFinite(armedMs)).toBe(true);
    expect(armedMs - before).toBeGreaterThanOrEqual(59 * 60_000);
    expect(armedMs - before).toBeLessThanOrEqual(61 * 60_000);
    // CAS guards: only un-armed scheduled requests linked to the primary
    expect(armCalls!.some((c) => c.op === "eq" && c.args[0] === "linked_request_id" && c.args[1] === PRIMARY_ID)).toBe(true);
    expect(armCalls!.some((c) => c.op === "eq" && c.args[0] === "flow_status" && c.args[1] === "scheduled")).toBe(true);
    expect(armCalls!.some((c) => c.op === "is" && c.args[0] === "scheduled_dispatch_at" && c.args[1] === null)).toBe(true);
  });

  it("sweep silently cancels a linked request when the primary is cancelled", async () => {
    const scheduled: ScheduledRow = { ...ARMED_ROW };
    installClient();
    responders["service_requests"] = (calls) => {
      if (calls.some((c) => c.op === "maybeSingle")) {
        return { data: { flow_status: "cancelled", status: "cancelled" }, error: null };
      }
      if (calls.some((c) => c.op === "select")) {
        return { data: [scheduled], error: null };
      }
      return { data: null, error: null };
    };

    const res = await sweepScheduledDispatches(50);
    expect(res.checked).toBe(1);
    expect(res.cancelled).toBe(1);
    expect(res.notified).toBe(0);

    const cancelCalls = findQuery(
      (c) => c.some((x) => x.op === "update" && (x.args[0] as Record<string, unknown>).flow_status === "cancelled")
    );
    expect(cancelCalls).not.toBeNull();
    const patch = cancelCalls!.find((c) => c.op === "update")!.args[0] as Record<string, unknown>;
    expect(patch.cancelled_at).toBeDefined();
    const history = patch.status_history as Array<{ status: string; by?: string }>;
    expect(history.some((h) => h.status === "cancelled" && h.by === "second_pro_cancelled")).toBe(true);

    const { insertNotification } = await import("@/lib/server/notifications");
    expect(insertNotification).not.toHaveBeenCalled();
  });

  it("sweep notifies the motorist ONCE at the dispatch mark", async () => {
    const scheduled: ScheduledRow = { ...ARMED_ROW };
    installClient();
    responders["service_requests"] = (calls) => {
      const updateOp = calls.find((c) => c.op === "update");
      if (updateOp) Object.assign(scheduled, updateOp.args[0]);
      if (calls.some((c) => c.op === "maybeSingle")) {
        return { data: { flow_status: "negotiating", status: "requested" }, error: null };
      }
      // The notify flip update ends with .select("id") — single-col select
      if (calls.some((c) => c.op === "select" && c.args[0] === "id")) {
        return { data: [{ id: SECOND_ID }], error: null };
      }
      return { data: [scheduled], error: null };
    };

    const res = await sweepScheduledDispatches(50);
    expect(res.checked).toBe(1);
    expect(res.cancelled).toBe(0);
    expect(res.notified).toBe(1);

    const { insertNotification } = await import("@/lib/server/notifications");
    expect(insertNotification).toHaveBeenCalledTimes(1);
    const n = vi.mocked(insertNotification).mock.calls[0][0];
    expect(n.userId).toBe(MOTORIST_ID);
    expect(n.href).toBe(`/jobs/${SECOND_ID}`);
    expect(n.actionPayload).toEqual({ jobId: SECOND_ID });
    expect(n.groupKey).toBe(`scheduled-dispatch-${SECOND_ID}`);

    const { sendPushToUser } = await import("@/lib/server/push/webpush");
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(sendPushToUser).toHaveBeenCalledWith(MOTORIST_ID, expect.objectContaining({ url: `/jobs/${SECOND_ID}` }));

    // Second run: dispatch_notified_at is now set → never re-notify
    const res2 = await sweepScheduledDispatches(50);
    expect(res2.notified).toBe(0);
    expect(insertNotification).toHaveBeenCalledTimes(1);
    expect(sendPushToUser).toHaveBeenCalledTimes(1);
  });

  it("sweep skips an un-armed linked request (primary still active, no dispatch time)", async () => {
    const scheduled: ScheduledRow = { ...ARMED_ROW, scheduled_dispatch_at: null };
    installClient();
    responders["service_requests"] = (calls) => {
      if (calls.some((c) => c.op === "maybeSingle")) {
        return { data: { flow_status: "negotiating", status: "requested" }, error: null };
      }
      if (calls.some((c) => c.op === "select")) {
        return { data: [scheduled], error: null };
      }
      return { data: null, error: null };
    };

    const res = await sweepScheduledDispatches(50);
    expect(res.checked).toBe(1);
    expect(res.cancelled).toBe(0);
    expect(res.notified).toBe(0);

    const { insertNotification } = await import("@/lib/server/notifications");
    expect(insertNotification).not.toHaveBeenCalled();
  });
});