// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useExactCountdown } from "@/lib/jobs/use-exact-countdown";

const T0 = Date.parse("2026-08-12T09:00:00.000Z");

/**
 * Controllable server clock: `serverNow` and `refreshServerClock` are stubbed so
 * the hook's alignment step can be held open (simulating a slow/cold load) and
 * then released with a corrected offset.
 */
const clock = vi.hoisted(() => {
  let offset = 0;
  return {
    now: () => Date.now() + offset,
    setOffset: (o: number) => {
      offset = o;
    },
    releaseRefresh: null as (() => void) | null,
  };
});

vi.mock("@/lib/jobs/server-clock", () => ({
  serverNow: () => clock.now(),
  refreshServerClock: () =>
    new Promise<void>((resolve) => {
      clock.releaseRefresh = resolve;
    }),
  syncServerClock: vi.fn(),
}));

function Harness({ endsAt }: { endsAt: string }) {
  const { displayMs } = useExactCountdown(endsAt);
  return <div role="timer">{displayMs}</div>;
}

describe("useExactCountdown — starts counting only when the visuals load", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not tick on a stale clock before alignment, then corrects and ticks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    clock.setOffset(0);

    const endsAt = new Date(T0 + 10_000).toISOString();
    render(<Harness endsAt={endsAt} />);
    // Initial estimate from the (stale) clock: 10s left.
    expect(screen.getByRole("timer").textContent).toBe("10000");

    // 2s of wall time pass while the ring is still loading (clock not aligned).
    // The live tick must NOT run yet — the countdown doesn't start early.
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("10000");

    // Alignment lands: the true server time is 3s into the window, so the
    // freshly-painted value must be the real remaining 7s (not 8s from a tick).
    clock.setOffset(1_000);
    await act(async () => {
      clock.releaseRefresh?.();
      await Promise.resolve();
    });
    expect(screen.getByRole("timer").textContent).toBe("7000");

    // Now (and only now) the live tick runs: +1s → 6s.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("6000");
  });
});
