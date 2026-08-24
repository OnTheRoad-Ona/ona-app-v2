import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/merit/merit-engine", () => ({
  recalculateMerit: vi.fn(async () => {}),
}));

import { fireMeritRecalc } from "@/lib/server/jobs/job-store";
import { recalculateMerit } from "@/lib/server/merit/merit-engine";

const recalcMock = vi.mocked(recalculateMerit);

beforeEach(() => {
  recalcMock.mockClear();
});

describe("fireMeritRecalc MRE wiring helper", () => {
  it("fires recalculateMerit for a pro id (completed / cancelled / disputed paths)", async () => {
    await fireMeritRecalc("pro-1");
    expect(recalcMock).toHaveBeenCalledTimes(1);
    expect(recalcMock).toHaveBeenCalledWith("pro-1");
  });

  it("is a no-op when the pro id is missing or null", async () => {
    await fireMeritRecalc(undefined);
    await fireMeritRecalc(null);
    expect(recalcMock).not.toHaveBeenCalled();
  });

  it("swallows recalc failures so job transitions never break", async () => {
    recalcMock.mockRejectedValueOnce(new Error("db down"));
    await expect(fireMeritRecalc("pro-1")).resolves.toBeUndefined();
  });
});
