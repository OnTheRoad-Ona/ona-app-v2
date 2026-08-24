import { describe, expect, it } from "vitest";
import { computeDeliveryFee } from "@/lib/server/shop/delivery";
import { relevanceScore } from "@/lib/server/shop/search";
import type { ShopProductCard } from "@/lib/server/shop/types";

const service = { baseFeeMinor: 150000, freeAboveSubtotalMinor: 10000000 };
const defaultZone = { surchargeMinor: 0 };
const islandZone = { surchargeMinor: 50000 };

function card(over: Partial<ShopProductCard>): ShopProductCard {
  return {
    id: "p1",
    slug: "brake-pads",
    name: "Brake Pads",
    subtitle: null,
    tradeKey: "brake",
    brandName: "Toyota",
    primaryImageUrl: null,
    inStock: true,
    fromPriceMinor: 25000,
    currency: "NGN",
    attributes: undefined,
    conditionType: "new",
    ...over,
  };
}

function score(
  product: ShopProductCard,
  query: string,
  opts: {
    tokens?: string[];
    tradeKey?: string | null;
    partMatch?: "exact" | "contains" | null;
  } = {},
) {
  const tokens = opts.tokens ?? query.split(/\s+/).filter(Boolean);
  return relevanceScore({
    product,
    query,
    tokens,
    intent: { tradeKey: opts.tradeKey ?? null },
    partMatch: opts.partMatch ?? null,
  });
}

describe("computeDeliveryFee", () => {
  it("charges base fee for the default zone", () => {
    expect(
      computeDeliveryFee({ service, zone: defaultZone, subtotalMinor: 500000 }),
    ).toEqual({
      deliveryFeeMinor: 150000,
      freeDelivery: false,
    });
  });

  it("adds the island surcharge", () => {
    expect(
      computeDeliveryFee({ service, zone: islandZone, subtotalMinor: 500000 }),
    ).toEqual({
      deliveryFeeMinor: 200000,
      freeDelivery: false,
    });
  });

  it("is free above the threshold", () => {
    expect(
      computeDeliveryFee({
        service,
        zone: islandZone,
        subtotalMinor: 10_000_000,
      }),
    ).toEqual({
      deliveryFeeMinor: 0,
      freeDelivery: true,
    });
  });
});

describe("search relevanceScore (Phase 3 ladder)", () => {
  it("ranks exact name above exact part/SKU", () => {
    const name = score(card({ name: "Brake Pads" }), "Brake Pads");
    const part = score(card({ name: "Genuine Brake Pad Set" }), "BP-2040", {
      partMatch: "exact",
    });
    expect(name.reason).toBe("exact name");
    expect(part.reason).toBe("exact sku/part");
    expect(name.score).toBeGreaterThan(part.score);
  });

  it("ranks exact brand above trade above partial text", () => {
    const brand = score(
      card({ name: "Brake Pads", slug: "brake-pads", brandName: "Toyota" }),
      "Toyota",
      { tokens: ["toyota"] },
    );
    const trade = score(
      card({ name: "Brake Pads", slug: "disc-kit", tradeKey: "brake" }),
      "brake",
      { tokens: ["brake"], tradeKey: "brake" },
    );
    const partial = score(
      card({ name: "Brake Pads", slug: "disc-kit" }),
      "pad",
      { tokens: ["pad"] },
    );
    expect(brand.reason).toBe("exact brand");
    expect(brand.score).toBeGreaterThan(trade.score);
    expect(trade.score).toBeGreaterThan(partial.score);
  });

  it("ranks trade above attribute above partial text", () => {
    const trade = score(
      card({ name: "Brake Pads", slug: "friction-set", tradeKey: "brake" }),
      "brake",
      { tokens: ["brake"], tradeKey: "brake" },
    );
    const attr = score(
      card({
        name: "Brake Pads",
        slug: "friction-set",
        attributes: { size: "40mm" },
      }),
      "40mm",
      { tokens: ["40mm"] },
    );
    const partial = score(
      card({ name: "Brake Pads", slug: "friction-set" }),
      "pad",
      { tokens: ["pad"] },
    );
    expect(trade.score).toBeGreaterThan(attr.score);
    expect(attr.score).toBeGreaterThan(partial.score);
  });

  it("falls back to a weak score when nothing matches", () => {
    const r = score(card({ name: "Brake Pads", slug: "brake-pads" }), "zzzz", {
      tokens: ["zzzz"],
    });
    expect(r.score).toBe(10);
  });
});
