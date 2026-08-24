import { describe, expect, it } from "vitest";
import {
  catalogMeta,
  composeGeneratorMachineLabel,
  filterGeneratorOptions,
  GEN_CATALOG_TYPES,
  getBrandsForType,
  getModelsForTypeBrand,
  inferGeneratorFuel,
  knownGeneratorFuel,
} from "@/lib/generator/catalog";

describe("generator catalog", () => {
  it("seeds three types with brands and models", () => {
    expect(GEN_CATALOG_TYPES.map((t) => t.id)).toEqual([
      "petrol",
      "diesel",
      "inverter",
    ]);
    const meta = catalogMeta();
    expect(meta.types).toBe(3);
    expect(meta.brands).toBeGreaterThan(40);
    expect(meta.models).toBeGreaterThan(150);
    expect(getBrandsForType("petrol")).toContain("Elepaq");
    expect(getBrandsForType("diesel")).toContain("Mikano");
    expect(getModelsForTypeBrand("petrol", "Elepaq").length).toBeGreaterThan(3);
    expect(
      getModelsForTypeBrand("diesel", "Perkins").some((m) => /kVA/i.test(m)),
    ).toBe(true);
  });

  it("searches brands and models from either end of the string", () => {
    const brands = filterGeneratorOptions(
      getBrandsForType("petrol"),
      "fir",
      20,
    );
    expect(brands.some((b) => /firman/i.test(b))).toBe(true);
    const models = filterGeneratorOptions(
      getModelsForTypeBrand("petrol", "Elepaq"),
      "7200",
      20,
    );
    expect(models.some((m) => /7200/.test(m))).toBe(true);
  });

  it("infers fuel so later petrol/diesel questions can skip", () => {
    expect(inferGeneratorFuel("petrol")).toBe("petrol");
    expect(inferGeneratorFuel("inverter")).toBe("petrol");
    expect(inferGeneratorFuel("diesel")).toBe("diesel");
    expect(inferGeneratorFuel("canopy")).toBeNull();
    expect(knownGeneratorFuel({ machine_type: "petrol" })).toBe("petrol");
    expect(knownGeneratorFuel({ machine_fuel: "diesel" })).toBe("diesel");
    expect(knownGeneratorFuel({ machine: "none" })).toBeNull();
  });

  it("labels catalog, none, and not-listed paths", () => {
    expect(
      composeGeneratorMachineLabel({
        mode: "catalog",
        typeId: "petrol",
        brand: "Elepaq",
        model: "SV7200 2.8kVA",
      }),
    ).toBe("Petrol · Elepaq · SV7200 2.8kVA");
    expect(composeGeneratorMachineLabel({ mode: "none" })).toMatch(
      /buying new/i,
    );
    expect(
      composeGeneratorMachineLabel({
        mode: "other",
        other: "Red 2.5kVA no name",
      }),
    ).toBe("Red 2.5kVA no name");
  });
});
