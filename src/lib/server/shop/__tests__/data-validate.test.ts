import { describe, expect, it } from "vitest";
import { validateCatalogRecord } from "@/lib/server/shop/data-validate";
import {
  validateTradeAttributes,
  getTradeAttributeSchema,
} from "@/lib/shop/trade-attributes";

describe("validateCatalogRecord schema", () => {
  it("rejects a record with no name", () => {
    const r = validateCatalogRecord({ raw: {}, sku: "X-1" });
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.ruleKey === "schema.name")).toBe(true);
  });

  it("rejects a record with no identity (sku/oem/mpn)", () => {
    const r = validateCatalogRecord({ raw: {}, name: "Thing" });
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.ruleKey === "schema.identity")).toBe(true);
  });

  it("rejects negative price", () => {
    const r = validateCatalogRecord({
      raw: {},
      name: "P",
      sku: "S",
      priceMinor: -5,
    });
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.ruleKey === "schema.price")).toBe(true);
  });

  it("accepts a minimal valid record", () => {
    const r = validateCatalogRecord({
      raw: {},
      name: "Brake Pad",
      sku: "BP-1",
      priceMinor: 1000,
    });
    expect(r.valid).toBe(true);
  });
});

describe("validateCatalogRecord trade", () => {
  it("rejects an unknown trade key", () => {
    const r = validateCatalogRecord({
      raw: {},
      name: "P",
      sku: "S",
      tradeKey: "plumberx",
    });
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.ruleKey === "trade.known")).toBe(true);
  });

  it("rejects vehicle fitment attributes on a non-vehicle trade (solar)", () => {
    const r = validateCatalogRecord({
      raw: {},
      name: "Solar Panel",
      sku: "SP-1",
      tradeKey: "solar",
      attributes: { vehicleMake: "Toyota", wattage: 550 },
    });
    expect(r.valid).toBe(false);
    expect(
      r.issues.some(
        (i) =>
          i.ruleKey === "attribute.invalid" &&
          i.message.includes("vehicleMake") &&
          i.message.includes("solar"),
      ),
    ).toBe(true);
  });

  it("accepts solar attributes and rejects none", () => {
    const r = validateCatalogRecord({
      raw: {},
      name: "Solar Panel",
      sku: "SP-1",
      tradeKey: "solar",
      attributes: { wattage: 550, voltage: 42, panelType: "Monocrystalline" },
    });
    expect(r.valid).toBe(true);
  });
});

describe("validateCatalogRecord attributes per trade", () => {
  it("rejects unknown attributes for a trade", () => {
    const r = validateCatalogRecord({
      raw: {},
      name: "Panel",
      sku: "P-1",
      tradeKey: "plumber",
      attributes: { kva: 5, diameter: 20 },
    });
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.ruleKey === "attribute.invalid")).toBe(true);
  });

  it("requires trade-required attributes (solar wattage)", () => {
    const solar = getTradeAttributeSchema("solar");
    expect(solar?.attributes.find((a) => a.key === "wattage")?.required).toBe(
      true,
    );
    const r = validateCatalogRecord({
      raw: {},
      name: "Panel",
      sku: "P-1",
      tradeKey: "solar",
      attributes: {},
    });
    expect(r.issues.some((i) => i.ruleKey === "attribute.required")).toBe(true);
  });

  it("warns when fitment is claimed without a make (no fake fitment)", () => {
    const r = validateCatalogRecord({
      raw: {},
      name: "Shock",
      sku: "SH-1",
      tradeKey: "mechanic",
      attributes: { position: "Front", vehicleYear: 2020 },
    });
    expect(r.valid).toBe(true); // warning, not error
    expect(
      r.issues.some(
        (i) => i.ruleKey === "fitment.incomplete" && i.level === "warning",
      ),
    ).toBe(true);
  });
});

describe("validateTradeAttributes", () => {
  it("vehicle fitment is allowed for vehicle trades", () => {
    const r = validateTradeAttributes("mechanic", {
      vehicleMake: "Toyota",
      position: "Front",
    });
    expect(r.valid).toBe(true);
  });

  it("vehicle fitment is forbidden for fashion", () => {
    const r = validateTradeAttributes("fashion", { vehicleMake: "Toyota" });
    expect(r.valid).toBe(false);
  });

  it("plumber cannot require vehicle model", () => {
    const plumber = getTradeAttributeSchema("plumber");
    expect(plumber?.vehicleForbidden).toBe(true);
    expect(plumber?.vehicleFitmentKeys).toHaveLength(0);
  });
});
