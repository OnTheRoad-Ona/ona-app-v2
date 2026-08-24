import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getServerClockAgeMs,
  refreshServerClock,
  serverNow,
  syncServerClock,
} from "@/lib/jobs/server-clock";

const SERVER = Date.parse("2026-08-04T12:00:00.000Z");

describe("server-clock (offset + freshness)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SERVER);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Runs first (before any sync) so the module still counts as "never synced".
  it("ignores invalid / missing serverNow values", () => {
    syncServerClock(null);
    syncServerClock("not-a-date");
    expect(getServerClockAgeMs()).toBe(Number.POSITIVE_INFINITY);
  });

  it("syncServerClock computes the offset from the reported server time", () => {
    syncServerClock(new Date(SERVER - 5_000).toISOString());
    expect(serverNow()).toBe(SERVER - 5_000);
    expect(getServerClockAgeMs()).toBe(0);
  });

  it("refreshServerClock skips the fetch while the estimate is fresh", async () => {
    syncServerClock(new Date(SERVER).toISOString());
    vi.setSystemTime(SERVER + 10_000); // age 10s < 30s default
    await refreshServerClock();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshServerClock re-syncs from /api/health?public=1 when stale", async () => {
    syncServerClock(new Date(SERVER).toISOString());
    vi.setSystemTime(SERVER + 60_000); // stale
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            ok: true,
            service: "ona",
            ts: new Date(SERVER + 60_000).toISOString(),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await refreshServerClock(30_000);
    expect(fetch).toHaveBeenCalledWith("/api/health?public=1", {
      cache: "no-store",
    });
    expect(serverNow()).toBe(SERVER + 60_000);
  });

  it("refreshServerClock keeps the last offset when the fetch fails", async () => {
    // Offset -5000ms: server clock runs 5s behind this device.
    syncServerClock(new Date(SERVER - 5_000).toISOString());
    vi.setSystemTime(SERVER + 60_000);
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    await refreshServerClock(30_000);
    // Offset unchanged → serverNow keeps tracking the device clock at -5s.
    expect(serverNow()).toBe(SERVER + 55_000);
  });
});
