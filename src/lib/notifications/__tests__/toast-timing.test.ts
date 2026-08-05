import { describe, expect, it } from "vitest";
import {
  TOAST_AUTO_THROTTLE_MS,
  TOAST_VISIBLE_MS,
  canAutoShowToast,
} from "@/lib/notifications/toast-timing";

describe("canAutoShowToast", () => {
  it("allows first wave when never shown", () => {
    expect(canAutoShowToast(0, 1_000_000)).toEqual({
      allow: true,
      reason: "new_wave",
    });
  });

  it("piles during the 3s visible window", () => {
    const start = 1_000_000;
    expect(canAutoShowToast(start, start + 500)).toEqual({
      allow: true,
      reason: "pile",
    });
    expect(canAutoShowToast(start, start + TOAST_VISIBLE_MS - 1)).toEqual({
      allow: true,
      reason: "pile",
    });
  });

  it("starts a new wave once the 3s window ends", () => {
    const start = 1_000_000;
    expect(canAutoShowToast(start, start + TOAST_VISIBLE_MS)).toEqual({
      allow: true,
      reason: "new_wave",
    });
    expect(
      canAutoShowToast(start, start + TOAST_AUTO_THROTTLE_MS)
    ).toEqual({
      allow: true,
      reason: "new_wave",
    });
  });
});
