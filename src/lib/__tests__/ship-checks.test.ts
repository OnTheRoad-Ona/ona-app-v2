import { describe, expect, it } from "vitest";
import { runShipChecks } from "@/lib/ship-checks";

describe("ship-checks", () => {
  it("all in-process ship checks pass on current build", () => {
    const status = runShipChecks();
    expect(status.service).toBe("ona");
    expect(status.buildId.length).toBeGreaterThan(4);
    expect(status.checks.length).toBeGreaterThanOrEqual(5);
    const failed = status.checks.filter((c) => !c.ok);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(status.allPassed).toBe(true);
  });

  it("filters array supports .some for availability", () => {
    const status = runShipChecks();
    const row = status.checks.find((c) => c.id === "filters-has-availability");
    expect(row?.ok).toBe(true);
  });
});
