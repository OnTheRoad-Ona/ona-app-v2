import { describe, expect, it } from "vitest";
import {
  applyConfirmChoice,
  batteryBreadcrumb,
  batteryDiagnosis,
  canAdvanceText,
  canFindBatteryPro,
  composeBatteryProblem,
  confirmQuestion,
  BATTERY_START_OPTIONS,
  BATTERY_START_QUESTION,
  nextBatteryScreen,
  resolveBatteryRoute,
} from "@/lib/battery/question-tree";

describe("battery question tree", () => {
  it("uses the battery start question and offers branches A–H", () => {
    expect(BATTERY_START_QUESTION).toBe(
      "What is the main battery or starting problem you are experiencing?"
    );
    expect(BATTERY_START_OPTIONS.map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
    ]);
  });

  it("opens each branch from start", () => {
    expect(nextBatteryScreen("start", "A", { start: "A" })).toBe("a_sudden");
    expect(nextBatteryScreen("start", "B", { start: "B" })).toBe("b_click");
    expect(nextBatteryScreen("start", "C", { start: "C" })).toBe("c_howlong");
    expect(nextBatteryScreen("start", "D", { start: "D" })).toBe("d_often");
    expect(nextBatteryScreen("start", "E", { start: "E" })).toBe("e_suspect");
    expect(nextBatteryScreen("start", "F", { start: "F" })).toBe("f_sudden");
    expect(nextBatteryScreen("start", "G", { start: "G" })).toBe("g_describe");
    expect(nextBatteryScreen("start", "H", { start: "H" })).toBe("ev_type");
  });

  it("routes the EV battery branch to the safe-location screen, then resolves", () => {
    expect(
      nextBatteryScreen("ev_type", "hv", {
        start: "H",
        ev_type: "hv",
      })
    ).toBe("ev_safe");
    expect(
      nextBatteryScreen("ev_safe", "yes", {
        start: "H",
        ev_type: "hv",
        ev_safe: "yes",
      })
    ).toBe("final");
  });

  it("diagnoses EV battery issues and keeps Battery trade for HV/12V, routes charging to Electrical", () => {
    expect(
      batteryDiagnosis({ start: "H", ev_type: "12v" })
    ).toContain("12V auxiliary battery");
    expect(
      batteryDiagnosis({ start: "H", ev_type: "hv" })
    ).toContain("high-voltage");
    expect(
      batteryDiagnosis({ start: "H", ev_type: "charging" })
    ).toContain("charging fault");

    const hv = resolveBatteryRoute({ start: "H", ev_type: "hv", ev_safe: "yes" });
    expect(hv.trade).toBe("battery");
    expect(hv.needsConfirm).toBe(false);
    const charging = resolveBatteryRoute({
      start: "H",
      ev_type: "charging",
      ev_safe: "yes",
    });
    expect(charging.trade).toBe("electrical");
    expect(charging.alternate).toBe("battery");
  });

  it("keeps a classic dead battery on Battery (no confirm card)", () => {
    const route = resolveBatteryRoute({
      start: "A",
      a_sudden: "suddenly",
      a_terminals: "yes",
      a_safe: "yes",
    });
    expect(route.trade).toBe("battery");
    expect(route.needsConfirm).toBe(false);
  });

  it("offers Electrical alongside Battery when terminals are corroded or loose", () => {
    const route = resolveBatteryRoute({
      start: "A",
      a_terminals: "no",
      a_safe: "yes",
    });
    expect(route.trade).toBe("battery");
    expect(route.alternate).toBe("electrical");
    expect(route.needsConfirm).toBe(true);
    expect(applyConfirmChoice(route, true)).toBe("battery");
    expect(applyConfirmChoice(route, false)).toBe("electrical");
  });

  it("routes to Tow first when the vehicle is in a dangerous location", () => {
    const route = resolveBatteryRoute({ start: "A", a_safe: "no" });
    expect(route.trade).toBe("towing");
    expect(route.needsConfirm).toBe(true);
  });

  it("reaches the confirm card only when the branch needs it", () => {
    const confirmAnswers = { start: "A", a_terminals: "no", a_safe: "yes" };
    const seamlessAnswers = { start: "A", a_terminals: "yes", a_safe: "yes" };
    expect(nextBatteryScreen("a_safe", "yes", confirmAnswers)).toBe("confirm");
    expect(nextBatteryScreen("a_safe", "yes", seamlessAnswers)).toBe("final");
  });

  it("offers Electrical after a recent battery/electrical job on branch B", () => {
    const route = resolveBatteryRoute({ start: "B", b_recent: "yes" });
    expect(route.trade).toBe("electrical");
    expect(route.alternate).toBe("battery");
    expect(route.needsConfirm).toBe(true);
    expect(applyConfirmChoice(route, false)).toBe("battery");
  });

  it("stays on Battery for a plain no-crank", () => {
    const route = resolveBatteryRoute({
      start: "B",
      b_click: "rapid",
      b_bright: "dim",
      b_recent: "no",
      b_safe: "yes",
    });
    expect(route.trade).toBe("battery");
    expect(route.needsConfirm).toBe(false);
  });

  it("stays on Battery for weak cranking", () => {
    const route = resolveBatteryRoute({
      start: "C",
      c_howlong: "days",
      c_eventual: "eventually",
      c_idle: "no",
      c_age: "3_4",
    });
    expect(route.trade).toBe("battery");
    expect(route.needsConfirm).toBe(false);
  });

  it("strongly offers Electrical when the battery light comes on while driving", () => {
    const route = resolveBatteryRoute({ start: "D", d_warning: "yes" });
    expect(route.trade).toBe("electrical");
    expect(route.alternate).toBe("battery");
  });

  it("stays on Battery for frequent flattening without the warning light", () => {
    const route = resolveBatteryRoute({
      start: "D",
      d_often: "weekly",
      d_warning: "no",
      d_altchecked: "never",
    });
    expect(route.trade).toBe("battery");
    expect(route.needsConfirm).toBe(false);
  });

  it("stays on Battery for testing / replacement", () => {
    const route = resolveBatteryRoute({
      start: "E",
      e_suspect: "maybe",
      e_test_first: "test",
    });
    expect(route.trade).toBe("battery");
    expect(route.needsConfirm).toBe(false);
  });

  it("offers Electrical (alternator) first for the driving warning light", () => {
    const route = resolveBatteryRoute({
      start: "F",
      f_sudden: "gradually",
      f_dim: "yes",
      f_stall: "no",
      f_smell: "no",
    });
    expect(route.trade).toBe("electrical");
    expect(route.alternate).toBe("battery");
    expect(route.needsConfirm).toBe(true);
  });

  it("routes branch G sub-problems to the matching trades", () => {
    expect(resolveBatteryRoute({ start: "G", g_related: "engine" }).trade).toBe("mechanic");
    expect(resolveBatteryRoute({ start: "G", g_related: "tyre" }).trade).toBe("vulcanizer");
    expect(resolveBatteryRoute({ start: "G", g_related: "towing" }).trade).toBe("towing");
    expect(resolveBatteryRoute({ start: "G", g_related: "body" }).trade).toBe("body");
    expect(resolveBatteryRoute({ start: "G", g_related: "ac" }).trade).toBe("ac");
    expect(resolveBatteryRoute({ start: "G", g_related: "electrical" }).trade).toBe("electrical");
    expect(resolveBatteryRoute({ start: "G", g_related: "clothing" }).trade).toBe("fashion");
    expect(resolveBatteryRoute({ start: "G", g_related: "battery" }).trade).toBe("battery");
    expect(
      resolveBatteryRoute({ start: "G", g_related: "power", g_power: "solar" }).trade
    ).toBe("solar");
    expect(
      resolveBatteryRoute({ start: "G", g_related: "power", g_power: "generator" }).trade
    ).toBe("generator");
    expect(
      resolveBatteryRoute({ start: "G", g_related: "house", g_house: "plumber" }).trade
    ).toBe("plumber");
    expect(
      resolveBatteryRoute({ start: "G", g_related: "house", g_house: "painter" }).trade
    ).toBe("painter");
    expect(
      resolveBatteryRoute({ start: "G", g_related: "house", g_house: "carpenter" }).trade
    ).toBe("carpenter");
  });

  it("walks branch G through the sub-questions", () => {
    expect(nextBatteryScreen("g_describe", "tyre", {})).toBe("g_related");
    expect(nextBatteryScreen("g_related", "power", {})).toBe("g_power");
    expect(nextBatteryScreen("g_related", "house", {})).toBe("g_house");
    expect(nextBatteryScreen("g_related", "engine", { start: "G", g_related: "engine" })).toBe("confirm");
  });

  it("builds the confirm question with a friendly label", () => {
    expect(confirmQuestion("electrical")).toBe("This sounds like Electrical. Continue?");
    expect(confirmQuestion("towing")).toBe("This sounds like Tow. Continue?");
  });

  it("composes the problem text from questions and answers", () => {
    const text = composeBatteryProblem(
      { start: "A", a_terminals: "no", a_safe: "yes" },
      "Battery died near the gate",
      "Ojota, Lagos"
    );
    expect(text).toContain(BATTERY_START_QUESTION);
    expect(text).toContain("Vehicle is completely dead (no lights, no sound)");
    expect(text).toContain("No, corroded or loose");
    expect(text).toContain("Ojota, Lagos");
    expect(text).toContain("Battery died near the gate");
  });

  it("keeps photos optional (min 0, max 4) and validates free text", () => {
    expect(canFindBatteryPro(0)).toBe(true);
    expect(canFindBatteryPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });

  it("builds a breadcrumb of the branch letter and phase", () => {
    expect(batteryBreadcrumb(["vehicle", "start"])).toBe("Battery");
    expect(batteryBreadcrumb(["vehicle", "a_sudden", "a_terminals"])).toBe(
      "Battery · A"
    );
    expect(batteryBreadcrumb(["vehicle", "start", "confirm"])).toBe(
      "Battery · Confirm"
    );
    expect(batteryBreadcrumb(["vehicle", "start", "final"])).toBe(
      "Battery · Send"
    );
  });
});