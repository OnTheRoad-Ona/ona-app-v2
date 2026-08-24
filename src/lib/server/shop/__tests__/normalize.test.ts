import { describe, expect, it } from "vitest";
import {
  brandSlug,
  dedupKeyForVariant,
  deterministicId,
  mapExternalCategory,
  normalizeName,
  normalizePartNumber,
  normalizeSku,
  slugify,
} from "@/lib/server/shop/normalize";

describe("normalization", () => {
  it("normalizes brand names", () => {
    expect(normalizeName(" BOSCH Inc. ")).toBe("bosch");
    expect(normalizeName("Toyota Motor Corporation")).toBe("toyota motor");
    expect(normalizeName("")).toBe("");
  });

  it("produces stable brand slugs", () => {
    expect(brandSlug("JA Solar")).toBe("ja-solar");
    expect(brandSlug("Mercedes-Benz")).toBe("mercedes-benz");
  });

  it("normalizes part numbers and skus", () => {
    expect(normalizePartNumber(" 04465-33470 ")).toBe("04465-33470");
    expect(normalizePartNumber("A B C")).toBe("ABC");
    expect(normalizeSku("ona- demo sku")).toBe("ONA-DEMO-SKU");
  });

  it("slugifies product names deterministically", () => {
    expect(slugify("Bosch Front Brake Pads")).toBe("bosch-front-brake-pads");
    expect(slugify(" A.C. Unit ")).toBe("a-c-unit");
  });
});

describe("deterministic ids", () => {
  it("is deterministic for same input", () => {
    expect(deterministicId("a", "b")).toBe(deterministicId("a", "b"));
  });

  it("differs for different input", () => {
    expect(deterministicId("a", "b")).not.toBe(deterministicId("a", "c"));
  });

  it("ignores case and nulls", () => {
    expect(deterministicId("SKU", null, "Trade")).toBe(
      deterministicId("sku", undefined, "trade"),
    );
  });
});

describe("dedup keys one part, many sources, one Ona product", () => {
  it("same sku across sources → same key", () => {
    const a = dedupKeyForVariant({ tradeKey: "mechanic", sku: "ONA-ABC-001" });
    const b = dedupKeyForVariant({ tradeKey: "mechanic", sku: "ona-abc-001" });
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  it("same oem number → same key regardless of sku differences", () => {
    const a = dedupKeyForVariant({
      tradeKey: "mechanic",
      oemNumber: "04465-33470",
    });
    const b = dedupKeyForVariant({
      tradeKey: "mechanic",
      oemNumber: "0446533470",
    });
    expect(a).toBe(b);
  });

  it("different trades → different keys even for same oem", () => {
    const a = dedupKeyForVariant({ tradeKey: "mechanic", oemNumber: "12345" });
    const b = dedupKeyForVariant({ tradeKey: "body", oemNumber: "12345" });
    expect(a).not.toBe(b);
  });

  it("null when no identity present", () => {
    expect(dedupKeyForVariant({ tradeKey: "mechanic" })).toBeNull();
  });
});

describe("external category mapping", () => {
  it("maps external category → trade/category/subcategory/product-type", () => {
    const m = mapExternalCategory({
      externalCategory: "Automotive > Brakes > Brake Pads",
      tradeKey: "mechanic",
    });
    expect(m.categorySlug).toBe("automotive");
    expect(m.subcategorySlug).toBe("brakes");
    expect(m.productType).toBe("automotive");
  });

  it("tolerates missing external category", () => {
    const m = mapExternalCategory({
      externalCategory: null,
      tradeKey: "solar",
    });
    expect(m).toEqual({});
  });
});
