import { describe, expect, it } from "vitest";
import { interpretShopQuery } from "@/lib/server/shop/intent";

describe("interpretShopQuery", () => {
  it("extracts toyota camry brake pad intent", () => {
    const i = interpretShopQuery("Toyota Camry 2020 front brake pad");
    expect(i.make).toBe("toyota");
    expect(i.model).toBe("camry");
    expect(i.year).toBe(2020);
    expect(i.position).toBe("front");
    expect(i.tradeKey).toBe("mechanic");
    expect(i.productHints.some((h) => h.includes("brake"))).toBe(true);
  });

  it("maps everyday language to brakes/mechanic", () => {
    const i = interpretShopQuery("thing that stops my car");
    expect(i.tradeKey).toBe("mechanic");
  });

  it("parses solar inverter specs", () => {
    const i = interpretShopQuery("5kva solar inverter 48v");
    expect(i.tradeKey).toBe("solar");
    expect(i.specs.kva).toBe(5);
    expect(i.specs.voltage).toBe(48);
    expect(i.productHints).toContain("inverter");
  });

  it("maps any tyre-size query to the vulcanizer trade with canonical specs", () => {
    const i = interpretShopQuery("205 55 16");
    expect(i.tradeKey).toBe("vulcanizer");
    expect(i.tyreSize).toBe("205/55R16");
    expect(i.specs.tireWidth).toBe(205);
    expect(i.specs.aspectRatio).toBe(55);
    expect(i.specs.rimSize).toBe(16);
    expect(i.productHints).toContain("tire");
  });

  it("unifies tyre punqctuation forms into one canonical size", () => {
    const a = interpretShopQuery("205/55 R16");
    const b = interpretShopQuery("205/55R16");
    const c = interpretShopQuery("205 55 16");
    expect(a.tyreSize).toBe("205/55R16");
    expect(b.tyreSize).toBe(a.tyreSize);
    expect(c.tyreSize).toBe(a.tyreSize);
  });

  it("flags tyre/tire and vulcanizer/vulcaniser as synonyms", () => {
    expect(interpretShopQuery("tire seals").tyreSynonymExpanded).toBe(true);
    expect(interpretShopQuery("vulcaniser").tyreSynonymExpanded).toBe(true);
    expect(interpretShopQuery("brake pads").tyreSynonymExpanded).toBe(false);
  });
});
