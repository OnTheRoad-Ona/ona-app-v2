import { describe, expect, it } from "vitest";
import { parseTyreSize, expandSynonyms, isTyreSizeQuery } from "@/lib/shop/tyre-size";

describe("parseTyreSize", () => {
  it("parses the canonical slash form", () => {
    const s = parseTyreSize("Continental ContiSportContact 205/55 R16 91V");
    expect(s?.canonical).toBe("205/55R16");
    expect(s?.width).toBe(205);
    expect(s?.aspect).toBe(55);
    expect(s?.rim).toBe(16);
    expect(s?.loadIndex).toBe(91);
    expect(s?.speedRating).toBe("V");
  });

  it("parses space-separated input identically", () => {
    const a = parseTyreSize("205 55 16");
    const b = parseTyreSize("205/55R16");
    expect(a?.canonical).toBe("205/55R16");
    expect(a?.canonical).toBe(b?.canonical);
  });

  it("parses compact and hyphen forms", () => {
    expect(parseTyreSize("205/55/16")?.canonical).toBe("205/55R16");
    expect(parseTyreSize("205-55-16")?.canonical).toBe("205/55R16");
  });

  it("handles light-truck prefix and rim size", () => {
    const s = parseTyreSize("LT265/70R16");
    expect(s?.canonical).toBe("265/70R16");
    expect(s?.prefix).toBe("LT");
    expect(s?.rim).toBe(16);
  });

  it("returns null when there is no tyre-size triplet", () => {
    expect(parseTyreSize("brake pads")).toBeNull();
    expect(parseTyreSize("oil filter")).toBeNull();
    expect(parseTyreSize("battery")).toBeNull();
  });

  it("produces search tokens that unify spellings", () => {
    const s = parseTyreSize("205 55 16");
    expect(s).not.toBeNull();
    for (const t of s!.tokens) {
      expect(s!.tokens).toContain(t);
    }
    const slash = parseTyreSize("205/55R16");
    expect(s!.tokens).toEqual(slash!.tokens);
  });
});

describe("expandSynonyms", () => {
  it("expands tire to tyre", () => {
    const variants = expandSynonyms("tire repair kit");
    expect(variants.some((v) => v.includes("tyre"))).toBe(true);
  });

  it("expands vulcaniser to vulcanizer", () => {
    const variants = expandSynonyms("vulcaniser patches");
    expect(variants.some((v) => v.includes("vulcanizer"))).toBe(true);
  });

  it("returns the raw query when no synonyms match", () => {
    expect(expandSynonyms("brake pads")).toEqual(["brake pads"]);
  });
});

describe("isTyreSizeQuery", () => {
  it("detects tyre-size queries", () => {
    expect(isTyreSizeQuery("185/65 R14")).toBe(true);
    expect(isTyreSizeQuery("205 55 16")).toBe(true);
  });

  it("rejects non-tyre queries", () => {
    expect(isTyreSizeQuery("engine oil")).toBe(false);
  });
});