import { describe, expect, it } from "vitest";
import {
  applyConfirmChoice,
  canAdvanceText,
  canFindMechanicPro,
  composeMechanicProblem,
  confirmQuestion,
  MECHANIC_START_OPTIONS,
  MECHANIC_START_QUESTION,
  nextMechanicScreen,
  resolveMechanicRoute,
} from "@/lib/mechanic/question-tree";

describe("mechanic question tree", () => {
  it("uses the short start question and drops A/C and electrical", () => {
    expect(MECHANIC_START_QUESTION).toBe("What's wrong with your vehicle?");
    expect(MECHANIC_START_OPTIONS.map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
    ]);
    expect(
      MECHANIC_START_OPTIONS.some((o) => /air conditioning/i.test(o.label))
    ).toBe(false);
    expect(
      MECHANIC_START_OPTIONS.some((o) => /electrical/i.test(o.label))
    ).toBe(false);
  });

  it("opens branch A from start", () => {
    expect(nextMechanicScreen("start", "A", { start: "A" })).toBe("a_what");
  });

  it("routes silent + no lights to Battery, with Electrical as the other", () => {
    const answers = {
      start: "A",
      a_what: "silent",
      a_lights: "none",
      a_danger: "no",
    };
    const route = resolveMechanicRoute(answers);
    expect(route.trade).toBe("battery");
    expect(route.alternate).toBe("electrical");
    expect(route.needsConfirm).toBe(true);
    expect(applyConfirmChoice(route, true)).toBe("battery");
    expect(applyConfirmChoice(route, false)).toBe("electrical");
  });

  it("keeps crank-no-start with Mechanic", () => {
    const route = resolveMechanicRoute({
      start: "A",
      a_what: "cranks_no_start",
      a_lights: "normal",
      a_danger: "no",
    });
    expect(route.trade).toBe("mechanic");
    expect(route.needsConfirm).toBe(false);
  });

  it("jumps to Tow when the car is in a dangerous place", () => {
    const route = resolveMechanicRoute({
      start: "A",
      a_what: "cranks_no_start",
      a_danger: "yes",
    });
    expect(route.trade).toBe("towing");
    expect(route.needsConfirm).toBe(true);
  });

  it("routes wheel / brake noise to Vulcanizer", () => {
    expect(
      resolveMechanicRoute({
        start: "C",
        c_where: "wheels",
        c_when: "moving",
        c_sound: "squealing",
        c_safe: "yes",
      }).trade
    ).toBe("vulcanizer");
    expect(
      resolveMechanicRoute({
        start: "C",
        c_where: "engine",
        c_when: "braking",
        c_sound: "grinding",
        c_safe: "yes",
      }).trade
    ).toBe("vulcanizer");
  });

  it("routes tyres away from Mechanic", () => {
    expect(
      resolveMechanicRoute({
        start: "I",
        j_kind: "flat",
        j_multi: "no",
      }).trade
    ).toBe("vulcanizer");
  });

  it("routes body damage to Body, and not-driveable to Tow", () => {
    expect(
      resolveMechanicRoute({
        start: "H",
        i_accident: "yes",
        i_driveable: "yes",
      }).trade
    ).toBe("body");
    expect(
      resolveMechanicRoute({
        start: "H",
        i_accident: "yes",
        i_driveable: "no",
      }).trade
    ).toBe("towing");
  });

  it("routes home/shop power and clothing away from Mechanic", () => {
    expect(
      resolveMechanicRoute({
        start: "J",
        l_related: "power",
        l_power: "solar",
      }).trade
    ).toBe("solar");
    expect(
      resolveMechanicRoute({
        start: "J",
        l_related: "clothing",
      }).trade
    ).toBe("fashion");
    expect(
      resolveMechanicRoute({
        start: "J",
        l_related: "vehicle",
      }).trade
    ).toBe("mechanic");
  });

  it("asks Continue with the stronger trade name", () => {
    expect(confirmQuestion("battery")).toBe(
      "This sounds like Battery. Continue?"
    );
    expect(confirmQuestion("towing")).toBe("This sounds like Tow. Continue?");
  });

  it("writes the answers into the job problem text", () => {
    const text = composeMechanicProblem(
      {
        start: "A",
        a_what: "silent",
        a_what_label: "Completely silent / nothing happens",
      },
      "please hurry",
      " lekki phase 1 "
    );
    expect(text).toContain(MECHANIC_START_QUESTION);
    expect(text).toContain("The vehicle will not start at all");
    expect(text).toContain("Completely silent / nothing happens");
    expect(text).toContain("please hurry");
    expect(text).toContain("lekki phase 1");
  });

  it("needs two photos before Find a Repair Pro", () => {
    expect(canFindMechanicPro(0)).toBe(false);
    expect(canFindMechanicPro(1)).toBe(false);
    expect(canFindMechanicPro(2)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });
});
