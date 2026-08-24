import { describe, expect, it } from "vitest";
import {
  canAdvanceText,
  canFindCarpenterPro,
  CARPENTER_FINAL_COPY,
  CARPENTER_MAX_PHOTOS,
  CARPENTER_MIN_PHOTOS,
  CARPENTER_SCREENS,
  CARPENTER_START_OPTIONS,
  CARPENTER_START_QUESTION,
  carpenterBreadcrumb,
  carpenterScreen,
  composeCarpenterJob,
  nextCarpenterScreen,
  resolveCarpenterRoute,
} from "@/lib/carpenter/question-tree";

describe("carpenter question tree", () => {
  it("offers the nine start categories A-I", () => {
    expect(CARPENTER_START_OPTIONS.map((o) => o.id)).toEqual([
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
    expect(nextCarpenterScreen("start", "A", {})).toBe("a_type");
    expect(nextCarpenterScreen("start", "B", {})).toBe("b_problem");
    expect(nextCarpenterScreen("start", "C", {})).toBe("c_need");
    expect(nextCarpenterScreen("start", "D", {})).toBe("d_work");
    expect(nextCarpenterScreen("start", "E", {})).toBe("e_need");
    expect(nextCarpenterScreen("start", "F", {})).toBe("f_place");
    expect(nextCarpenterScreen("start", "G", {})).toBe("g_need");
    expect(nextCarpenterScreen("start", "H", {})).toBe("h_describe");
    expect(nextCarpenterScreen("start", "I", {})).toBe("i_explain");
  });

  it("walks the full new-furniture (A) chain to final", () => {
    expect(nextCarpenterScreen("a_type", "bed", {})).toBe("a_wood");
    expect(nextCarpenterScreen("a_wood", "i-have", {})).toBe("a_woodtype");
    expect(nextCarpenterScreen("a_woodtype", "iroko", {})).toBe("a_design");
    expect(nextCarpenterScreen("a_design", "yes", {})).toBe("a_measure");
    expect(nextCarpenterScreen("a_measure", "yes", {})).toBe("final");
  });

  it("walks the full repair (B) chain to final", () => {
    expect(nextCarpenterScreen("b_problem", "loose-joints", {})).toBe("b_type");
    expect(nextCarpenterScreen("b_type", "Sofa", {})).toBe("b_parts");
    expect(nextCarpenterScreen("b_parts", "yes", {})).toBe("b_where");
    expect(nextCarpenterScreen("b_where", "at-location", {})).toBe("final");
  });

  it("walks the full doors (C) and roofing (D) chains to final", () => {
    expect(nextCarpenterScreen("c_need", "new-door", {})).toBe("c_building");
    expect(nextCarpenterScreen("c_building", "residential", {})).toBe("c_wood");
    expect(nextCarpenterScreen("c_wood", "carpenter-supplies", {})).toBe(
      "c_install",
    );
    expect(nextCarpenterScreen("c_install", "remove-and-install", {})).toBe(
      "final",
    );

    expect(nextCarpenterScreen("d_work", "ceiling", {})).toBe("d_building");
    expect(nextCarpenterScreen("d_building", "existing-repair", {})).toBe(
      "d_sheet",
    );
    expect(nextCarpenterScreen("d_sheet", "Long span", {})).toBe("d_scaffold");
    expect(nextCarpenterScreen("d_scaffold", "scaffolding", {})).toBe("final");
  });

  it("walks the full storage (E), commercial (F) and stall (G) chains to final", () => {
    expect(nextCarpenterScreen("e_need", "wardrobe", {})).toBe("e_space");
    expect(nextCarpenterScreen("e_space", "finished", {})).toBe("e_design");
    expect(nextCarpenterScreen("e_design", "measurements-only", {})).toBe(
      "e_material",
    );
    expect(nextCarpenterScreen("e_material", "i-have", {})).toBe("final");

    expect(nextCarpenterScreen("f_place", "office", {})).toBe("f_items");
    expect(nextCarpenterScreen("f_items", "desks-chairs", {})).toBe("f_setup");
    expect(nextCarpenterScreen("f_setup", "new-setup", {})).toBe("final");

    expect(nextCarpenterScreen("g_need", "kiosk", {})).toBe("g_duration");
    expect(nextCarpenterScreen("g_duration", "permanent", {})).toBe("g_mobile");
    expect(nextCarpenterScreen("g_mobile", "mobile", {})).toBe("final");
  });

  it("walks the full general (H) and not-sure (I) chains to final", () => {
    expect(nextCarpenterScreen("h_describe", "Build a gate", {})).toBe(
      "h_location",
    );
    expect(nextCarpenterScreen("h_location", "outdoor", {})).toBe("h_wood");
    expect(nextCarpenterScreen("h_wood", "no", {})).toBe("final");

    expect(nextCarpenterScreen("i_explain", "Fix my shelf", {})).toBe(
      "i_location",
    );
    expect(nextCarpenterScreen("i_location", "house", {})).toBe("final");
  });

  it("is strictly carpentry always Carpenter, never a confirm card", () => {
    const cases: Record<string, string>[] = [
      { start: "A" },
      { start: "B" },
      { start: "G", g_need: "kiosk" },
      { start: "I", i_explain: "Help me plan" },
    ];
    for (const answers of cases) {
      expect(resolveCarpenterRoute(answers).trade).toBe("carpenter");
      expect(resolveCarpenterRoute(answers).needsConfirm).toBe(false);
    }
  });

  it("requires 2 photos (min 2, max 4)", () => {
    expect(CARPENTER_MIN_PHOTOS).toBe(2);
    expect(CARPENTER_MAX_PHOTOS).toBe(4);
    expect(canFindCarpenterPro(0)).toBe(false);
    expect(canFindCarpenterPro(1)).toBe(false);
    expect(canFindCarpenterPro(2)).toBe(true);
    expect(canFindCarpenterPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });

  it("composes the problem text with questions and answers", () => {
    const out = composeCarpenterJob(
      {
        start: "A",
        a_type: "bed",
        a_type_label: "Bed (with or without storage)",
      },
      "Needs a queen bed",
      "Ikeja",
    );
    expect(out).toContain(CARPENTER_START_QUESTION);
    expect(out).toContain("Bed (with or without storage)");
    expect(out).toContain("Ikeja");
    expect(out).toContain("Needs a queen bed");
  });

  it("builds a breadcrumb with branch letter and send state", () => {
    expect(carpenterBreadcrumb(["start"])).toBe("Carpenter");
    expect(carpenterBreadcrumb(["start", "c_need"])).toBe("Carpenter · C");
    expect(carpenterBreadcrumb(["start", "final"])).toBe("Carpenter · Send");
  });

  it("exposes every chained screen with a question", () => {
    const ids = [
      "start",
      "a_type",
      "a_wood",
      "a_woodtype",
      "a_design",
      "a_measure",
      "b_problem",
      "b_type",
      "b_parts",
      "b_where",
      "c_need",
      "c_building",
      "c_wood",
      "c_install",
      "d_work",
      "d_building",
      "d_sheet",
      "d_scaffold",
      "e_need",
      "e_space",
      "e_design",
      "e_material",
      "f_place",
      "f_items",
      "f_setup",
      "g_need",
      "g_duration",
      "g_mobile",
      "h_describe",
      "h_location",
      "h_wood",
      "i_explain",
      "i_location",
    ];
    for (const id of ids) {
      const screen = carpenterScreen(id);
      expect(screen).toBeDefined();
      expect(screen?.question?.length).toBeGreaterThan(0);
      expect(CARPENTER_SCREENS[id]).toBeDefined();
    }
  });

  it("exposes the final block copy incl. measurements question", () => {
    expect(CARPENTER_FINAL_COPY.photos).toContain("2-4");
    expect(CARPENTER_FINAL_COPY.measurements).toMatch(/measurements/i);
  });
});
