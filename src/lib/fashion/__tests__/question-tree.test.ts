import { describe, expect, it } from "vitest";
import {
  canAdvanceText,
  canFindFashionPro,
  composeFashionProblem,
  FASHION_FINAL_COPY,
  FASHION_MAX_PHOTOS,
  FASHION_MIN_PHOTOS,
  FASHION_SCREENS,
  FASHION_START_OPTIONS,
  FASHION_START_QUESTION,
  fashionBreadcrumb,
  fashionScreen,
  nextFashionScreen,
  resolveFashionRoute,
} from "@/lib/fashion/question-tree";

describe("fashion (tailoring) question tree", () => {
  it("offers the seven start categories A-G", () => {
    expect(FASHION_START_OPTIONS.map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
  });

  it("routes each start branch to its first screen", () => {
    expect(nextFashionScreen("start", "A", {})).toBe("a_who");
    expect(nextFashionScreen("start", "B", {})).toBe("b_count");
    expect(nextFashionScreen("start", "C", {})).toBe("c_what");
    expect(nextFashionScreen("start", "D", {})).toBe("d_damage");
    expect(nextFashionScreen("start", "E", {})).toBe("e_looking");
    expect(nextFashionScreen("start", "F", {})).toBe("f_advice");
    expect(nextFashionScreen("start", "G", {})).toBe("g_describe");
  });

  it("walks the full new-outfit (A) chain to final", () => {
    expect(nextFashionScreen("a_who", "women", {})).toBe("a_style");
    expect(nextFashionScreen("a_style", "native", {})).toBe("a_fabric");
    expect(nextFashionScreen("a_fabric", "yes", {})).toBe("a_style_ref");
    expect(nextFashionScreen("a_style_ref", "no", {})).toBe("a_ready");
    expect(nextFashionScreen("a_ready", "thisweek", {})).toBe("final");
  });

  it("walks the full aso-ebi (B) chain to final", () => {
    expect(nextFashionScreen("b_count", "bulk", {})).toBe("b_group");
    expect(nextFashionScreen("b_group", "wedding", {})).toBe("b_fabric");
    expect(nextFashionScreen("b_fabric", "ankara", {})).toBe("b_have");
    expect(nextFashionScreen("b_have", "source", {})).toBe("b_same");
    expect(nextFashionScreen("b_same", "same", {})).toBe("b_date");
    expect(nextFashionScreen("b_date", "25 December", {})).toBe("final");
  });

  it("walks the alteration (C) and repair (D) chains to final", () => {
    expect(nextFashionScreen("c_what", "size", {})).toBe("c_native");
    expect(nextFashionScreen("c_native", "native", {})).toBe("c_have");
    expect(nextFashionScreen("c_have", "pickup", {})).toBe("final");

    expect(nextFashionScreen("d_damage", "tear", {})).toBe("d_value");
    expect(nextFashionScreen("d_value", "high", {})).toBe("d_repair");
    expect(nextFashionScreen("d_repair", "new", {})).toBe("final");
  });

  it("walks the ready-to-wear (E) and consultation (F) chains to final", () => {
    expect(nextFashionScreen("e_looking", "ankara", {})).toBe("e_fitting");
    expect(nextFashionScreen("e_fitting", "yes", {})).toBe("final");

    expect(nextFashionScreen("f_advice", "colour", {})).toBe("f_budget");
    expect(nextFashionScreen("f_budget", "no", {})).toBe("final");
  });

  it("walks the something-else (G) chain to final", () => {
    expect(nextFashionScreen("g_describe", "sew a gele", {})).toBe("g_related");
    expect(nextFashionScreen("g_related", "vehicle", {})).toBe("final");
  });

  it("is capture-only always Fashion, never a confirm card", () => {
    const cases: Record<string, string>[] = [
      { start: "A" },
      { start: "B" },
      { start: "G", g_related: "vehicle" },
      { start: "G", g_related: "house" },
      { start: "G", g_related: "power" },
      { start: "G", g_related: "clothing" },
    ];
    for (const answers of cases) {
      expect(resolveFashionRoute(answers).trade).toBe("fashion");
      expect(resolveFashionRoute(answers).needsConfirm).toBe(false);
    }
  });

  it("requires 2 photos (min 2, max 4)", () => {
    expect(FASHION_MIN_PHOTOS).toBe(2);
    expect(FASHION_MAX_PHOTOS).toBe(4);
    expect(canFindFashionPro(0)).toBe(false);
    expect(canFindFashionPro(1)).toBe(false);
    expect(canFindFashionPro(2)).toBe(true);
    expect(canFindFashionPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });

  it("composes the problem text with questions and answers", () => {
    const out = composeFashionProblem(
      {
        start: "A",
        a_who: "women",
        a_style: "native",
      },
      "Bridal owambe",
      "Ikeja",
    );
    expect(out).toContain(FASHION_START_QUESTION);
    expect(out).toContain("New custom-made outfit (Native or English)");
    expect(out).toContain("Women");
    expect(out).toContain("Ikeja");
    expect(out).toContain("Bridal owambe");
  });

  it("builds a breadcrumb with branch letter and send state", () => {
    expect(fashionBreadcrumb(["start"])).toBe("Fashion");
    expect(fashionBreadcrumb(["start", "a_who"])).toBe("Fashion · A");
    expect(fashionBreadcrumb(["start", "final"])).toBe("Fashion · Send");
  });

  it("exposes every chained screen with a question", () => {
    const ids = [
      "start",
      "a_who",
      "a_style",
      "a_fabric",
      "a_style_ref",
      "a_ready",
      "b_count",
      "b_group",
      "b_fabric",
      "b_have",
      "b_same",
      "b_date",
      "c_what",
      "c_native",
      "c_have",
      "d_damage",
      "d_value",
      "d_repair",
      "e_looking",
      "e_fitting",
      "f_advice",
      "f_budget",
      "g_describe",
      "g_related",
    ];
    for (const id of ids) {
      const screen = fashionScreen(id);
      expect(screen).toBeDefined();
      expect(screen?.question?.length).toBeGreaterThan(0);
      expect(FASHION_SCREENS[id]).toBeDefined();
    }
  });

  it("exposes the final block copy", () => {
    expect(FASHION_FINAL_COPY.home).toContain("home service");
    expect(FASHION_FINAL_COPY.photos).toContain("2-4");
  });
});
