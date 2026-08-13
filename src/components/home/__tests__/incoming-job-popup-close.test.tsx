// @vitest-environment jsdom
/**
 * Guards the fast-close mechanism of the Repair Pro incoming panel:
 * - while a card is visible, `poll()` calls the ultra-light
 *   `/api/jobs/pro-incoming-status` endpoint (via `apiProIncomingStatus`) with
 *   the visible card ids, instead of the full list;
 * - a `cancelled` snapshot closes the card (even if realtime was "missed");
 * - a keepable snapshot keeps the card;
 * - the full lean list still runs every few cycles to surface/reconcile.
 *
 * If someone deletes `statusCheck` / the status endpoint wiring, these fail.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingJobPopup } from "@/components/home/incoming-job-popup";
import type { JobRecord } from "@/lib/jobs/types";

const routerPush = vi.fn();
const client = vi.hoisted(() => ({
  apiListJobs: vi.fn(),
  apiProIncomingStatus: vi.fn(),
  apiGetJob: vi.fn(),
  apiTransition: vi.fn(),
  apiDeferJob: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/jobs",
}));

vi.mock("@/lib/store", () => ({
  useApp: () => ({
    accountType: "professional",
    backendUserId: "p1",
    theme: "light",
    isAuthenticated: true,
    authReady: true,
  }),
}));

// A live realtime push (Supabase postgres_changes UPDATE on service_requests)
// must close the card and raise the banner WITHOUT waiting for the next poll.
const realtime = vi.hoisted(() => {
  let listener: ((payload: unknown) => void) | null = null;
  return {
    subscribeJobs: vi.fn(
      (_userId: string, onChange: (payload: unknown) => void) => {
        listener = onChange;
        return () => {
          listener = null;
        };
      }
    ),
    emit: (payload: unknown) => {
      listener?.(payload);
    },
  };
});

vi.mock("@/lib/supabase/app-api", () => ({
  backendSubscribeJobs: (userId: string, onChange: (p: unknown) => void) =>
    realtime.subscribeJobs(userId, onChange),
}));

vi.mock("@/lib/jobs/client", () => client);

vi.mock("@/lib/jobs/server-clock", () => ({
  refreshServerClock: vi.fn(async () => {}),
  serverNow: () => Date.now(),
  syncServerClock: vi.fn(),
}));

const { showAppNotification, canNotify } = vi.hoisted(() => ({
  showAppNotification: vi.fn(),
  canNotify: vi.fn(() => false),
}));

vi.mock("@/lib/app-notify", () => ({
  canNotify: () => canNotify(),
  ensureNotifyPermission: async () => "denied",
  showAppNotification,
  vibrateCallPattern: vi.fn(),
}));

vi.mock("@/lib/sound-tone", () => ({
  playAppSound: vi.fn(),
  unlockAudio: vi.fn(),
}));

vi.mock("@/components/jobs/voice-note-player", () => ({
  VoiceNotePlayer: () => null,
}));

const NOW = Date.parse("2026-08-12T10:00:00.000Z");
const DEADLINE = new Date(NOW + 60_000).toISOString();
const NEW_DEADLINE = new Date(NOW + 90_000).toISOString();

const openJob = {
  id: "j1",
  motoristId: "m1",
  motoristName: "Mina",
  motoristVehicle: "Toyota Camry",
  repairProId: "p1",
  repairProName: "Pro",
  serviceType: "mechanic",
  problem: "Engine won't start",
  status: "reserved",
  pairingStage: "reserved",
  pairingDeadline: DEADLINE,
  negotiateEndsAt: NEW_DEADLINE,
  photos: [],
  currency: "USD",
  proBaseMajor: 0,
  agreedMajor: null,
  offers: [],
  maxOffers: 6,
  locationLabel: "Here",
  motoristLocation: { lat: 1, lng: 2 },
  statusHistory: [],
} as unknown as JobRecord;

const okList = (jobs: JobRecord[]) => ({
  ok: true,
  data: { jobs },
});

const statusSnapshot = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "j1",
  status: "reserved",
  pairingStage: "reserved",
  pairingDeadline: DEADLINE,
  repairProId: "p1",
  negotiateEndsAt: NEW_DEADLINE,
  updatedAt: DEADLINE,
  ...over,
});

const okStatus = (jobs: unknown[]) => ({
  ok: true,
  data: { jobs },
});

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  client.apiGetJob.mockResolvedValue(okList([openJob]));
  client.apiProIncomingStatus.mockResolvedValue(
    okStatus([statusSnapshot()])
  );
});

afterEach(() => {
  vi.useRealTimers();
});

const advanceOnePoll = async () => {
  await act(async () => {
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
  });
};

/** Flush the async poll / present-job promise chains inside act. */
const flushPolls = async () => {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
};

describe("IncomingJobPopup fast status-check poll", () => {
  it("surfaces the card from the first full list, then uses the light status check", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([openJob]))
      .mockResolvedValue(okList([]));

    render(<IncomingJobPopup />);
    await flushPolls();

    expect(screen.getByText("Engine won't start")).toBeTruthy();
    expect(client.apiListJobs).toHaveBeenCalledTimes(1);

    await advanceOnePoll();
    await flushPolls();

    // Visible card → poll hits the light endpoint with the card id, not the
    // full list again.
    expect(client.apiProIncomingStatus).toHaveBeenCalledWith(["j1"]);
    expect(client.apiListJobs).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Engine won't start")).toBeTruthy();
  });

  it("closes the card instantly when the realtime push carries the cancellation", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([openJob]))
      .mockResolvedValue(okList([]));

    render(<IncomingJobPopup />);
    await flushPolls();
    expect(screen.getByText("Engine won't start")).toBeTruthy();

    // Customer cancels → Supabase realtime UPDATE event reaches the pro.
    await act(async () => {
      realtime.emit({
        eventType: "UPDATE",
        new: {
          id: "j1",
          flow_status: "cancelled",
          status: "cancelled",
          pairing_stage: "reserved",
          repair_pro_id: "p1",
        },
      });
      await Promise.resolve();
    });

    expect(screen.queryByText("Engine won't start")).toBeNull();
    // Cancellation notice is single-voiced through the notification center's
    // top toast — the popup banner must NOT double it.
    expect(screen.queryByText("Request cancelled")).toBeNull();
  });

  it("drops the card within ~1s when the status check reports cancelled", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([openJob]))
      .mockResolvedValue(okList([]));

    render(<IncomingJobPopup />);
    await flushPolls();
    expect(screen.getByText("Engine won't start")).toBeTruthy();

    // Customer cancels; realtime push never arrives. The next ~1s status check
    // must close the card — the cancellation toasts through the notification
    // center's top toast, not a transient panel banner.
    client.apiProIncomingStatus.mockResolvedValue(
      okStatus([
        statusSnapshot({ status: "cancelled", pairingStage: null }),
      ])
    );

    await advanceOnePoll();
    await flushPolls();

    expect(screen.queryByText("Engine won't start")).toBeNull();
    expect(client.apiProIncomingStatus).toHaveBeenCalledWith(["j1"]);
    expect(
      screen.queryByText("Mina cancelled the Toyota Camry request.")
    ).toBeNull();
    expect(screen.queryByText("Request cancelled")).toBeNull();
    expect(showAppNotification).not.toHaveBeenCalled();
  });

  it("fires the OS push only when the panel was closed, not for new requests while it is open", async () => {
    canNotify.mockReturnValue(true);
    const j2 = {
      ...openJob,
      id: "j2",
      motoristVehicle: "Honda Civic",
      photos: [
        {
          id: "p2",
          kind: "photo",
          url: "x://2",
          createdAt: NOW,
          uploadedBy: "m1",
        },
      ],
    } as unknown as JobRecord;

    // First full list: only j1 → panel closed at surfacing → OS push once.
    // Next full list: j1 + j2 → j2 surfaces while the panel is already open.
    client.apiListJobs
      .mockResolvedValueOnce(okList([openJob]))
      .mockResolvedValue(okList([openJob, j2]));

    render(<IncomingJobPopup />);
    await flushPolls();
    expect(screen.getByText("Engine won't start")).toBeTruthy();
    expect(showAppNotification).toHaveBeenCalledTimes(1);
    showAppNotification.mockClear();

    // 2 status-check ticks then a full lean list → j2 surfaces with panel open.
    await advanceOnePoll();
    await advanceOnePoll();
    await advanceOnePoll();
    await flushPolls();

    expect(screen.getByText("Honda Civic")).toBeTruthy();
    expect(showAppNotification).not.toHaveBeenCalled();
  });

  it("keeps a card that is still open and syncs its server deadline", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([openJob]))
      .mockResolvedValue(okList([openJob]));

    render(<IncomingJobPopup />);
    await flushPolls();
    expect(screen.getByText("Engine won't start")).toBeTruthy();

    client.apiProIncomingStatus.mockResolvedValue(
      okStatus([
        statusSnapshot({ pairingDeadline: NEW_DEADLINE }),
      ])
    );

    await advanceOnePoll();
    await flushPolls();

    expect(screen.getByText("Engine won't start")).toBeTruthy();
    expect(
      screen.queryByText("The customer cancelled this request.")
    ).toBeNull();
    expect(client.apiProIncomingStatus).toHaveBeenCalledWith(["j1"]);
  });

  it("still runs the full lean list every few cycles to reconcile", async () => {
    client.apiListJobs.mockResolvedValue(okList([openJob]));

    render(<IncomingJobPopup />);
    await flushPolls();
    expect(screen.getByText("Engine won't start")).toBeTruthy();
    expect(client.apiListJobs).toHaveBeenCalledTimes(1);

    // tick 1 + tick 2 = status checks, tick 3 = full list again.
    await advanceOnePoll();
    await flushPolls();
    await advanceOnePoll();
    await flushPolls();
    await advanceOnePoll();
    await flushPolls();

    expect(client.apiListJobs).toHaveBeenCalledTimes(2);
  });
});
