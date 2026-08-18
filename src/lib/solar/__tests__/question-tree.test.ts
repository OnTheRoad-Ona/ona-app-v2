import { describe, expect, it } from "vitest";
import {
  applyConfirmChoice,
  canAdvanceText,
  canFindSolarPro,
  composeSolarProblem,
  confirmQuestion,
  nextSolarScreen,
  resolveSolarRoute,
  SOLAR_FINAL_COPY,
  SOLAR_MAX_PHOTOS,
  SOLAR_MIN_PHOTOS,
  SOLAR_SCREENS,
  SOLAR_START_OPTIONS,
  SOLAR_START_QUESTION,
  solarBreadcrumb,
  solarScreen,
} from "@/lib/solar/question-tree";

describe("solar question tree", () => {
  it("offers the six start categories A–F", () => {
    expect(SOLAR_START_OPTIONS.map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
  });

  it("routes each start branch to its first screen", () => {
    expect(nextSolarScreen("start", "A", {})).toBe("a_property");
    expect(nextSolarScreen("start", "B", {})).toBe("b_problem");
    expect(nextSolarScreen("start", "C", {})).toBe("c_which");
    expect(nextSolarScreen("start", "D", {})).toBe("d_count");
    expect(nextSolarScreen("start", "E", {})).toBe("e_upgrade");
    expect(nextSolarScreen("start", "F", {})).toBe("f_describe");
  });

  it("walks the full installation (A), cleaning (D) and upgrade (E) chains to final", () => {
    expect(nextSolarScreen("a_property", "residential", {})).toBe("a_power");
    expect(nextSolarScreen("a_power", "full-house", {})).toBe("a_system");
    expect(nextSolarScreen("a_system", "hybrid", {})).toBe("a_equipment");
    expect(nextSolarScreen("a_equipment", "no", {})).toBe("a_supply");
    expect(nextSolarScreen("a_supply", "technician-supplies", {})).toBe(
      "a_roof"
    );
    expect(nextSolarScreen("a_roof", "long-span", {})).toBe("final");

    expect(nextSolarScreen("d_count", "6 panels", {})).toBe("d_last");
    expect(nextSolarScreen("d_last", "6 months ago", {})).toBe("d_condition");
    expect(nextSolarScreen("d_condition", "dirty-dusty", {})).toBe("d_check");
    expect(nextSolarScreen("d_check", "yes", {})).toBe("final");

    expect(nextSolarScreen("e_upgrade", "more-panels", {})).toBe("e_current");
    expect(nextSolarScreen("e_current", "3.5kVA", {})).toBe("e_load");
    expect(nextSolarScreen("e_load", "Fridge", {})).toBe("final");
  });

  it("walks the fault (B), battery/inverter (C) and other (F) chains to confirm", () => {
    expect(nextSolarScreen("b_problem", "no-power", {})).toBe("b_age");
    expect(nextSolarScreen("b_age", "2 years", {})).toBe("b_inverter");
    expect(nextSolarScreen("b_inverter", "3.5kVA", {})).toBe("b_warranty");
    expect(nextSolarScreen("b_warranty", "no", {})).toBe("confirm");

    expect(nextSolarScreen("c_which", "inverter", {})).toBe("c_symptom");
    expect(nextSolarScreen("c_symptom", "beeping", {})).toBe("c_type");
    expect(nextSolarScreen("c_type", "lithium", {})).toBe("c_bank");
    expect(nextSolarScreen("c_bank", "2 batteries", {})).toBe("confirm");

    expect(nextSolarScreen("f_describe", "Advise me", {})).toBe("f_location");
    expect(nextSolarScreen("f_location", "house", {})).toBe("confirm");
  });

  it("offers Electric only for branches B, C and F; stays Solar for A, D, E", () => {
    expect(resolveSolarRoute({ start: "A" })).toEqual({
      trade: "solar",
      needsConfirm: false,
    });
    expect(resolveSolarRoute({ start: "D" })).toEqual({
      trade: "solar",
      needsConfirm: false,
    });
    expect(resolveSolarRoute({ start: "E" })).toEqual({
      trade: "solar",
      needsConfirm: false,
    });

    for (const start of ["B", "C", "F"]) {
      const route = resolveSolarRoute({ start });
      expect(route.trade).toBe("electrical");
      expect(route.alternate).toBe("solar");
      expect(route.needsConfirm).toBe(true);
    }
  });

  it("applyConfirmChoice honors yes/no with alternate", () => {
    const route = resolveSolarRoute({ start: "C" });
    expect(applyConfirmChoice(route, true)).toBe("electrical");
    expect(applyConfirmChoice(route, false)).toBe("solar");
    const stay = resolveSolarRoute({ start: "A" });
    expect(applyConfirmChoice(stay, false)).toBe("solar");
  });

  it("confirm question names the Electrical trade", () => {
    expect(confirmQuestion("electrical")).toBe(
      "This sounds like Electrical. Continue?"
    );
  });

  it("requires 2 photos (min 2, max 4)", () => {
    expect(SOLAR_MIN_PHOTOS).toBe(2);
    expect(SOLAR_MAX_PHOTOS).toBe(4);
    expect(canFindSolarPro(0)).toBe(false);
    expect(canFindSolarPro(1)).toBe(false);
    expect(canFindSolarPro(2)).toBe(true);
    expect(canFindSolarPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText("  ")).toBe(false);
  });

  it("exposes the final block copy incl. load and supply questions", () => {
    expect(SOLAR_FINAL_COPY.photos).toContain("2–4");
    expect(SOLAR_FINAL_COPY.load).toMatch(/Estimated load/i);
    expect(SOLAR_FINAL_COPY.supply).toMatch(/supplying the equipment/i);
  });

  it("composes the problem text with questions and answers", () => {
    const out = composeSolarProblem(
      {
        start: "A",
        a_property: "residential",
        a_property_label: "Residential house / flat",
      },
      "Needs backup for the whole house",
      "Lekki"
    );
    expect(out).toContain(SOLAR_START_QUESTION);
    expect(out).toContain("Residential house / flat");
    expect(out).toContain("Lekki");
    expect(out).toContain("Needs backup for the whole house");
  });

  it("builds a breadcrumb with branch letter and send state", () => {
    expect(solarBreadcrumb(["start"])).toBe("Solar");
    expect(solarBreadcrumb(["start", "c_which"])).toBe("Solar · C");
    expect(solarBreadcrumb(["start", "final"])).toBe("Solar · Send");
  });

  it("exposes every chained screen with a question", () => {
    const ids = [
      "start",
      "a_property",
      "a_power",
      "a_system",
      "a_equipment",
      "a_supply",
      "a_roof",
      "b_problem",
      "b_age",
      "b_inverter",
      "b_warranty",
      "c_which",
      "c_symptom",
      "c_type",
      "c_bank",
      "d_count",
      "d_last",
      "d_condition",
      "d_check",
      "e_upgrade",
      "e_current",
      "e_load",
      "f_describe",
      "f_location",
    ];
    for (const id of ids) {
      const screen = solarScreen(id);
      expect(screen).toBeDefined();
      expect(screen?.question?.length).toBeGreaterThan(0);
      expect(SOLAR_SCREENS[id]).toBeDefined();
    }
  });
});