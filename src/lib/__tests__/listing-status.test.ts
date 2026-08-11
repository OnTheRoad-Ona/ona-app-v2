import { describe, expect, it } from "vitest";
import {
  productStatusesForListing,
  listingMatchesCard,
  LISTING_STATUSES,
} from "@/lib/shop/listing-status";

describe("productStatusesForListing", () => {
  it("keeps active for in-shelf filters", () => {
    expect(productStatusesForListing("all")).toBeNull();
    expect(productStatusesForListing("available")).toEqual(["active"]);
    expect(productStatusesForListing("low_stock")).toEqual(["active"]);
    expect(productStatusesForListing("out_of_stock")).toEqual(["active"]);
  });

  it("widens the status set to catalog lifecycle statuses for the other chips", () => {
    expect(productStatusesForListing("pre_order")).toEqual(["future_product"]);
    expect(productStatusesForListing("coming_soon")).toEqual([
      "future_product",
      "source_pending",
      "pending_verification",
    ]);
  });
});

describe("listingMatchesCard", () => {
  it("matches all by default", () => {
    expect(listingMatchesCard({ inStock: false }, "all")).toBe(true);
  });

  it("available = in stock", () => {
    expect(listingMatchesCard({ inStock: true, status: "active" }, "available")).toBe(true);
    expect(listingMatchesCard({ inStock: false, status: "active" }, "available")).toBe(false);
  });

  it("low_stock matches label", () => {
    expect(listingMatchesCard({ inStock: true, availabilityLabel: "In stock", status: "active" }, "low_stock")).toBe(false);
  });

  it("out_of_stock excludes coming/preorder", () => {
    expect(listingMatchesCard({ inStock: false, status: "active" }, "out_of_stock")).toBe(true);
    expect(listingMatchesCard({ inStock: false, status: "future_product" }, "out_of_stock")).toBe(false);
  });

  it("coming_soon matches future products", () => {
    expect(listingMatchesCard({ inStock: false, status: "future_product" }, "coming_soon")).toBe(true);
  });

  it("pre_order matches preorder label", () => {
    expect(listingMatchesCard({ inStock: false, availabilityLabel: "Pre-order", status: "active" }, "pre_order")).toBe(true);
  });
});

describe("LISTING_STATUSES", () => {
  it("defines all five statuses + all filter", () => {
    expect(LISTING_STATUSES).toHaveLength(5);
    expect(LISTING_STATUSES).toEqual([
      "available",
      "low_stock",
      "out_of_stock",
      "pre_order",
      "coming_soon",
    ]);
  });
});