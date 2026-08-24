import { describe, expect, it } from "vitest";
import {
  ELECTRICAL_FINAL_COPY,
  ELECTRICAL_MAX_PHOTOS,
  ELECTRICAL_MIN_PHOTOS,
  ELECTRICAL_SCREENS,
  ELECTRICAL_START_OPTIONS,
  ELECTRICAL_START_QUESTION,
  canAdvanceText,
  canFindElectricalPro,
  composeElectricalProblem,
  electricalBreadcrumb,
  electricalScreen,
  nextElectricalScreen,
  resolveElectricalRoute,
} from "@/lib/electrical/question-tree";

describe("electrical question tree", () => {
  it("offers the five start categories A-E", () => {
    expect(ELECTRICAL_START_OPTIONS.map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });

  it("routes the vehicle branch through the vehicle picker then the symptom question", () => {
    expect(nextElectricalScreen("start", "A", {})).toBe("vehicle");
    expect(nextElectricalScreen("start", "B", {})).toBe("b_main");
    expect(nextElectricalScreen("start", "C", {})).toBe("c_main");
    expect(nextElectricalScreen("start", "D", {})).toBe("d_main");
    expect(nextElectricalScreen("start", "E", {})).toBe("e_describe");
  });

  it("walks the full vehicle (A) chain to final", () => {
    expect(nextElectricalScreen("a_symptom", "dead", {})).toBe("a_after");
    expect(nextElectricalScreen("a_after", "yes", {})).toBe("a_smell");
    expect(nextElectricalScreen("a_smell", "no", {})).toBe("a_start");
    expect(nextElectricalScreen("a_start", "yes", {})).toBe("a_safe");
    expect(nextElectricalScreen("a_safe", "yes", {})).toBe("final");
  });

  it("walks the full residential (B) chain to final", () => {
    expect(nextElectricalScreen("b_main", "outage", {})).toBe("b_board");
    expect(nextElectricalScreen("b_board", "yes", {})).toBe("b_after");
    expect(nextElectricalScreen("b_after", "no", {})).toBe("b_smell");
    expect(nextElectricalScreen("b_smell", "no", {})).toBe("b_emergency");
    expect(nextElectricalScreen("b_emergency", "yes", {})).toBe("final");
  });

  it("walks the full commercial (C) chain to final", () => {
    expect(nextElectricalScreen("c_main", "ac", {})).toBe("c_scope");
    expect(nextElectricalScreen("c_scope", "office", {})).toBe("c_three");
    expect(nextElectricalScreen("c_three", "yes", {})).toBe("c_critical");
    expect(nextElectricalScreen("c_critical", "yes", {})).toBe("c_emergency");
    expect(nextElectricalScreen("c_emergency", "no", {})).toBe("final");
  });

  it("walks the full industrial (D) chain to final", () => {
    expect(nextElectricalScreen("d_main", "motor", {})).toBe("d_facility");
    expect(nextElectricalScreen("d_facility", "factory", {})).toBe(
      "d_warranty",
    );
    expect(nextElectricalScreen("d_warranty", "no", {})).toBe("d_production");
    expect(nextElectricalScreen("d_production", "yes", {})).toBe("d_safety");
    expect(nextElectricalScreen("d_safety", "no", {})).toBe("final");
  });

  it("walks the full something-else (E) chain to final", () => {
    expect(nextElectricalScreen("e_describe", "zap", {})).toBe("e_related");
    expect(nextElectricalScreen("e_related", "battery", {})).toBe("final");
  });

  it("never needs a confirm card electric stays electric everywhere", () => {
    const cases: Record<string, string>[] = [
      { start: "A", a_symptom: "dead" },
      { start: "B", b_main: "burning" },
      { start: "C", c_main: "ac" },
      { start: "D", d_main: "safety" },
      { start: "E", e_related: "tyre" },
    ];
    for (const answers of cases) {
      expect(resolveElectricalRoute(answers).trade).toBe("electrical");
      expect(resolveElectricalRoute(answers).needsConfirm).toBe(false);
    }
  });

  it("keeps photos optional (min 0, max 4)", () => {
    expect(ELECTRICAL_MIN_PHOTOS).toBe(0);
    expect(ELECTRICAL_MAX_PHOTOS).toBe(4);
    expect(canFindElectricalPro(0)).toBe(true);
    expect(canFindElectricalPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });

  it("composes the problem text with questions and answers", () => {
    const out = composeElectricalProblem(
      {
        start: "A",
        a_symptom: "dead",
        a_smell: "yes",
      },
      "Call before arrival",
      "Lekki",
    );
    expect(out).toContain(ELECTRICAL_START_QUESTION);
    expect(out).toContain("Vehicle electrical issue");
    expect(out).toContain("No power / completely dead");
    expect(out).toContain("Lekki");
    expect(out).toContain("Call before arrival");
  });

  it("builds a breadcrumb with the branch letter", () => {
    expect(electricalBreadcrumb(["start"])).toBe("Electric");
    expect(electricalBreadcrumb(["start", "vehicle", "a_symptom"])).toBe(
      "Electric · A",
    );
  });

  it("exposes every chained screen with a question", () => {
    const ids = [
      "start",
      "a_symptom",
      "a_after",
      "a_smell",
      "a_start",
      "a_safe",
      "b_main",
      "b_board",
      "b_after",
      "b_smell",
      "b_emergency",
      "c_main",
      "c_scope",
      "c_three",
      "c_critical",
      "c_emergency",
      "d_main",
      "d_facility",
      "d_warranty",
      "d_production",
      "d_safety",
      "e_describe",
      "e_related",
    ];
    for (const id of ids) {
      const screen = electricalScreen(id);
      expect(screen).toBeDefined();
      expect(screen?.question?.length).toBeGreaterThan(0);
      expect(ELECTRICAL_SCREENS[id]).toBeDefined();
    }
  });

  it("exposes the final copy strings", () => {
    expect(ELECTRICAL_FINAL_COPY.tow).toContain("towed");
    expect(ELECTRICAL_FINAL_COPY.photos).toContain("distribution");
  });
});
