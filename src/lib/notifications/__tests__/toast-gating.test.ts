// @vitest-environment node
/**
 * Toast gating for notifications. The Repair Pro must ALWAYS be told a live
 * request was cancelled (top toast), even though ordinary open_job / requests
 * notifications never toast (they are handled by the incoming panel).
 */
import { describe, expect, it } from "vitest";
import {
  shouldToastNotification,
  type AppNotification,
} from "@/lib/notifications/types";

const base = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: "n1",
  userId: "p1",
  category: "requests",
  priority: "high",
  title: "Request cancelled",
  body: "Mina cancelled this request.",
  href: "/jobs/j1",
  actionType: "open_job",
  jobId: "j1",
  jobStatus: "cancelled",
  groupKey: "request-cancelled-j1",
  createdAt: new Date().toISOString(),
  ...over,
});

describe("shouldToastNotification cancellation carve-out", () => {
  it("toasts a live high-priority cancellation", () => {
    expect(shouldToastNotification(base())).toBe(true);
  });

  it("does NOT toast a low/normal priority cancellation", () => {
    expect(shouldToastNotification(base({ priority: "normal" }))).toBe(false);
  });

  it("does NOT toast ordinary open_job / requests notifications", () => {
    expect(shouldToastNotification(base({ jobStatus: "negotiating" }))).toBe(
      false,
    );
    expect(
      shouldToastNotification(
        base({ jobStatus: null, actionType: "accept_request" }),
      ),
    ).toBe(false);
  });
});
