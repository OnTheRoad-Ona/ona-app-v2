// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoCalloutUrgency } from "@/lib/callout/use-auto-urgency";

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Auto-highlights the best-fit urgency bar until the customer taps a chip.
 * Uses Lagos time for the Night band (Lagos = UTC+1, no DST).
 */
describe("useAutoCalloutUrgency", () => {
  it("auto-selects Emergency for an unsafe diagnosis in daytime", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-18T12:00:00Z")); // 13:00 Lagos
    const { result } = renderHook(() =>
      useAutoCalloutUrgency({ unsafe: true, distanceKm: 1 }),
    );
    expect(result.current.urgency).toBe("emergency");
  });

  it("auto-selects Night during Lagos night hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-18T21:30:00Z")); // 22:30 Lagos
    const { result } = renderHook(() =>
      useAutoCalloutUrgency({ unsafe: false, distanceKm: 1 }),
    );
    expect(result.current.urgency).toBe("night");
  });

  it("auto-selects Remote for a 4.98 km nearest pro in daytime", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-18T12:00:00Z"));
    const { result } = renderHook(() =>
      useAutoCalloutUrgency({ unsafe: false, distanceKm: 4.98 }),
    );
    expect(result.current.urgency).toBe("remote");
  });

  it("a tapped chip locks the choice even if the auto value later changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-18T12:00:00Z"));
    const { result, rerender } = renderHook(
      ({ unsafe }: { unsafe: boolean }) =>
        useAutoCalloutUrgency({ unsafe, distanceKm: 1 }),
      { initialProps: { unsafe: false } },
    );
    expect(result.current.urgency).toBe("normal");
    act(() => result.current.setUrgency("remote"));
    rerender({ unsafe: true });
    expect(result.current.urgency).toBe("remote");
  });

  it("restoreUrgency leaves a saved normal alone so auto still applies", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-18T12:00:00Z"));
    const { result } = renderHook(() =>
      useAutoCalloutUrgency({ unsafe: true, distanceKm: 1 }),
    );
    act(() => result.current.restoreUrgency("normal"));
    expect(result.current.urgency).toBe("emergency");
  });

  it("restoreUrgency restores and locks a deliberate non-normal choice", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-18T12:00:00Z"));
    const { result, rerender } = renderHook(
      ({ unsafe }: { unsafe: boolean }) =>
        useAutoCalloutUrgency({ unsafe, distanceKm: 1 }),
      { initialProps: { unsafe: false } },
    );
    act(() => result.current.restoreUrgency("night"));
    expect(result.current.urgency).toBe("night");
    rerender({ unsafe: true });
    expect(result.current.urgency).toBe("night");
  });

  it("resetUrgency re-arms auto-selection", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-08-18T12:00:00Z"));
    const { result, rerender } = renderHook(
      ({ unsafe }: { unsafe: boolean }) =>
        useAutoCalloutUrgency({ unsafe, distanceKm: 1 }),
      { initialProps: { unsafe: false } },
    );
    act(() => result.current.setUrgency("remote"));
    act(() => result.current.resetUrgency());
    expect(result.current.urgency).toBe("normal");
    rerender({ unsafe: true });
    expect(result.current.urgency).toBe("emergency");
  });
});
