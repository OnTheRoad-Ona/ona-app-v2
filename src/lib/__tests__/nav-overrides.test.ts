import { describe, expect, it, vi } from "vitest";
import {
  applyNavOverrides,
  NAV_SCHEMA,
  PROTECTED_NAV_IDS,
  navIdForHref,
} from "@/lib/nav-schema";

type Row = { href: string; labelKey: string; icon: string };

const clientRows: Row[] = [
  { href: "/", labelKey: "nav.dashboard", icon: "dashboard" },
  { href: "/history", labelKey: "nav.history", icon: "history" },
  { href: "/profile", labelKey: "nav.profile", icon: "profile" },
  { href: "/wallet", labelKey: "nav.referralEarn", icon: "referral" },
  { href: "/settings", labelKey: "menu.settings", icon: "settings" },
  { href: "/shop", labelKey: "nav.myShop", icon: "shop" },
  { href: "/express", labelKey: "nav.onaExpress", icon: "express" },
];

describe("applyNavOverrides, whitelist safety", () => {
  it("passes the compiled nav through untouched when overrides are empty", () => {
    expect(applyNavOverrides(clientRows, {})).toEqual(clientRows);
    expect(applyNavOverrides(clientRows, undefined)).toEqual(clientRows);
  });

  it("can hide a non-protected row", () => {
    const out = applyNavOverrides(clientRows, { wallet: { hidden: true } });
    expect(out.some((r) => r.href === "/wallet")).toBe(false);
    expect(out).toHaveLength(clientRows.length - 1);
  });

  it("can NEVER hide protected rows (home/dashboard/settings)", () => {
    const out = applyNavOverrides(clientRows, {
      home: { hidden: true },
      settings: { hidden: true },
      dashboard: { hidden: true },
    });
    for (const protectedHref of ["/", "/settings"]) {
      expect(out.some((r) => r.href === protectedHref)).toBe(true);
    }
  });

  it("ignores unknown ids, config can never invent or drop rows", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = applyNavOverrides(clientRows, {
      nonsense: { hidden: true },
      "made-up": { order: 1 },
    });
    expect(out).toEqual(clientRows);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reorders rows by explicit order values", () => {
    const out = applyNavOverrides(clientRows, {
      shop: { order: 0 },
      home: { order: 99 },
    });
    expect(out[0].href).toBe("/shop");
    expect(out[out.length - 1].href).toBe("/");
  });

  it("relabels rows via labelOverride", () => {
    const out = applyNavOverrides(clientRows, {
      history: { label: "My Jobs" },
    }) as Array<Row & { labelOverride?: string }>;
    const history = out.find((r) => r.href === "/history");
    expect(history?.labelOverride).toBe("My Jobs");
  });

  it("never returns an empty menu", () => {
    const overrides: Record<string, { hidden: boolean }> = {};
    for (const row of NAV_SCHEMA.filter((r) => r.role === "client")) {
      overrides[row.id] = { hidden: true };
    }
    const out = applyNavOverrides(clientRows, overrides);
    expect(out.length).toBeGreaterThan(0);
  });

  it("resolves the My Shop deep-link href to the shop id", () => {
    expect(navIdForHref("/shop/c/solar", "pro", "/shop/c/solar")).toBe("shop");
    expect(navIdForHref("/shop", "client")).toBe("shop");
    expect(navIdForHref("/nope", "client")).toBeNull();
  });

  it("schema covers every compiled row href (client + pro)", () => {
    const clientIds = NAV_SCHEMA.filter((r) => r.role === "client").map(
      (r) => r.id,
    );
    const proIds = NAV_SCHEMA.filter((r) => r.role === "pro").map((r) => r.id);
    expect(clientIds).toContain("shop");
    expect(proIds).toContain("payments");
    for (const id of PROTECTED_NAV_IDS) {
      expect(clientIds.concat(proIds)).toContain(id);
    }
  });
});
