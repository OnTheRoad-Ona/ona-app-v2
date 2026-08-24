import { describe, expect, it } from "vitest";
import {
  applyTradeFilters,
  getTradeFilterConfig,
  getTradeFilters,
  getFilterConfigs,
} from "@/lib/shop/trade-filters";
import { SHOP_TRADE_KEYS } from "@/lib/shop/taxonomy";

describe("trade filter engine", () => {
  it("every trade has a filter config", () => {
    const configs = getFilterConfigs();
    expect(configs.length).toBe(SHOP_TRADE_KEYS.length);
    for (const c of configs) {
      expect(c.filters.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("solar has NO vehicle fitment filters", () => {
    const c = getTradeFilterConfig("solar")!;
    expect(c.hasVehicleFitment).toBe(false);
    const keys = c.filters.map((f) => f.key);
    expect(keys).not.toContain("vehicleMake");
    expect(keys).not.toContain("vehicleYear");
  });

  it("mechanic HAS vehicle fitment filters + trade attributes", () => {
    const c = getTradeFilterConfig("mechanic")!;
    expect(c.hasVehicleFitment).toBe(true);
    const keys = c.filters.map((f) => f.key);
    expect(keys).toContain("vehicleMake");
    expect(keys).toContain("vehicleModel");
    expect(keys).toContain("viscosity");
  });

  it("plumber has plumber attributes, not generator attributes", () => {
    const c = getTradeFilterConfig("plumber")!;
    const keys = c.filters.map((f) => f.key);
    expect(keys).toContain("diameter");
    expect(keys).toContain("connection");
    expect(keys).not.toContain("kva");
    expect(keys).not.toContain("fuelType");
  });

  it("fashion filters never include vehicle data", () => {
    const c = getTradeFilterConfig("fashion")!;
    expect(c.hasVehicleFitment).toBe(false);
    expect(c.filters.map((f) => f.key)).not.toContain("vehicleYear");
  });
});

describe("applyTradeFilters", () => {
  it("drops irrelevant filters silently", () => {
    const out = applyTradeFilters("solar", {
      category: "inverters",
      vehicleYear: "2020", // irrelevant for solar dropped
      wattage: "550",
      kva: "5", // irrelevant dropped
      availability: "in_stock",
    });
    expect(out.categorySlug).toBe("inverters");
    expect(out.attributes.wattage).toBe("550");
    expect(out.attributes.vehicleYear).toBeUndefined();
    expect(out.attributes.kva).toBeUndefined();
    expect(out.availability).toBe("in_stock");
  });

  it("keeps relevant filters only for mechanic", () => {
    const out = applyTradeFilters("mechanic", {
      category: "brakes",
      vehicleMake: "Toyota",
      position: "Front",
      viscosity: "5W-30",
      fuelType: "Diesel", // not a mechanic filter dropped
    });
    expect(out.attributes.vehicleMake).toBe("Toyota");
    expect(out.attributes.position).toBe("Front");
    expect(out.attributes.viscosity).toBe("5W-30");
    expect(out.attributes.fuelType).toBeUndefined();
  });

  it("ignores empty selections", () => {
    const out = applyTradeFilters("mechanic", {
      category: "",
      availability: "",
    });
    expect(out.categorySlug).toBeUndefined();
    expect(out.availability).toBe("all");
  });
});

describe("getTradeFilters", () => {
  it("returns standard filters first for every trade", () => {
    for (const trade of SHOP_TRADE_KEYS) {
      const filters = getTradeFilters(trade);
      expect(filters[0].key).toBe("category");
      expect(filters[1].key).toBe("price");
      expect(filters[2].key).toBe("availability");
    }
  });
});
