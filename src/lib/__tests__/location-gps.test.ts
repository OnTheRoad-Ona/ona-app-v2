import { describe, expect, it } from "vitest";
import {
  GPS_BOOT_TIMEOUT_MS,
  GPS_REFRESH_TIMEOUT_MS,
  GPS_RETRY_TIMEOUT_MS,
  GPS_TIMEOUT_FLOOR_MS,
  shouldSurfaceLocationError,
} from "@/lib/location-gps";

describe("location-gps timeouts", () => {
  it("never regresses below the 10s floor (5s caused false timeouts on reload)", () => {
    expect(GPS_BOOT_TIMEOUT_MS).toBeGreaterThanOrEqual(GPS_TIMEOUT_FLOOR_MS);
    expect(GPS_REFRESH_TIMEOUT_MS).toBeGreaterThanOrEqual(GPS_TIMEOUT_FLOOR_MS);
    expect(GPS_RETRY_TIMEOUT_MS).toBeGreaterThanOrEqual(GPS_TIMEOUT_FLOOR_MS);
  });
});

describe("shouldSurfaceLocationError", () => {
  it("always surfaces errors on an explicit user action (Retry)", () => {
    expect(
      shouldSurfaceLocationError({ silentRequest: false, hasUsableLocation: true })
    ).toBe(true);
    expect(
      shouldSurfaceLocationError({ silentRequest: false, hasUsableLocation: false })
    ).toBe(true);
  });

  it("hides errors on silent refresh when a usable location exists", () => {
    expect(
      shouldSurfaceLocationError({ silentRequest: true, hasUsableLocation: true })
    ).toBe(false);
  });

  it("surfaces errors on a silent pull only when nothing usable exists yet", () => {
    expect(
      shouldSurfaceLocationError({ silentRequest: true, hasUsableLocation: false })
    ).toBe(true);
  });
});