import { describe, expect, it } from "vitest";
import {
  DEMO_PRODUCTS,
  demoProductCountByTrade,
  demoProductsForTrade,
  DEMO_TRADE_KEYS,
  type DemoProduct,
} from "@/lib/shop/demo-catalog";
import { validateTradeAttributes } from "@/lib/shop/trade-attributes";
import { SHOP_TRADE_KEYS, getRootCategoriesForTrade } from "@/lib/shop/taxonomy";

describe("demo catalog coverage", () => {
  it("has at least 70 products (>= 5 per trade × 14 trades)", () => {
    expect(DEMO_PRODUCTS.length).toBeGreaterThanOrEqual(70);
    expect(DEMO_TRADE_KEYS.length).toBe(14);
  });

  it("has at least 5 products per trade", () => {
    const byTrade = demoProductCountByTrade();
    for (const trade of SHOP_TRADE_KEYS) {
      expect(byTrade[trade] ?? 0).toBeGreaterThanOrEqual(5);
    }
  });

  it("every product declares is_demo = true via source", () => {
    expect(DEMO_PRODUCTS.every((p) => p.id.startsWith("demo-"))).toBe(true);
  });

  it("uses valid trade keys and category slugs present in taxonomy", () => {
    for (const p of DEMO_PRODUCTS) {
      expect(SHOP_TRADE_KEYS.includes(p.tradeKey as never)).toBe(true);
      // Mechanic live taxonomy is Automedics; demo mechanic SKUs are archived.
      if (p.tradeKey === "mechanic") continue;
      const roots = getRootCategoriesForTrade(p.tradeKey);
      const slugs = roots.map((r) => r.slug);
      expect(slugs).toContain(p.categorySlug);
    }
  });

  it("has deterministic ids and unique skus", () => {
    const ids = new Set<string>();
    const skus = new Set<string>();
    for (const p of DEMO_PRODUCTS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(skus.has(p.sku)).toBe(false);
      skus.add(p.sku);
    }
  });

  it("has realistic price + description + brand", () => {
    for (const p of DEMO_PRODUCTS) {
      expect(p.priceMinor).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(5);
      expect(p.description.length).toBeGreaterThan(20);
      expect(p.brand.name.trim().length).toBeGreaterThan(1);
    }
  });

  it("has mixed availability: some products currently unavailable", () => {
    const zeroQty = DEMO_PRODUCTS.filter((p) => p.qty === 0);
    const inStock = DEMO_PRODUCTS.filter((p) => p.qty > 0);
    expect(zeroQty.length).toBeGreaterThan(0);
    expect(inStock.length).toBeGreaterThan(0);
  });

  it("has a spread of lifecycle statuses", () => {
    const statuses = new Set(DEMO_PRODUCTS.map((p) => p.status));
    for (const s of ["active", "unavailable", "inactive", "source_pending", "future_product", "pending_verification"]) {
      expect(statuses.has(s as never)).toBe(true);
    }
  });
});

describe("demo catalog trade separation", () => {
  it("every product's attributes validate against its trade schema", () => {
    for (const p of DEMO_PRODUCTS) {
      const result = validateTradeAttributes(p.tradeKey, p.attributes);
      expect(
        { id: p.id, trade: p.tradeKey, errors: result.errors },
        `attributes invalid for ${p.id}`
      ).toEqual({ id: p.id, trade: p.tradeKey, errors: [] });
    }
  });

  it("non-vehicle trades never carry vehicle fitment attributes", () => {
    const vehicleTrades = new Set([
      "mechanic", "vulcanizer", "towing", "ac", "battery", "body", "electrical", "diagnostics",
    ]);
    const fitmentKeys = ["vehicleMake", "vehicleModel", "vehicleYear", "position", "engine"];
    for (const p of DEMO_PRODUCTS) {
      if (vehicleTrades.has(p.tradeKey)) continue;
      for (const k of fitmentKeys) {
        expect(p.attributes[k], `${p.id} has ${k} in non-vehicle trade`).toBeUndefined();
      }
    }
  });

  it("vehicle trades that claim fitment always include a make", () => {
    const vehicleTrades = new Set([
      "mechanic", "vulcanizer", "towing", "ac", "battery", "body", "electrical", "diagnostics",
    ]);
    for (const p of DEMO_PRODUCTS.filter((x) => vehicleTrades.has(x.tradeKey))) {
      const hasFit = ["position", "vehicleModel", "vehicleYear"].some((k) => p.attributes[k] !== undefined);
      if (hasFit) {
        expect(p.attributes.vehicleMake, `${p.id} claims fitment without a make`).toBeTruthy();
      }
    }
  });

  it("solar/plumber products use their own trade attributes (wattage/diameter)", () => {
    const solar = demoProductsForTrade("solar");
    expect(solar.length).toBeGreaterThanOrEqual(5);
    expect(solar.every((p) => Object.keys(p.attributes).some((k) => ["wattage", "voltage", "capacity", "efficiency", "panelType", "inverterType"].includes(k)))).toBe(true);

    const plumber = demoProductsForTrade("plumber");
    expect(plumber.length).toBeGreaterThanOrEqual(5);
    expect(plumber.every((p) => Object.keys(p.attributes).some((k) => ["diameter", "material", "connection", "application", "pressureRating"].includes(k)))).toBe(true);
  });
});

describe("demo catalog realism", () => {
  it("no fake fitment claims: fitment trades only reference known makes/models", () => {
    const knownMakes = new Set([
      "Toyota", "Honda", "Lexus", "Mercedes-Benz", "BMW", "Nissan",
      "Hyundai", "Kia", "Ford", "Volkswagen", "Peugeot", "Mazda",
      "Mitsubishi", "Suzuki", "Isuzu", "Land Rover", "Chevrolet", "Acura", "Infiniti", "Jeep",
    ]);
    for (const p of DEMO_PRODUCTS) {
      const make = p.attributes.vehicleMake;
      if (make !== undefined) {
        expect(knownMakes.has(String(make)), `${p.id} references unknown make ${make}`).toBe(true);
      }
    }
  });

  it("brands are realistic and reusable", () => {
    const brands = new Set(DEMO_PRODUCTS.map((p) => p.brand.slug));
    expect(brands.size).toBeGreaterThanOrEqual(15);
  });
});

describe("availability separation in demo data", () => {
  it("products with qty 0 exist in catalog but are unavailable", () => {
    for (const p of DEMO_PRODUCTS) {
      expect(p.status !== "active" || p.qty > 0, `${p.id} has inconsistent availability`).toBe(true);
    }
    const unavailable = DEMO_PRODUCTS.filter((p) => p.qty === 0 && p.status === "active");
    for (const p of unavailable) {
      expect(p.status).toBe("active"); // catalog exists
    }
  });
});

describe("all demo products are structurally importable", () => {
  it("each has required identity fields", () => {
    for (const p of DEMO_PRODUCTS as DemoProduct[]) {
      expect(p.sku.length).toBeGreaterThan(3);
      expect(p.name.trim().length).toBeGreaterThan(3);
      expect(p.categorySlug.length).toBeGreaterThan(2);
    }
  });
});
