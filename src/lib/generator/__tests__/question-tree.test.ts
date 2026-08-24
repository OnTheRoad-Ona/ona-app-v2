import { describe, expect, it } from "vitest";
import {
  applyConfirmChoice,
  canAdvanceText,
  canFindGeneratorPro,
  composeGeneratorProblem,
  confirmQuestion,
  genScreen,
  GEN_FINAL_COPY,
  GEN_MACHINE_QUESTION,
  GEN_MAX_PHOTOS,
  GEN_MIN_PHOTOS,
  GEN_SCREENS,
  GEN_START_OPTIONS,
  GEN_START_QUESTION,
  generatorBreadcrumb,
  nextGeneratorScreen,
  resolveGeneratorRoute,
} from "@/lib/generator/question-tree";

describe("generator question tree", () => {
  it("starts with the generator type catalog question before work type", () => {
    expect(GEN_MACHINE_QUESTION).toBe("What type of Generator do you use?");
    expect(genScreen("machine")?.question).toBe(GEN_MACHINE_QUESTION);
    expect(nextGeneratorScreen("machine", "catalog", {})).toBe("start");
    expect(nextGeneratorScreen("machine", "none", {})).toBe("start");
  });

  it("skips later petrol/diesel screens when type is already known", () => {
    expect(
      nextGeneratorScreen("b_start", "dead", { machine_type: "petrol" }),
    ).toBe("b_service");
    expect(
      nextGeneratorScreen("b_start", "dead", { machine_type: "inverter" }),
    ).toBe("b_service");
    expect(
      nextGeneratorScreen("b_start", "dead", { machine_type: "diesel" }),
    ).toBe("b_service");
    expect(nextGeneratorScreen("b_start", "dead", {})).toBe("b_type");
    expect(
      nextGeneratorScreen("b_start", "dead", { machine_type: "canopy" }),
    ).toBe("b_type");
    expect(
      nextGeneratorScreen("d_last", "1 year", { machine_type: "diesel" }),
    ).toBe("d_problem");
    expect(nextGeneratorScreen("d_last", "1 year", {})).toBe("d_spec");
  });

  it("offers the seven start categories A-G", () => {
    expect(GEN_START_OPTIONS.map((o) => o.id)).toEqual([
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
    expect(nextGeneratorScreen("start", "A", {})).toBe("a_property");
    expect(nextGeneratorScreen("start", "B", {})).toBe("b_start");
    expect(nextGeneratorScreen("start", "C", {})).toBe("c_output");
    expect(nextGeneratorScreen("start", "D", {})).toBe("d_service");
    expect(nextGeneratorScreen("start", "E", {})).toBe("e_issue");
    expect(nextGeneratorScreen("start", "F", {})).toBe("f_happening");
    expect(nextGeneratorScreen("start", "G", {})).toBe("g_describe");
  });

  it("walks the full purchase (A) and servicing (D) chains to final", () => {
    expect(nextGeneratorScreen("a_property", "residential", {})).toBe(
      "a_power",
    );
    expect(nextGeneratorScreen("a_power", "full-house", {})).toBe("a_type");
    expect(nextGeneratorScreen("a_type", "diesel", {})).toBe("a_size");
    expect(nextGeneratorScreen("a_size", "5-10", {})).toBe("a_supply");
    expect(nextGeneratorScreen("a_supply", "i-will", {})).toBe("a_changeover");
    expect(nextGeneratorScreen("a_changeover", "automatic", {})).toBe("final");

    expect(nextGeneratorScreen("d_service", "normal", {})).toBe("d_last");
    expect(nextGeneratorScreen("d_last", "1 year", {})).toBe("d_spec");
    expect(nextGeneratorScreen("d_spec", "petrol 3.5kVA", {})).toBe(
      "d_problem",
    );
    expect(nextGeneratorScreen("d_problem", "smoke", {})).toBe("final");

    expect(nextGeneratorScreen("f_happening", "overheating", {})).toBe(
      "f_when",
    );
    expect(nextGeneratorScreen("f_when", "after 20 mins", {})).toBe("f_oil");
    expect(nextGeneratorScreen("f_oil", "okay", {})).toBe("final");
  });

  it("walks the will-not-start (B), no-power (C), change-over (E) and other (G) chains to confirm", () => {
    expect(nextGeneratorScreen("b_start", "dead", {})).toBe("b_type");
    expect(nextGeneratorScreen("b_type", "petrol", {})).toBe("b_service");
    expect(nextGeneratorScreen("b_service", "never", {})).toBe("b_fuel");
    expect(nextGeneratorScreen("b_fuel", "yes", {})).toBe("b_work");
    expect(nextGeneratorScreen("b_work", "no", {})).toBe("confirm");

    expect(nextGeneratorScreen("c_output", "no output", {})).toBe("c_voltage");
    expect(nextGeneratorScreen("c_voltage", "fluctuating", {})).toBe("c_load");
    expect(nextGeneratorScreen("c_load", "only heavy", {})).toBe(
      "c_changeover",
    );
    expect(nextGeneratorScreen("c_changeover", "yes", {})).toBe("confirm");

    expect(nextGeneratorScreen("e_issue", "wiring", {})).toBe("e_kind");
    expect(nextGeneratorScreen("e_kind", "automatic", {})).toBe("e_history");
    expect(nextGeneratorScreen("e_history", "new install", {})).toBe("confirm");

    expect(nextGeneratorScreen("g_describe", "no power at all", {})).toBe(
      "g_location",
    );
    expect(nextGeneratorScreen("g_location", "shop", {})).toBe("confirm");
  });

  it("offers Electric only for branches B, C, E, G; stays Generator for A, D, F", () => {
    for (const start of ["A", "D", "F"]) {
      const route = resolveGeneratorRoute({ start });
      expect(route.trade).toBe("generator");
      expect(route.needsConfirm).toBe(false);
    }

    for (const start of ["B", "C", "E", "G"]) {
      const route = resolveGeneratorRoute({ start });
      expect(route.trade).toBe("electrical");
      expect(route.alternate).toBe("generator");
      expect(route.needsConfirm).toBe(true);
    }
  });

  it("applyConfirmChoice honors yes/no with alternate", () => {
    const route = resolveGeneratorRoute({ start: "E" });
    expect(applyConfirmChoice(route, true)).toBe("electrical");
    expect(applyConfirmChoice(route, false)).toBe("generator");
    const stay = resolveGeneratorRoute({ start: "A" });
    expect(applyConfirmChoice(stay, false)).toBe("generator");
  });

  it("confirm question names the Electrical trade", () => {
    expect(confirmQuestion("electrical")).toBe(
      "This sounds like Electrical. Continue?",
    );
  });

  it("requires 2 photos (min 2, max 4)", () => {
    expect(GEN_MIN_PHOTOS).toBe(2);
    expect(GEN_MAX_PHOTOS).toBe(4);
    expect(canFindGeneratorPro(0)).toBe(false);
    expect(canFindGeneratorPro(1)).toBe(false);
    expect(canFindGeneratorPro(2)).toBe(true);
    expect(canFindGeneratorPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText("  ")).toBe(false);
  });

  it("exposes the final block copy incl. size and supply questions", () => {
    expect(GEN_FINAL_COPY.photos).toContain("generator");
    expect(GEN_FINAL_COPY.photos).toContain("control panel");
    expect(GEN_FINAL_COPY.size).toMatch(/size \(kVA\)/i);
    expect(GEN_FINAL_COPY.supply).toMatch(/supplying parts/i);
  });

  it("composes the problem text with labels and answers", () => {
    const out = composeGeneratorProblem(
      {
        machine: "catalog",
        machine_label: "Petrol · Elepaq · SV7200 2.8kVA",
        start: "A",
        start_label: "New generator installation or purchase advice",
        a_property: "residential",
        a_property_label: "Residential house / flat",
      },
      "Install for my shop",
      "Lagos Island",
    );
    expect(out).toContain(GEN_MACHINE_QUESTION);
    expect(out).toContain("Petrol · Elepaq · SV7200 2.8kVA");
    expect(out).toContain(GEN_START_QUESTION);
    expect(out).toContain("Residential house / flat");
    expect(out).toContain("Lagos Island");
    expect(out).toContain("Install for my shop");
  });

  it("builds a breadcrumb with branch letter and send state", () => {
    expect(generatorBreadcrumb(["start"])).toBe("Generator");
    expect(generatorBreadcrumb(["machine"])).toBe("Generator");
    expect(generatorBreadcrumb(["start", "e_issue"])).toBe("Generator · E");
    expect(generatorBreadcrumb(["machine", "start", "e_issue"])).toBe(
      "Generator · E",
    );
    expect(generatorBreadcrumb(["start", "final"])).toBe("Generator · Send");
    expect(generatorBreadcrumb(["start", "e_issue", "e_kind", "final"])).toBe(
      "Generator · E · Send",
    );
  });

  it("exposes every chained screen with a question", () => {
    const ids = [
      "machine",
      "start",
      "a_property",
      "a_power",
      "a_type",
      "a_size",
      "a_supply",
      "a_changeover",
      "b_start",
      "b_type",
      "b_service",
      "b_fuel",
      "b_work",
      "c_output",
      "c_voltage",
      "c_load",
      "c_changeover",
      "d_service",
      "d_last",
      "d_spec",
      "d_problem",
      "e_issue",
      "e_kind",
      "e_history",
      "f_happening",
      "f_when",
      "f_oil",
      "g_describe",
      "g_location",
    ];
    for (const id of ids) {
      const screen = genScreen(id);
      expect(screen).toBeDefined();
      expect(screen?.question?.length).toBeGreaterThan(0);
      expect(GEN_SCREENS[id]).toBeDefined();
    }
  });
});
