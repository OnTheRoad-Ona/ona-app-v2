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
  rankMechanicParts,
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
    ]);
    expect(MECHANIC_START_OPTIONS.map((o) => o.label)).toEqual([
      "The vehicle will not start at all",
      "The vehicle starts but stops, loses power, or stalls while driving",
      "Strange noise coming from the vehicle",
      "Overheating or temperature warning",
      "Smoke, burning smell, or unusual smell",
      "Fluid leak (oil, water, fuel, etc.)",
      "Transmission / gear / clutch problem",
      "Electric vehicle (EV) problem",
      "Something else / I am not sure",
    ]);
    expect(
      MECHANIC_START_OPTIONS.some((o) => /air conditioning/i.test(o.label)),
    ).toBe(false);
    expect(
      MECHANIC_START_OPTIONS.some((o) => /electrical/i.test(o.label)),
    ).toBe(false);
    expect(
      MECHANIC_START_OPTIONS.some((o) => /tyre/i.test(o.label)),
    ).toBe(false);
    expect(
      MECHANIC_START_OPTIONS.some((o) => /body damage/i.test(o.label)),
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
      nextMechanicScreen("start", "G", { start: "G", powertrain: "Electric" }),
    ).toBe("g_ev");
    expect(
      nextMechanicScreen("start", "G", { start: "G", powertrain: "Petrol" }),
    ).toBe("g_type");
  });

  it("opens and resolves the EV (H) branch from start, before Something else", () => {
    expect(nextMechanicScreen("start", "H", { start: "H" })).toBe("ev_issue");
    expect(nextMechanicScreen("ev_issue", "other", { start: "H" })).toBe(
      "ev_other",
    );
    expect(
      nextMechanicScreen("ev_issue", "charging", {
        start: "H",
        ev_issue: "charging",
      }),
    ).toBe("confirm");
  });

  it("diagnoses and routes EV issues: charging→Electrical, battery→Battery, motor no-drive→Tow", () => {
    expect(mechanicDiagnosis({ start: "H", ev_issue: "charging" })).toContain(
      "charging",
    );
    expect(mechanicDiagnosis({ start: "H", ev_issue: "battery" })).toContain(
      "high-voltage",
    );
    expect(
      mechanicDiagnosis({ start: "H", ev_issue: "motor_no_drive" }),
    ).toContain("motor");
    expect(
      mechanicDiagnosis({ start: "H", ev_issue: "won_t_start" }),
    ).toContain("12V auxiliary");

    const charging = resolveMechanicRoute({ start: "H", ev_issue: "charging" });
    expect(charging.trade).toBe("electrical");
    expect(charging.alternate).toBe("mechanic");
    const battery = resolveMechanicRoute({ start: "H", ev_issue: "battery" });
    expect(battery.trade).toBe("battery");
    expect(battery.alternate).toBe("electrical");
    const motor = resolveMechanicRoute({
      start: "H",
      ev_issue: "motor_no_drive",
    });
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
      }).trade,
    ).toBe("vulcanizer");
    expect(
      resolveMechanicRoute({
        start: "C",
        c_where: "engine",
        c_when: "braking",
        c_sound: "grinding",
        c_safe: "yes",
      }).trade,
    ).toBe("vulcanizer");
  });

  it("does not offer tyre or body on Mechanic start", () => {
    expect(nextMechanicScreen("start", "I", { start: "I" })).toBe("l_describe");
    expect(nextMechanicScreen("start", "H", { start: "H" })).toBe("ev_issue");
  });

  it("never routes to Tow when the vehicle can still move", () => {
    expect(
      resolveMechanicRoute({
        start: "F",
        f_color: "coolant",
        f_where: "under the car",
        f_safe: "yes",
      }).trade,
    ).toBe("mechanic");
    expect(
      resolveMechanicRoute({
        start: "B",
        b_how: "gradual",
        b_move: "yes",
      }).trade,
    ).toBe("mechanic");
    expect(
      resolveMechanicRoute({
        start: "D",
        d_safe: "yes",
      }).trade,
    ).toBe("mechanic");
  });

  it("routes to Tow when the vehicle cannot drive safely", () => {
    expect(
      resolveMechanicRoute({
        start: "F",
        f_color: "coolant",
        f_where: "under the car",
        f_safe: "no",
      }).trade,
    ).toBe("towing");
    expect(
      resolveMechanicRoute({
        start: "D",
        d_safe: "no",
      }).trade,
    ).toBe("towing");
  });

  it("routes home/shop power and clothing away from Mechanic", () => {
    expect(
      resolveMechanicRoute({
        start: "I",
        l_related: "power",
        l_power: "solar",
      }).trade,
    ).toBe("solar");
    expect(
      resolveMechanicRoute({
        start: "I",
        l_related: "clothing",
      }).trade,
    ).toBe("fashion");
    expect(
      resolveMechanicRoute({
        start: "I",
        l_related: "vehicle",
      }).trade,
    ).toBe("mechanic");
  });

  it("asks Continue with the stronger trade name", () => {
    expect(confirmQuestion("battery")).toBe(
      "This sounds like Battery. Continue?",
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
      " lekki phase 1 ",
    );
    expect(text).toContain(MECHANIC_START_QUESTION);
    expect(text).toContain("The vehicle will not start at all");
    expect(text).toContain("Completely silent / nothing happens");
    expect(text).toContain("please hurry");
    expect(text).toContain("lekki phase 1");
  });

  it("omits leftover answers from other mechanic branches", () => {
    const text = composeMechanicProblem(
      {
        start: "G",
        start_label: "Transmission / gear / clutch problem",
        j_kind: "flat",
        j_kind_label: "Flat",
        b_how: "suddenly",
        b_how_label: "Suddenly like someone switched it off",
        d_when: "long_drive",
        d_when_label: "After long drive",
        rad_steam: "leak",
        rad_steam_label: "Water leaking",
        g_type: "hybrid",
        g_type_label: "Hybrid",
        g_what: "hard",
        g_what_label: "Hard to change gear",
        gear_when: "always",
        gear_when_label: "Always",
        gear_fluid: "none",
        gear_fluid_label: "None",
        gear_light: "engine",
        gear_light_label: "Check engine light",
      },
      "",
      "Dr.frank Okafor Close",
    );
    expect(text).toContain("Transmission / gear / clutch problem");
    expect(text).toContain("Hard to change gear");
    expect(text).toContain("Hybrid");
    expect(text).not.toContain("Flat");
    expect(text).not.toContain("Suddenly like someone switched it off");
    expect(text).not.toContain("Water leaking");
    expect(text).not.toContain("When did it start overheating");
    expect(text).not.toContain("Which tyre");
  });

  it("adds a likely-problem diagnosis line to the summary", () => {
    const text = composeMechanicProblem(
      { start: "A", a_what: "silent", a_lights: "none" },
      "",
      "",
    );
    expect(text).toContain("Likely problem");
    expect(text).toContain("Likely a dead battery or a blown fuse");
    expect(mechanicDiagnosis({ start: "C", c_where: "wheels" })).toBe(
      "Likely a wheel, brake, or suspension issue",
    );
    expect(mechanicDiagnosis({ start: "H" })).toBe(
      "EV problem (customer described)",
    );
  });

  it("inserts a part picker when several systems are close", () => {
    const answers = {
      start: "A",
      a_what: "cranks_no_start",
      a_lights: "normal",
      a_when: "suddenly",
      a_recent: "no",
      a_danger: "no",
    };
    const ranked = rankMechanicParts(answers);
    expect(ranked.length).toBeGreaterThan(1);
    expect(ranked).toEqual(
      expect.arrayContaining(["engine", "fuel", "brain"]),
    );
    expect(nextMechanicScreen("a_danger", "no", answers)).toBe("part_pick");
    const pick = mechanicScreen("part_pick", answers);
    expect(pick?.options?.map((o) => o.id)).toEqual([...ranked, "not_sure"]);
    expect(pick?.options?.at(-1)?.label).toBe("I'm not sure");
    expect(nextMechanicScreen("part_pick", "engine", answers)).toBe("eng_sym");
    // "I'm not sure" skips the part cascade and lands on confirm/final.
    expect(
      ["confirm", "final"].includes(
        nextMechanicScreen("part_pick", "not_sure", answers),
      ),
    ).toBe(true);
    expect(
      nextMechanicScreen("eng_plug", "no", { ...answers, part_pick: "engine" }),
    ).toBe("final");
  });

  it("skips the picker when one system is clearly ahead (Gear)", () => {
    const answers = {
      start: "G",
      g_type: "automatic",
      g_what: "slipping",
    };
    expect(rankMechanicParts(answers)).toEqual(["gear"]);
    expect(nextMechanicScreen("g_what", "slipping", answers)).toBe("gear_when");
  });

  it("does not add a part cascade when Tow is required", () => {
    expect(
      nextMechanicScreen("a_danger", "yes", {
        start: "A",
        a_what: "cranks_no_start",
        a_danger: "yes",
      }),
    ).toBe("confirm");
  });

  it("keeps EV off the vehicle-part cascade", () => {
    expect(
      nextMechanicScreen("ev_issue", "charging", {
        start: "H",
        ev_issue: "charging",
      }),
    ).toBe("confirm");
  });

  it("names Engine / Gear / Power steering / Brain box in workshop terms", () => {
    expect(
      mechanicDiagnosis({ start: "A", part_pick: "engine", eng_sym: "knock" }),
    ).toContain("knock");
    expect(
      mechanicDiagnosis({
        start: "G",
        g_what: "slipping",
        gear_fluid: "burnt",
      }),
    ).toContain("gearbox");
    expect(
      mechanicDiagnosis({ start: "C", str_feel: "heavy" }),
    ).toContain("power steering");
    expect(
      mechanicDiagnosis({ start: "B", brn_light: "immobilizer" }),
    ).toContain("brain box");
  });

  it("allows Find a Repair Pro with zero to four photos", () => {
    expect(canFindMechanicPro(0)).toBe(true);
    expect(canFindMechanicPro(4)).toBe(true);
    expect(canFindMechanicPro(5)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });
});
