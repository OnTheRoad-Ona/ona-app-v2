import { describe, expect, it } from "vitest";
import {
  acBreadcrumb,
  AC_SCREENS,
  canAdvanceText,
  canFindAcPro,
  composeAcProblem,
  AC_START_OPTIONS,
  AC_START_QUESTION,
  AC_UNIT_QUESTION,
  nextAcScreen,
  resolveAcRoute,
} from "@/lib/ac/question-tree";

describe("ac question tree", () => {
  it("uses the A/C start question and offers branches A–G", () => {
    expect(AC_START_QUESTION).toBe(
      "What is the main air-conditioning problem you are experiencing?"
    );
    expect(AC_START_OPTIONS.map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
  });

  it("routes the unit-kind selector first", () => {
    expect(AC_UNIT_QUESTION).toBe("Is this a vehicle A/C or a home/office A/C?");
    expect(nextAcScreen("unit", "vehicle", {})).toBe("vehicle");
    expect(nextAcScreen("unit", "home", {})).toBe("u_type");
    expect(nextAcScreen("u_type", "Split unit", {})).toBe("start");
  });

  it("opens each branch from start", () => {
    expect(nextAcScreen("start", "A", { start: "A" })).toBe("a_fan");
    expect(nextAcScreen("start", "B", { start: "B" })).toBe("b_behavior");
    expect(nextAcScreen("start", "C", { start: "C" })).toBe("c_sound");
    expect(nextAcScreen("start", "D", { start: "D" })).toBe("d_smell");
    expect(nextAcScreen("start", "E", { start: "E" })).toBe("e_stopped");
    expect(nextAcScreen("start", "F", { start: "F" })).toBe("f_where");
    expect(nextAcScreen("start", "G", { start: "G" })).toBe("g_describe");
  });

  it("walks branch A to the final block", () => {
    let step = "a_fan";
    for (const next of ["a_click", "a_last_service", "a_recent_work", "final"]) {
      step = nextAcScreen(step, "yes", {});
      expect(step).toBe(next);
    }
  });

  it("walks branches B, C, D, E, F and G to the final block", () => {
    expect(
      nextAcScreen(nextAcScreen(nextAcScreen(nextAcScreen("b_behavior", "x", {}), "x", {}), "x", {}), "x", {})
    ).toBe("final");
    expect(
      nextAcScreen(nextAcScreen(nextAcScreen("c_sound", "x", {}), "x", {}), "x", {})
    ).toBe("final");
    expect(
      nextAcScreen(nextAcScreen(nextAcScreen("d_smell", "x", {}), "x", {}), "x", {})
    ).toBe("final");
    expect(
      nextAcScreen(nextAcScreen(nextAcScreen(nextAcScreen("e_stopped", "x", {}), "x", {}), "x", {}), "x", {})
    ).toBe("final");
    expect(
      nextAcScreen(nextAcScreen(nextAcScreen("f_where", "x", {}), "x", {}), "x", {})
    ).toBe("final");
    expect(nextAcScreen(nextAcScreen("g_describe", "x", {}), "x", {})).toBe("final");
  });

  it("never leaves A/C — even burning electrical smell or engine noise stay A/C", () => {
    expect(resolveAcRoute({ start: "D", d_smell: "burning" }).trade).toBe("ac");
    expect(resolveAcRoute({ start: "A", a_fan: "no", a_click: "no" }).trade).toBe("ac");
    expect(resolveAcRoute({ start: "C", c_sound: "grinding", c_when: "also_off" }).trade).toBe("ac");
    expect(resolveAcRoute({ start: "G", g_related: "engine" }).trade).toBe("ac");
    expect(resolveAcRoute({ start: "G", g_related: "electrical" }).trade).toBe("ac");
    expect(resolveAcRoute({ start: "G", g_related: "power" }).trade).toBe("ac");
  });

  it("never needs a confirm card", () => {
    const cases: Record<string, string>[] = [
      { start: "A", a_fan: "no" },
      { start: "G", g_related: "battery" },
      { start: "E", e_warning: "yes" },
    ];
    for (const answers of cases) {
      expect(resolveAcRoute(answers).needsConfirm).toBe(false);
    }
  });

  it("excludes Tow from the branch G sub-categories", () => {
    expect(
      AC_SCREENS.g_related.options?.some((o) => /tow|towed|cannot move/i.test(o.label))
    ).toBe(false);
  });

  it("composes the problem text from questions and answers", () => {
    const text = composeAcProblem(
      {
        unit: "vehicle",
        start: "D",
        d_smell: "musty",
        d_when_smell: "also_fan",
        d_damp: "yes",
      },
      "Smell gets stronger when car sits",
      "Surulere, Lagos"
    );
    expect(text).toContain(AC_START_QUESTION);
    expect(text).toContain("Bad smell coming from the vents");
    expect(text).toContain("Musty / mouldy");
    expect(text).toContain("Surulere, Lagos");
    expect(text).toContain("Smell gets stronger when car sits");
  });

  it("keeps photos optional (min 0, max 4) and validates free text", () => {
    expect(canFindAcPro(0)).toBe(true);
    expect(canFindAcPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });

  it("builds a breadcrumb of the branch letter and phase", () => {
    expect(acBreadcrumb(["unit", "start"])).toBe("A/C");
    expect(acBreadcrumb(["unit", "a_fan", "a_click"])).toBe("A/C · A");
    expect(acBreadcrumb(["unit", "start", "final"])).toBe("A/C · Send");
  });
});