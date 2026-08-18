import { describe, expect, it } from "vitest";
import {
  canAdvanceText,
  canFindPainterPro,
  composePainterJob,
  nextPainterScreen,
  PAINTER_FINAL_COPY,
  PAINTER_MAX_PHOTOS,
  PAINTER_MIN_PHOTOS,
  PAINTER_SCAFFOLD_OPTIONS,
  PAINTER_SCREENS,
  PAINTER_START_OPTIONS,
  PAINTER_START_QUESTION,
  PAINTER_SUPPLY_OPTIONS,
  painterBreadcrumb,
  painterScreen,
  resolvePainterRoute,
} from "@/lib/painter/question-tree";

describe("painter question tree", () => {
  it("offers the nine start categories A–I", () => {
    expect(PAINTER_START_OPTIONS.map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
    ]);
  });

  it("routes each start branch to its first screen", () => {
    expect(nextPainterScreen("start", "A", {})).toBe("a_scope");
    expect(nextPainterScreen("start", "B", {})).toBe("b_place");
    expect(nextPainterScreen("start", "C", {})).toBe("c_facility");
    expect(nextPainterScreen("start", "D", {})).toBe("d_need");
    expect(nextPainterScreen("start", "E", {})).toBe("e_need");
    expect(nextPainterScreen("start", "F", {})).toBe("f_roof");
    expect(nextPainterScreen("start", "G", {})).toBe("g_type");
    expect(nextPainterScreen("start", "H", {})).toBe("h_need");
    expect(nextPainterScreen("start", "I", {})).toBe("i_describe");
  });

  it("walks the full residential (A) chain to final", () => {
    expect(nextPainterScreen("a_scope", "both", {})).toBe("a_building");
    expect(nextPainterScreen("a_building", "newly-built", {})).toBe("a_size");
    expect(nextPainterScreen("a_size", "4 rooms", {})).toBe("a_paint");
    expect(nextPainterScreen("a_paint", "emulsion", {})).toBe("a_supply");
    expect(nextPainterScreen("a_supply", "painter-supplies", {})).toBe(
      "a_scaffold"
    );
    expect(nextPainterScreen("a_scaffold", "scaffolding", {})).toBe("final");
  });

  it("walks the full commercial (B) chain to final", () => {
    expect(nextPainterScreen("b_place", "shop", {})).toBe("b_scope");
    expect(nextPainterScreen("b_scope", "exterior", {})).toBe("b_front");
    expect(nextPainterScreen("b_front", "yes", {})).toBe("b_building");
    expect(nextPainterScreen("b_building", "repainting", {})).toBe("b_supply");
    expect(nextPainterScreen("b_supply", "i-will-supply", {})).toBe("final");
  });

  it("walks the full industrial (C) and roadside (D) chains to final", () => {
    expect(nextPainterScreen("c_facility", "factory", {})).toBe("c_surface");
    expect(nextPainterScreen("c_surface", "steel", {})).toBe("c_req");
    expect(nextPainterScreen("c_req", "Anti-rust", {})).toBe("c_vacate");
    expect(nextPainterScreen("c_vacate", "vacated", {})).toBe("final");

    expect(nextPainterScreen("d_need", "kiosk", {})).toBe("d_fresh");
    expect(nextPainterScreen("d_fresh", "repaint", {})).toBe("d_sign");
    expect(nextPainterScreen("d_sign", "no", {})).toBe("final");
  });

  it("walks the full gate (E), roof (F) and public (G) chains to final", () => {
    expect(nextPainterScreen("e_need", "gate", {})).toBe("e_material");
    expect(nextPainterScreen("e_material", "metal", {})).toBe("e_rust");
    expect(nextPainterScreen("e_rust", "yes", {})).toBe("e_colour");
    expect(nextPainterScreen("e_colour", "Black gloss", {})).toBe("final");

    expect(nextPainterScreen("f_roof", "aluminium", {})).toBe("f_purpose");
    expect(nextPainterScreen("f_purpose", "heat-reduction", {})).toBe(
      "f_paint"
    );
    expect(nextPainterScreen("f_paint", "i-have", {})).toBe("f_height");
    expect(nextPainterScreen("f_height", "Single storey", {})).toBe("final");

    expect(nextPainterScreen("g_type", "Church hall", {})).toBe("g_scope");
    expect(nextPainterScreen("g_scope", "both", {})).toBe("g_size");
    expect(nextPainterScreen("g_size", "2 halls", {})).toBe("g_colour");
    expect(nextPainterScreen("g_colour", "Blue and white", {})).toBe(
      "g_supply"
    );
    expect(nextPainterScreen("g_supply", "painter-supplies", {})).toBe("final");
  });

  it("walks the full sign-writing (H) and not-sure (I) chains to final", () => {
    expect(nextPainterScreen("h_need", "mural", {})).toBe("h_design");
    expect(nextPainterScreen("h_design", "yes", {})).toBe("h_wall");
    expect(nextPainterScreen("h_wall", "outdoor", {})).toBe("final");

    expect(nextPainterScreen("i_describe", "Paint my fence", {})).toBe(
      "i_location"
    );
    expect(nextPainterScreen("i_location", "house", {})).toBe("final");
  });

  it("is strictly painting — always Painter, never a confirm card", () => {
    const cases: Record<string, string>[] = [
      { start: "A" },
      { start: "B" },
      { start: "F", f_roof: "concrete" },
      { start: "I", i_describe: "Help me decide" },
    ];
    for (const answers of cases) {
      expect(resolvePainterRoute(answers).trade).toBe("painter");
      expect(resolvePainterRoute(answers).needsConfirm).toBe(false);
    }
  });

  it("requires 2 photos (min 2, max 4)", () => {
    expect(PAINTER_MIN_PHOTOS).toBe(2);
    expect(PAINTER_MAX_PHOTOS).toBe(4);
    expect(canFindPainterPro(0)).toBe(false);
    expect(canFindPainterPro(1)).toBe(false);
    expect(canFindPainterPro(2)).toBe(true);
    expect(canFindPainterPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText("  ")).toBe(false);
  });

  it("exposes supply and scaffold options for the final step", () => {
    expect(PAINTER_SUPPLY_OPTIONS.map((o) => o.id)).toEqual([
      "i-will-supply",
      "painter-supplies",
    ]);
    expect(PAINTER_SCAFFOLD_OPTIONS.map((o) => o.id)).toEqual(["yes", "no"]);
    expect(PAINTER_FINAL_COPY.supply).toMatch(/supplying the paint/i);
    expect(PAINTER_FINAL_COPY.scaffold).toMatch(/scaffolding or ladder/i);
  });

  it("composes the problem text with questions and answers", () => {
    const out = composePainterJob(
      {
        start: "A",
        a_scope: "both",
        a_scope_label: "Both",
      },
      "Light blue throughout",
      "Surulere"
    );
    expect(out).toContain(PAINTER_START_QUESTION);
    expect(out).toContain("Both");
    expect(out).toContain("Surulere");
    expect(out).toContain("Light blue throughout");
  });

  it("builds a breadcrumb with branch letter and send state", () => {
    expect(painterBreadcrumb(["start"])).toBe("Painter");
    expect(painterBreadcrumb(["start", "e_need"])).toBe("Painter · E");
    expect(painterBreadcrumb(["start", "final"])).toBe("Painter · Send");
  });

  it("exposes every chained screen with a question", () => {
    const ids = [
      "start",
      "a_scope",
      "a_building",
      "a_size",
      "a_paint",
      "a_supply",
      "a_scaffold",
      "b_place",
      "b_scope",
      "b_front",
      "b_building",
      "b_supply",
      "c_facility",
      "c_surface",
      "c_req",
      "c_vacate",
      "d_need",
      "d_fresh",
      "d_sign",
      "e_need",
      "e_material",
      "e_rust",
      "e_colour",
      "f_roof",
      "f_purpose",
      "f_paint",
      "f_height",
      "g_type",
      "g_scope",
      "g_size",
      "g_colour",
      "g_supply",
      "h_need",
      "h_design",
      "h_wall",
      "i_describe",
      "i_location",
    ];
    for (const id of ids) {
      const screen = painterScreen(id);
      expect(screen).toBeDefined();
      expect(screen?.question?.length).toBeGreaterThan(0);
      expect(PAINTER_SCREENS[id]).toBeDefined();
    }
  });

  it("exposes the final block copy incl. photos", () => {
    expect(PAINTER_FINAL_COPY.photos).toContain("2–4");
  });
});