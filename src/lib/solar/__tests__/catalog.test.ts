import { describe, expect, it } from "vitest";
import {
  composeSolarMachineLabel,
  filterSolarOptions,
  SOLAR_CATALOG_TYPES,
  getSolarBrandsForType,
  getSolarModelsForTypeBrand,
  solarCatalogMeta,
} from "@/lib/solar/catalog";

describe("solar catalog", () => {
  it("seeds three system types with brands and models", () => {
    expect(SOLAR_CATALOG_TYPES.map((t) => t.id)).toEqual([
      "inverter",
      "hybrid",
      "off-grid",
    ]);
    const meta = solarCatalogMeta();
    expect(meta.types).toBe(3);
    expect(meta.brands).toBeGreaterThan(10);
    expect(meta.models).toBeGreaterThan(50);
    expect(getSolarBrandsForType("inverter")).toContain("Meritin");
    expect(getSolarBrandsForType("hybrid")).toContain("Deye");
    expect(
      getSolarModelsForTypeBrand("hybrid", "Deye").some((m) => /kW/i.test(m)),
    ).toBe(true);
    expect(getSolarModelsForTypeBrand("inverter", "Nope")).toEqual([]);
  });

  it("searches brands and models from either end of the string", () => {
    const brands = filterSolarOptions(
      getSolarBrandsForType("hybrid"),
      "dey",
      20,
    );
    expect(brands.some((b) => /deye/i.test(b))).toBe(true);
    const models = filterSolarOptions(
      getSolarModelsForTypeBrand("hybrid", "Deye"),
      "5k",
      20,
    );
    expect(models.some((m) => /5K/.test(m))).toBe(true);
  });

  it("labels catalog, none, and not-listed paths", () => {
    expect(composeSolarMachineLabel({ mode: "none" })).toBe(
      "I don't have one yet / buying new",
    );
    expect(
      composeSolarMachineLabel({ mode: "other", other: "Old 2.5kVA" }),
    ).toBe("Old 2.5kVA");
    expect(
      composeSolarMachineLabel({
        mode: "catalog",
        typeId: "hybrid",
        brand: "Deye",
        model: "SUN-5K-SG04LP1 5kW",
      }),
    ).toContain("Hybrid solar system · Deye");
  });
});
