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
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingJobPopup } from "@/components/home/incoming-job-popup";
import { INCOMING_POPUP_STATUS_POLL_MS } from "@/components/home/incoming-job-popup";
import type { JobRecord } from "@/lib/jobs/types";

const routerPush = vi.fn();
const client = vi.hoisted(() => ({
   apiListJobs: vi.fn(),
   apiProIncomingStatus: vi.fn(),
   apiGetJob: vi.fn(),
   apiTransition: vi.fn(),
   apiDeferJob: vi.fn(),
   apiSurfaceJob: vi.fn(() => Promise.resolve({ ok: true })),
   apiGetCallout: vi.fn(() => Promise.resolve({ ok: true, data: { quote: null } })),
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
  // jsdom has no pointer-capture implementation — no-op stubs are enough for
  // the panel drag gestures in these tests.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
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
    vi.advanceTimersByTime(INCOMING_POPUP_STATUS_POLL_MS);
    await Promise.resolve();
  });
};

/** Flush the async poll / present-job promise chains inside act. */
const flushPolls = async () => {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
};

/** The panel opens expanded by default (only a swipe-down collapses it). The
 *  tap simply re-expands a collapsed panel — harmless when already open. */
const expandPanel = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("dialog"));
    await Promise.resolve();
  });
};

describe("IncomingJobPopup panel three levels", () => {
  const multiQJob = {
    ...openJob,
    problem:
      "Which problem?\nEngine light\nWhat next?\nScan\nWhere?\nLagos\nWhen?\nNow",
  } as unknown as JobRecord;

  const swipe = async (dy: number) => {
    const dialog = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.pointerDown(dialog, { clientY: 200, pointerId: 1 });
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.pointerMove(dialog, { clientY: 200 + dy, pointerId: 1 });
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.pointerUp(dialog, { clientY: 200 + dy, pointerId: 1 });
      await Promise.resolve();
    });
  };

  it("middle default pages 2 Q&A per frame; swipe up shows all on the full page", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([multiQJob]))
      .mockResolvedValue(okList([]));
    render(<IncomingJobPopup />);
    await flushPolls();

    // Middle: only the first 2 rows, with a chevron to page further.
    expect(screen.getByText("Which problem?")).toBeTruthy();
    expect(screen.getByText("Engine light")).toBeTruthy();
    expect(screen.queryByText("When?")).toBeNull();
    expect(screen.getByLabelText("Show more questions")).toBeTruthy();

    await swipe(-80); // swipe up → full page
    await flushPolls();

    expect(screen.getByText("When?")).toBeTruthy();
    expect(screen.queryByLabelText("Show more questions")).toBeNull();
  });

  it("swipe down steps full → middle → collapsed; tap reopens middle", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([multiQJob]))
      .mockResolvedValue(okList([]));
    render(<IncomingJobPopup />);
    await flushPolls();
    expect(screen.getByText("Which problem?")).toBeTruthy();

    await swipe(-80); // → full
    await flushPolls();
    expect(screen.getByText("When?")).toBeTruthy();

    await swipe(80); // full → middle (one step)
    await flushPolls();
    expect(screen.getByText("Which problem?")).toBeTruthy();
    expect(screen.queryByText("When?")).toBeNull();

    await swipe(80); // middle → collapsed (peek strip)
    await flushPolls();
    expect(screen.queryByText("Which problem?")).toBeNull();
    expect(screen.getByText("1 incoming request")).toBeTruthy();

    // Tap the peek strip reopens the middle.
    await act(async () => {
      fireEvent.click(screen.getByRole("dialog"));
      await Promise.resolve();
    });
    await flushPolls();
    expect(screen.getByText("Which problem?")).toBeTruthy();
  });

  it("grabber pill steps down one level from full → middle → collapsed", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([multiQJob]))
      .mockResolvedValue(okList([]));
    render(<IncomingJobPopup />);
    await flushPolls();

    await swipe(-80); // → full
    await flushPolls();
    expect(screen.getByText("When?")).toBeTruthy();

    // Grabber at full reads "Show fewer questions" → back to middle.
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Show fewer questions"));
      await Promise.resolve();
    });
    await flushPolls();
    expect(screen.getByText("Which problem?")).toBeTruthy();
    expect(screen.queryByText("When?")).toBeNull();

    // Grabber at middle minimizes → collapsed peek.
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Minimize panel"));
      await Promise.resolve();
    });
    await flushPolls();
    expect(screen.queryByText("Which problem?")).toBeNull();
    expect(screen.getByText("1 incoming request")).toBeTruthy();
  });

  it("trackpad swipe (wheel) steps the panel up and down like the customer sheet", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([multiQJob]))
      .mockResolvedValue(okList([]));
    render(<IncomingJobPopup />);
    await flushPolls();
    expect(screen.getByText("Which problem?")).toBeTruthy();

    // deltaY > 0 = trackpad swipe up → middle → full (all rows shown).
    await act(async () => {
      fireEvent.wheel(screen.getByRole("dialog"), { deltaY: 40 });
      await Promise.resolve();
    });
    await flushPolls();
    expect(screen.getByText("When?")).toBeTruthy();

    // deltaY < 0 = trackpad swipe down → full → middle.
    await act(async () => {
      fireEvent.wheel(screen.getByRole("dialog"), { deltaY: -40 });
      await Promise.resolve();
    });
    await flushPolls();
    expect(screen.getByText("Which problem?")).toBeTruthy();
    expect(screen.queryByText("When?")).toBeNull();
  });

  it("wheel swipe over the card body (not the pill) still moves the panel at middle", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([multiQJob]))
      .mockResolvedValue(okList([]));
    render(<IncomingJobPopup />);
    await flushPolls();
    expect(screen.getByText("Which problem?")).toBeTruthy();

    const scroll = screen
      .getByText("Which problem?")
      .closest("[data-panel-scroll]")!;
    // Wheel over the body at middle → swipe up → full.
    await act(async () => {
      fireEvent.wheel(scroll, { deltaY: 40 });
      await Promise.resolve();
    });
    await flushPolls();
    expect(screen.getByText("When?")).toBeTruthy();
  });

  it("resets the card list to the top on expand so the profile picture shows first", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([multiQJob]))
      .mockResolvedValue(okList([]));
    render(<IncomingJobPopup />);
    await flushPolls();
    expect(screen.getByText("Which problem?")).toBeTruthy();

    const scroll = screen
      .getByText("Which problem?")
      .closest("[data-panel-scroll]") as HTMLDivElement;
    scroll.scrollTop = 60;

    await swipe(-80); // swipe up → full
    await flushPolls();

    // Level change scrolls back to the top — the profile picture placeholder
    // is the first thing visible, not a mid-scroll position.
    expect(scroll.scrollTop).toBe(0);
  });

  it("swallows leftover wheel momentum over the content right after expanding to full", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([multiQJob]))
      .mockResolvedValue(okList([]));
    render(<IncomingJobPopup />);
    await flushPolls();
    expect(screen.getByText("Which problem?")).toBeTruthy();

    const scroll = screen
      .getByText("Which problem?")
      .closest("[data-panel-scroll]") as HTMLDivElement;

    // Swipe up over the content → full.
    await act(async () => {
      fireEvent.wheel(scroll, { deltaY: 40 });
      await Promise.resolve();
    });
    await flushPolls();
    expect(screen.getByText("When?")).toBeTruthy();

    // Leftover expand-momentum (a swipe-down gesture) over the content must be
    // swallowed, not collapse the freshly-expanded panel.
    await act(async () => {
      fireEvent.wheel(scroll, { deltaY: -40 });
      await Promise.resolve();
    });
    await flushPolls();
    expect(screen.getByText("When?")).toBeTruthy();
    expect(scroll.scrollTop).toBe(0);
  });
});

describe("IncomingJobPopup fast status-check poll", () => {
  it("opens the panel expanded by default — no tap needed to see the card", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([openJob]))
      .mockResolvedValue(okList([]));

    render(<IncomingJobPopup />);
    await flushPolls();

    expect(screen.getByText("Engine won't start")).toBeTruthy();
  });

  it("confirm dialog warns the fee is lost if the job is not fixed", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([openJob]))
      .mockResolvedValue(okList([]));
    render(<IncomingJobPopup />);
    await flushPolls();

    await act(async () => {
      fireEvent.click(screen.getByText("I can fix this"));
      await Promise.resolve();
    });
    await flushPolls();

    expect(screen.getByText("Confirm you can fix this")).toBeTruthy();
    expect(
      screen.getByText(
        /won't get call out fee if you don't/i
      )
    ).toBeTruthy();
  });

  it("closes the confirm dialog when the request's timer elapses", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([openJob]))
      .mockResolvedValue(okList([]));
    render(<IncomingJobPopup />);
    await flushPolls();

    await act(async () => {
      fireEvent.click(screen.getByText("I can fix this"));
      await Promise.resolve();
    });
    await flushPolls();
    expect(screen.getByText("Confirm you can fix this")).toBeTruthy();

    // Pairing deadline (NOW + 60s) elapses while the dialog is open — the
    // dialog must close too, not stay pinned over the expired card.
    await act(async () => {
      vi.advanceTimersByTime(61_000);
      await Promise.resolve();
    });
    await flushPolls();

    expect(screen.queryByText("Confirm you can fix this")).toBeNull();
  });

  it("surfaces the card from the first full list, then uses the light status check", async () => {
    client.apiListJobs
      .mockResolvedValueOnce(okList([openJob]))
      .mockResolvedValue(okList([]));

    render(<IncomingJobPopup />);
    await flushPolls();
    await expandPanel();

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
    await expandPanel();
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
    await expandPanel();
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
    await expandPanel();
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
    await expandPanel();
    expect(screen.getByText("Engine won't start")).toBeTruthy();

    client.apiProIncomingStatus.mockResolvedValue(
      okStatus([
        statusSnapshot({ pairingDeadline: NEW_DEADLINE }),
      ])
    );

    await advanceOnePoll();
    await flushPolls();
    await expandPanel();

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
    await expandPanel();
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
