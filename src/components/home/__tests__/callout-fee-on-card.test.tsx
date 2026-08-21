// @vitest-environment jsdom
/**
 * Guards the Call Out Fee line on the Repair Pro incoming panel card:
 * - once a CALCULATED quote loads, "Call Out Fee" + amount render above the
 *   action buttons;
 * - a network blip (thrown fetch) must not kill the quote poll — the fee must
 *   still appear on the next successful tick.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomingJobPopup } from "@/components/home/incoming-job-popup";
import { INCOMING_POPUP_STATUS_POLL_MS } from "@/components/home/incoming-job-popup";
import { resetCalloutQuoteCache } from "@/lib/callout/use-job-callout";
import type { JobRecord } from "@/lib/jobs/types";

const routerPush = vi.fn();
const client = vi.hoisted(() => ({
  apiListJobs: vi.fn(),
  apiProIncomingStatus: vi.fn(),
  apiGetJob: vi.fn(),
  apiTransition: vi.fn(),
  apiDeferJob: vi.fn(),
  apiSurfaceJob: vi.fn(() => Promise.resolve({ ok: true })),
  apiGetCallout: vi.fn(),
}));
const canNotify = vi.hoisted(() => vi.fn(() => false));
const showAppNotification = vi.hoisted(() => vi.fn());
const realtime = vi.hoisted(() => {
  let listener: ((payload: unknown) => void) | null = null;
  return {
    subscribeJobs: (_userId: string, onChange: (p: unknown) => void) => {
      listener = onChange;
      return () => {
        listener = null;
      };
    },
    emit: (payload: unknown) => listener?.(payload),
  };
});

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

vi.mock("@/lib/supabase/app-api", () => ({
  backendSubscribeJobs: (userId: string, onChange: (p: unknown) => void) =>
    realtime.subscribeJobs(userId, onChange),
}));

vi.mock("@/lib/jobs/client", () => client);

vi.mock("@/lib/jobs/server-clock", () => ({
  refreshServerClock: vi.fn(async () => {}),
  serverNow: () => Date.now(),
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

const NOW = Date.parse("2026-08-20T10:00:00.000Z");
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

const calculatedQuote = {
  requestId: "j1",
  calloutEligible: true,
  calloutStatus: "CALCULATED",
  tradeId: "mechanic",
  tradeBaseFee: 1000,
  distanceRate: 250,
  approvedRouteDistanceKm: 0,
  billableDistanceKm: 0,
  distanceCharge: 0,
  calloutFee: 1000,
  currency: "NGN",
  originLatitude: null,
  originLongitude: null,
  destinationLatitude: 6.5,
  destinationLongitude: 3.4,
  routeSource: "estimate",
  calculatedAt: new Date(NOW).toISOString(),
  lockedAt: null,
  urgencyKind: "normal",
  urgencyMultiplier: 1,
};

beforeEach(() => {
  sessionStorage.clear();
  resetCalloutQuoteCache();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  client.apiGetJob.mockResolvedValue(okList([openJob]));
  client.apiListJobs
    .mockResolvedValueOnce(okList([openJob]))
    .mockResolvedValue(okList([]));
  client.apiProIncomingStatus.mockResolvedValue(
    okStatus([statusSnapshot()])
  );
  client.apiGetCallout.mockResolvedValue({
    ok: true,
    data: { quote: calculatedQuote, labour: { proBaseMajor: null, agreedMajor: null, currency: "NGN" } },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const flushPolls = async () => {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
};

const expandPanel = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("dialog"));
    await Promise.resolve();
  });
};

describe("Call Out Fee on the incoming panel card", () => {
  it("renders the Call Out Fee line once the quote loads", async () => {
    render(<IncomingJobPopup />);
    await flushPolls();
    await expandPanel();
    expect(screen.getByText("Engine won't start")).toBeTruthy();

    // The section is always present — shows a loading state until the quote
    // lands, so it is never "removed" from the card.
    expect(screen.getByText("Call Out Fee")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(INCOMING_POPUP_STATUS_POLL_MS);
      await Promise.resolve();
    });
    await flushPolls();

    expect(client.apiGetCallout).toHaveBeenCalledWith("j1");
    expect(screen.getByText("Call Out Fee")).toBeTruthy();
    expect(screen.getByText("₦1,000")).toBeTruthy();
  });

  it("survives a network blip: a thrown fetch must not kill the quote poll", async () => {
    client.apiGetCallout
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValue({
        ok: true,
        data: { quote: calculatedQuote, labour: { proBaseMajor: null, agreedMajor: null, currency: "NGN" } },
      });

    render(<IncomingJobPopup />);
    await flushPolls();
    await expandPanel();
    expect(screen.getByText("Engine won't start")).toBeTruthy();

    // First fetch rejects (network blip) → the section stays visible in its
    // loading state and the poll must continue and fetch again.
    expect(screen.getByText("Call Out Fee")).toBeTruthy();
    expect(screen.getByText("Calculating…")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(3100);
      await Promise.resolve();
    });
    await flushPolls();

    expect(client.apiGetCallout).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Call Out Fee")).toBeTruthy();
    expect(screen.getByText("₦1,000")).toBeTruthy();
    expect(screen.queryByText("Calculating…")).toBeNull();
  });

  it("computes the open trade's fee when the quote is not payable (never ₦0)", async () => {
    client.apiGetCallout.mockResolvedValue({
      ok: true,
      data: {
        quote: {
          ...calculatedQuote,
          calloutEligible: false,
          calloutStatus: "NOT_ELIGIBLE",
          calloutFee: null,
        },
        labour: { proBaseMajor: null, agreedMajor: null, currency: "NGN" },
      },
    });

    render(<IncomingJobPopup />);
    await flushPolls();
    await expandPanel();
    expect(screen.getByText("Engine won't start")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(INCOMING_POPUP_STATUS_POLL_MS);
      await Promise.resolve();
    });
    await flushPolls();

    // The section must never go blank: label is forced, and the fee falls back
    // to the open trade instead of ₦0. With 0 distance the short-distance rule
    // applies (×0.40): mechanic 3000×0.4 + 0.5km×350×0.4 = ₦1,270.
    expect(screen.getByText("Call Out Fee")).toBeTruthy();
    expect(screen.getByText("₦1,270")).toBeTruthy();
  });

  it("forces the Night ×1.5 multiplier on the fallback fee at night", async () => {
    // 22:00 UTC = 23:00 Lagos (night band). Even though the quote is not
    // payable, the fallback must carry ×1.5 — the urgency feature never fails.
    const NIGHT = Date.parse("2026-08-20T22:00:00.000Z");
    vi.setSystemTime(NIGHT);
    const nightDeadline = new Date(NIGHT + 60_000).toISOString();
    const nightEndsAt = new Date(NIGHT + 90_000).toISOString();
    const nightJob = {
      ...openJob,
      pairingDeadline: nightDeadline,
      negotiateEndsAt: nightEndsAt,
    } as unknown as JobRecord;
    client.apiListJobs.mockReset();
    client.apiListJobs
      .mockResolvedValueOnce(okList([nightJob]))
      .mockResolvedValue(okList([]));
    client.apiProIncomingStatus.mockReset();
    client.apiProIncomingStatus.mockResolvedValue(
      okStatus([
        statusSnapshot({
          pairingDeadline: nightDeadline,
          negotiateEndsAt: nightEndsAt,
        }),
      ])
    );
    client.apiGetCallout.mockResolvedValue({
      ok: true,
      data: {
        quote: {
          ...calculatedQuote,
          calloutEligible: false,
          calloutStatus: "NOT_ELIGIBLE",
          calloutFee: null,
        },
        labour: { proBaseMajor: null, agreedMajor: null, currency: "NGN" },
      },
    });

    render(<IncomingJobPopup />);
    await flushPolls();
    await expandPanel();
    expect(screen.getByText("Engine won't start")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(INCOMING_POPUP_STATUS_POLL_MS);
      await Promise.resolve();
    });
    await flushPolls();

    // mechanic (3000×0.4 + 0.5×350×0.4) × 1.5 = ₦1,905
    expect(screen.getByText("Call Out Fee")).toBeTruthy();
    expect(screen.getByText("₦1,905")).toBeTruthy();
  });
});