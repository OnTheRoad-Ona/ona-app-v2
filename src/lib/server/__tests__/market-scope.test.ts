import { afterEach, describe, it, expect, vi } from "vitest";
import {
  marketTradeForRole,
  resolveMarketViewer,
} from "@/lib/server/market-scope";
import * as authUtils from "@/lib/server/auth-utils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("marketTradeForRole", () => {
  it("returns null for motorist (full market)", () => {
    expect(marketTradeForRole("motorist", "mechanic")).toBe(null);
  });

  it("returns null for guests (null role)", () => {
    expect(marketTradeForRole(null, "plumber")).toBe(null);
  });

  it("returns null for admin (full market)", () => {
    expect(marketTradeForRole("admin", "painter")).toBe(null);
  });

  it("returns the primary trade for a repair_pro", () => {
    expect(marketTradeForRole("repair_pro", "mechanic")).toBe("mechanic");
    expect(marketTradeForRole("repair_pro", "solar")).toBe("solar");
  });

  it("returns null for a repair_pro without a trade", () => {
    expect(marketTradeForRole("repair_pro", null)).toBe(null);
    expect(marketTradeForRole("repair_pro", undefined)).toBe(null);
  });

  it("returns null for an unknown/invalid trade value", () => {
    expect(marketTradeForRole("repair_pro", "not-a-trade")).toBe(null);
  });
});

describe("resolveMarketViewer", () => {
  it("bounds a repair_pro caller to their primary trade", async () => {
    vi.spyOn(authUtils, "getUserFromRequest").mockResolvedValue({
      id: "pro-1",
    } as never);

    const called: string[] = [];
    const sb = {
      from: (t: string) => {
        called.push(t);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                t === "repair_pro_profiles"
                  ? { data: { primary_service: "plumber" } }
                  : { data: { role: "repair_pro" } },
            }),
          }),
        };
      },
    };

    const result = await resolveMarketViewer({} as Request, sb as never);
    expect(result.userId).toBe("pro-1");
    expect(result.trade).toBe("plumber");
    expect(called).toEqual(["profiles", "repair_pro_profiles"]);
  });

  it("keeps the full market for a motorist caller", async () => {
    vi.spyOn(authUtils, "getUserFromRequest").mockResolvedValue({
      id: "m-1",
    } as never);
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: "motorist" } }),
          }),
        }),
      }),
    };
    const result = await resolveMarketViewer({} as Request, sb as never);
    expect(result.userId).toBe("m-1");
    expect(result.trade).toBe(null);
  });

  it("returns nulls for a guest caller", async () => {
    vi.spyOn(authUtils, "getUserFromRequest").mockResolvedValue(null);
    const result = await resolveMarketViewer({} as Request);
    expect(result.userId).toBe(null);
    expect(result.trade).toBe(null);
  });

  it("falls back safely on errors", async () => {
    vi.spyOn(authUtils, "getUserFromRequest").mockRejectedValue(
      new Error("boom"),
    );
    const result = await resolveMarketViewer({} as Request);
    expect(result.userId).toBe(null);
    expect(result.trade).toBe(null);
  });
});
