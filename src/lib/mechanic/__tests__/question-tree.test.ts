import { describe, expect, it } from "vitest";
import {
  applyConfirmChoice,
  canAdvanceText,
  canFindMechanicPro,
  composeMechanicProblem,
  confirmQuestion,
  MECHANIC_START_OPTIONS,
  MECHANIC_START_QUESTION,
  mechanicDiagnosis,
  mechanicScreen,
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
      "K",
    ]);
    expect(
      MECHANIC_START_OPTIONS.some((o) => /air conditioning/i.test(o.label))
    ).toBe(false);
    expect(
      MECHANIC_START_OPTIONS.some((o) => /electrical/i.test(o.label))
    ).toBe(false);
  });

  it("offers Manual, Automatic, Hybrid and Electric for the transmission question", () => {
    const gType = mechanicScreen("g_type");
    expect(gType?.options?.map((o) => o.id)).toEqual([
      "manual",
      "automatic",
      "hybrid",
      "electric",
    ]);
  });

  it("routes Electric transmission to the EV drivetrain screen, others to g_what", () => {
    expect(nextMechanicScreen("g_type", "electric", {})).toBe("g_ev");
    expect(nextMechanicScreen("g_type", "hybrid", {})).toBe("g_what");
    expect(nextMechanicScreen("g_type", "automatic", {})).toBe("g_what");
    expect(nextMechanicScreen("g_type", "manual", {})).toBe("g_what");
  });

  it("skips the transmission question for an Electric powertrain vehicle", () => {
    expect(
      nextMechanicScreen("start", "G", { start: "G", powertrain: "Electric" })
    ).toBe("g_ev");
    expect(
      nextMechanicScreen("start", "G", { start: "G", powertrain: "Petrol" })
    ).toBe("g_type");
  });

  it("opens and resolves the EV (K) branch from start", () => {
    expect(nextMechanicScreen("start", "K", { start: "K" })).toBe("ev_issue");
    expect(nextMechanicScreen("ev_issue", "other", { start: "K" })).toBe(
      "ev_other"
    );
    expect(
      nextMechanicScreen("ev_issue", "charging", {
        start: "K",
        ev_issue: "charging",
      })
    ).toBe("confirm");
  });

  it("diagnoses and routes EV issues: charging→Electrical, battery→Battery, motor no-drive→Tow", () => {
    expect(
      mechanicDiagnosis({ start: "K", ev_issue: "charging" })
    ).toContain("charging");
    expect(
      mechanicDiagnosis({ start: "K", ev_issue: "battery" })
    ).toContain("high-voltage");
    expect(
      mechanicDiagnosis({ start: "K", ev_issue: "motor_no_drive" })
    ).toContain("motor");
    expect(
      mechanicDiagnosis({ start: "K", ev_issue: "won_t_start" })
    ).toContain("12V auxiliary");

    const charging = resolveMechanicRoute({ start: "K", ev_issue: "charging" });
    expect(charging.trade).toBe("electrical");
    expect(charging.alternate).toBe("mechanic");
    const battery = resolveMechanicRoute({ start: "K", ev_issue: "battery" });
    expect(battery.trade).toBe("battery");
    expect(battery.alternate).toBe("electrical");
    const motor = resolveMechanicRoute({ start: "K", ev_issue: "motor_no_drive" });
    expect(motor.trade).toBe("towing");
  });

  it("routes Electric transmission no-drive to Tow and other EV drivetrain to Electrical", () => {
    const noDrive = resolveMechanicRoute({
      start: "G",
      g_type: "electric",
      g_ev: "no_drive",
    });
    expect(noDrive.trade).toBe("towing");
    const powerLoss = resolveMechanicRoute({
      start: "G",
      g_type: "electric",
      g_ev: "loss_power",
    });
    expect(powerLoss.trade).toBe("electrical");
    expect(powerLoss.alternate).toBe("mechanic");
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

  it("never routes to Tow when the vehicle can still move", () => {
    expect(
      resolveMechanicRoute({
        start: "F",
        f_color: "coolant",
        f_where: "under the car",
        f_safe: "yes",
      }).trade
    ).toBe("mechanic");
    expect(
      resolveMechanicRoute({
        start: "B",
        b_how: "gradual",
        b_move: "yes",
      }).trade
    ).toBe("mechanic");
    expect(
      resolveMechanicRoute({
        start: "D",
        d_safe: "yes",
      }).trade
    ).toBe("mechanic");
  });

  it("routes to Tow when the vehicle cannot drive safely", () => {
    expect(
      resolveMechanicRoute({
        start: "F",
        f_color: "coolant",
        f_where: "under the car",
        f_safe: "no",
      }).trade
    ).toBe("towing");
    expect(
      resolveMechanicRoute({
        start: "D",
        d_safe: "no",
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

  it("adds a likely-problem diagnosis line to the summary", () => {
    const text = composeMechanicProblem(
      { start: "A", a_what: "silent", a_lights: "none" },
      "",
      ""
    );
    expect(text).toContain("Likely problem");
    expect(text).toContain("Likely a dead battery or a blown fuse");
    expect(mechanicDiagnosis({ start: "C", c_where: "wheels" })).toBe(
      "Likely a wheel, brake, or suspension issue"
    );
    expect(mechanicDiagnosis({ start: "H" })).toBe("Body and panel damage");
  });

  it("allows Find a Repair Pro with zero to four photos", () => {
    expect(canFindMechanicPro(0)).toBe(true);
    expect(canFindMechanicPro(4)).toBe(true);
    expect(canFindMechanicPro(5)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });
});
