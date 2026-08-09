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
});
