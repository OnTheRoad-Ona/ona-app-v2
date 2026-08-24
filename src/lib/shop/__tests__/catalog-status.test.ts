import { describe, expect, it } from "vitest";
import {
  availabilityState,
  unavailableReason,
  CATALOG_EXISTING_STATUSES,
  PURCHASABLE_STATUSES,
} from "@/lib/shop/catalog-status";

describe("availability separation", () => {
  it("an active + priced + stocked product is available", () => {
    const a = availabilityState({
      status: "active",
      priced: true,
      inStock: true,
    });
    expect(a.exists).toBe(true);
    expect(a.available).toBe(true);
    expect(a.label).toBe("In stock");
  });

  it("an active catalog product with no stock is unavailable, NOT non-existent", () => {
    const a = availabilityState({
      status: "active",
      priced: true,
      inStock: false,
    });
    expect(a.exists).toBe(true);
    expect(a.available).toBe(false);
    expect(a.label).toBe("Currently unavailable");
    expect(a.exists).toBe(true);
  });

  it("an active product with no price is unavailable", () => {
    const a = availabilityState({
      status: "active",
      priced: false,
      inStock: true,
    });
    expect(a.available).toBe(false);
    expect(
      unavailableReason({ status: "active", priced: false, inStock: true }),
    ).toBe("No price has been set yet");
  });

  it("future_product exists in catalog but is not purchasable", () => {
    const a = availabilityState({
      status: "future_product",
      priced: true,
      inStock: true,
    });
    expect(a.exists).toBe(true);
    expect(a.purchasable).toBe(false);
    expect(a.available).toBe(false);
    expect(a.label).toBe("Coming soon");
  });

  it("source_pending exists but is not purchasable", () => {
    const a = availabilityState({
      status: "source_pending",
      priced: false,
      inStock: false,
    });
    expect(a.exists).toBe(true);
    expect(a.label).toBe("Awaiting source");
  });

  it("unavailable status label is clear", () => {
    const a = availabilityState({
      status: "unavailable",
      priced: false,
      inStock: false,
    });
    expect(a.label).toBe("Currently unavailable");
  });

  it("catalog existing statuses never include draft/archived", () => {
    expect(CATALOG_EXISTING_STATUSES.has("active")).toBe(true);
    expect(CATALOG_EXISTING_STATUSES.has("unavailable")).toBe(true);
    expect(CATALOG_EXISTING_STATUSES.has("draft")).toBe(false);
    expect(CATALOG_EXISTING_STATUSES.has("archived")).toBe(false);
  });

  it("only active is purchasable", () => {
    expect(PURCHASABLE_STATUSES.has("active")).toBe(true);
    expect(PURCHASABLE_STATUSES.has("unavailable")).toBe(false);
    expect(PURCHASABLE_STATUSES.has("discontinued")).toBe(false);
  });
});
