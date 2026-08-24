import { describe, expect, it } from "vitest";
import {
  AUTOMEDICS_CATEGORIES,
  AUTOMEDICS_PRODUCTS,
  parseVehicleFitment,
} from "@/lib/shop/automedics-catalog";

describe("Automedics catalog", () => {
  it("has exactly the 17 required category names", () => {
    expect(AUTOMEDICS_CATEGORIES.map((c) => c.name)).toEqual([
      "Batteries",
      "Engine Oil",
      "Transmission Fluid",
      "Brake Fluid",
      "Coolant",
      "Oil Filters",
      "Air Filters",
      "Cabin Filters",
      "Brake Pads",
      "Brake Discs",
      "Brake Linings",
      "Shock Absorbers",
      "Ball Joints",
      "Stabilizer Linkages",
      "Stabilizer Rubbers & Bushings",
      "Tie Rod Ends & Sockets",
      "Other / Accessories",
    ]);
  });

  it("loads every listed SKU with unique sku and name+vehicle", () => {
    expect(AUTOMEDICS_PRODUCTS.length).toBe(193);
    const skus = new Set<string>();
    for (const p of AUTOMEDICS_PRODUCTS) {
      expect(p.sku.startsWith("ATM-")).toBe(true);
      expect(skus.has(p.sku)).toBe(false);
      skus.add(p.sku);
      expect(p.name.trim().length).toBeGreaterThan(2);
      expect(p.vehicle.trim().length).toBeGreaterThan(1);
      expect(AUTOMEDICS_CATEGORIES.some((c) => c.slug === p.categorySlug)).toBe(
        true,
      );
      if (p.sku === "ATM-ATF-DEXRON-VI") {
        expect(p.priceMajor).toBeNull();
      } else {
        expect(p.priceMajor).toBeGreaterThan(0);
      }
    }
  });

  it("keeps one of each duplicate pair", () => {
    const names = AUTOMEDICS_PRODUCTS.map((p) => p.name);
    expect(names.filter((n) => n === "Air Filter 2.7 Camry")).toHaveLength(1);
    expect(names.filter((n) => n === "Air Filter RAV4 2003")).toHaveLength(1);
    expect(names.filter((n) => n === "Ball Joint RAV4 2008")).toHaveLength(1);
    expect(names.some((n) => n.includes("(Alt)"))).toBe(false);
  });

  it("has grouped catch-all products", () => {
    const names = AUTOMEDICS_PRODUCTS.map((p) => p.name);
    expect(names.some((n) => n.includes("SCT SP106 to SP659"))).toBe(true);
    expect(names).toContain("Lower Arm Bushings A");
    expect(names).toContain("Lower Arm Bushings B");
    expect(
      AUTOMEDICS_PRODUCTS.find((p) => p.sku === "ATM-RB-BUSH-A")?.priceMajor,
    ).toBe(6000);
    expect(
      AUTOMEDICS_PRODUCTS.find((p) => p.sku === "ATM-RB-BUSH-B")?.priceMajor,
    ).toBe(15000);
  });

  it("parses vehicle fitment tags", () => {
    const g = parseVehicleFitment("General");
    expect(g.vehicleGeneral).toBe(true);
    const t = parseVehicleFitment("Toyota Camry 2010");
    expect(t.vehicleMake).toBe("Toyota");
    expect(t.vehicleModel).toBe("Camry");
    expect(t.vehicleYear).toBe(2010);
  });

  it("counts products per category", () => {
    const counts: Record<string, number> = {};
    for (const p of AUTOMEDICS_PRODUCTS) {
      counts[p.categorySlug] = (counts[p.categorySlug] || 0) + 1;
    }
    expect(counts.batteries).toBe(2);
    expect(counts["engine-oil"]).toBe(4);
    expect(counts["transmission-fluid"]).toBe(5);
    expect(counts["brake-fluid"]).toBe(2);
    expect(counts.coolant).toBe(2);
    expect(counts["oil-filters"]).toBe(26);
    expect(counts["air-filters"]).toBe(20);
    expect(counts["cabin-filters"]).toBe(1);
    expect(counts["brake-pads"]).toBe(45);
    expect(counts["brake-discs"]).toBe(5);
    expect(counts["brake-linings"]).toBe(3);
    expect(counts["shock-absorbers"]).toBe(15);
    expect(counts["ball-joints"]).toBe(21);
    expect(counts["stabilizer-linkages"]).toBe(14);
    expect(counts["stabilizer-rubbers-bushings"]).toBe(3);
    expect(counts["tie-rod-ends-sockets"]).toBe(10);
    expect(counts["other-accessories"]).toBe(15);
  });
});
