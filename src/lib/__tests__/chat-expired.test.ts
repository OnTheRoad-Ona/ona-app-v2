import { describe, expect, it } from "vitest";
import {
  isJobEndedStatus,
  isJobHistoryOnlyStatus,
  isJobLiveShellStatus,
} from "@/lib/chat-expired";

const DISPATCH_STATUSES = [
  "waiting_for_selected",
  "selected_review",
  "sequential_pairing",
  "waiting_for_pro",
  "reserved",
];

describe("chat-expired SSPE dispatch statuses", () => {
  it.each(DISPATCH_STATUSES)(
    "%s is mid-flow: not ended, live shell, not history-only",
    (status) => {
      expect(isJobEndedStatus(status)).toBe(false);
      expect(isJobLiveShellStatus(status)).toBe(true);
      expect(isJobHistoryOnlyStatus(status)).toBe(false);
    },
  );

  it("still treats genuinely ended statuses as history-only", () => {
    for (const status of ["released", "cancelled", "expired", "refunded"]) {
      expect(isJobHistoryOnlyStatus(status)).toBe(true);
      expect(isJobLiveShellStatus(status)).toBe(false);
    }
  });

  it("keeps completed on the live shell (I’m Satisfied / release pay)", () => {
    expect(isJobLiveShellStatus("completed")).toBe(true);
    expect(isJobHistoryOnlyStatus("completed")).toBe(false);
  });
});
