import { describe, expect, it } from "vitest";
import { shopUiScopeFromViewer } from "@/lib/server/market-scope";
import {
  LISTING_FILTER_CHIPS,
  deriveListingStatus,
  listingIsPurchasable,
} from "@/lib/shop/listing-status";
import { walkMechanicCategories } from "@/lib/shop/mechanic-taxonomy";

describe("shopUiScopeFromViewer", () => {
  it("customer gets full market", () => {
    const s = shopUiScopeFromViewer({ trade: null, isPro: false });
    expect(s.allowedTradeKeys).toBeNull();
    expect(s.shopTitle).toBe("Shop");
    expect(s.allowBrowseAllParts).toBe(true);
  });

  it("mechanic pro gets Mechanic Shop only + ALL PARTS", () => {
    const s = shopUiScopeFromViewer({ trade: "mechanic", isPro: true });
    expect(s.allowedTradeKeys).toEqual(["mechanic"]);
    expect(s.shopTitle).toBe("Mechanic Shop");
    expect(s.allowBrowseAllParts).toBe(true);
    expect(s.defaultTradeKey).toBe("mechanic");
  });

  it("plumber pro cannot browse ALL PARTS or other trades", () => {
    const s = shopUiScopeFromViewer({ trade: "plumber", isPro: true });
    expect(s.allowedTradeKeys).toEqual(["plumber"]);
    expect(s.allowBrowseAllParts).toBe(false);
  });

  it("vulcanizer pro gets the Vulcanizer Shop only (tyres/tubes)", () => {
    const s = shopUiScopeFromViewer({ trade: "vulcanizer", isPro: true });
    expect(s.allowedTradeKeys).toEqual(["vulcanizer"]);
    expect(s.shopTitle).toBe("Vulcanizer Shop");
    expect(s.defaultTradeKey).toBe("vulcanizer");
    expect(s.allowBrowseAllParts).toBe(false);
    expect(
      s.allowedTradeKeys!.some((t) => t === "mechanic" || t === "plumber")
    ).toBe(false);
  });

  it("every pro is capped to exactly one trade (single-seller Ona shop)", () => {
    for (const trade of ["mechanic", "vulcanizer", "battery", "solar", "plumber"] as const) {
      const s = shopUiScopeFromViewer({ trade, isPro: true });
      expect(s.allowedTradeKeys).toEqual([trade]);
      expect(s.accountContext).toBe("professional");
    }
  });
});

describe("listing status", () => {
  it("has ALL + five statuses", () => {
    expect(LISTING_FILTER_CHIPS).toHaveLength(6);
    expect(LISTING_FILTER_CHIPS[0].key).toBe("all");
  });

  it("derives low_stock and out_of_stock", () => {
    expect(deriveListingStatus({ qty: 0, reorderLevel: 5 })).toBe(
      "out_of_stock"
    );
    expect(deriveListingStatus({ qty: 3, reorderLevel: 5 })).toBe("low_stock");
    expect(deriveListingStatus({ qty: 20, reorderLevel: 5 })).toBe("available");
  });

  it("availability statuses are not always purchasable", () => {
    expect(listingIsPurchasable("out_of_stock")).toBe(false);
    expect(listingIsPurchasable("available")).toBe(true);
    expect(listingIsPurchasable("pre_order")).toBe(true);
  });
});

describe("mechanic taxonomy", () => {
  it("has 30 root category branches", () => {
    const roots = walkMechanicCategories().filter((c) => c.depth === 0);
    expect(roots.length).toBe(30);
  });

  it("has many subcategories", () => {
    const kids = walkMechanicCategories().filter((c) => c.depth === 1);
    expect(kids.length).toBeGreaterThan(100);
  });
});
