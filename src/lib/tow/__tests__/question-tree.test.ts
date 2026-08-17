import { describe, expect, it } from "vitest";
import {
  applyTowConfirmChoice,
  canAdvanceText,
  canFindTowPro,
  composeTowProblem,
  confirmQuestion,
  TOW_START_OPTIONS,
  TOW_START_QUESTION,
  nextTowScreen,
  resolveTowRoute,
} from "@/lib/tow/question-tree";

describe("tow question tree", () => {
  it("asks why towing is needed with seven options", () => {
    expect(TOW_START_QUESTION).toBe("Why do you need towing service?");
    expect(TOW_START_OPTIONS.map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
  });

  it("opens branch A from start", () => {
    expect(nextTowScreen("start", "A", { start: "A" })).toBe("a_what");
  });

  it("routes a complete breakdown to Tow and keeps it there", () => {
    const route = resolveTowRoute({
      start: "A",
      a_what: "overheating",
      a_roll: "yes",
      a_safe: "yes",
      a_vehicle: "saloon",
    });
    expect(route.trade).toBe("towing");
    expect(route.needsConfirm).toBe(false);
  });

  it("routes an accident to Tow with no confirm", () => {
    const route = resolveTowRoute({
      start: "B",
      b_serious: "moderate",
      b_injured: "no",
      b_parts: "front",
      b_blocking: "no",
      b_paint: "yes",
    });
    expect(route.trade).toBe("towing");
    expect(route.needsConfirm).toBe(false);
  });

  it("marks branch C as an emergency priority tow", () => {
    const route = resolveTowRoute({
      start: "C",
      c_location: "highway",
      c_hazard: "yes",
      c_drive: "no",
    });
    expect(route.trade).toBe("towing");
    expect(route.emergency).toBe(true);
  });

  it("prefers Vulcanizer for a single safe tyre, Tow for unsafe or multiple", () => {
    const safeSingle = resolveTowRoute({
      start: "D",
      d_count: "one",
      d_spare: "yes",
      d_tools: "yes",
      d_safe: "safe",
    });
    expect(safeSingle.trade).toBe("vulcanizer");
    expect(safeSingle.alternate).toBe("towing");
    expect(safeSingle.needsConfirm).toBe(true);

    const onRoad = resolveTowRoute({
      start: "D",
      d_count: "two",
      d_spare: "no",
      d_tools: "yes",
      d_safe: "road",
    });
    expect(onRoad.trade).toBe("towing");
    expect(onRoad.alternate).toBe("vulcanizer");
    expect(applyTowConfirmChoice(onRoad, true)).toBe("towing");
    expect(applyTowConfirmChoice(onRoad, false)).toBe("vulcanizer");
  });

  it("routes move-to-safer-place to Tow", () => {
    expect(
      resolveTowRoute({
        start: "E",
        e_reason: "workshop",
        e_drive: "no",
      }).trade
    ).toBe("towing");
  });

  it("routes a stuck vehicle to Tow with heavy recovery noted in the problem", () => {
    const route = resolveTowRoute({
      start: "F",
      f_deep: "deeply",
      f_recovery: "heavy",
      f_vehicle: "pickup",
    });
    expect(route.trade).toBe("towing");

    const text = composeTowProblem(
      {
        start: "F",
        f_recovery: "heavy",
        f_recovery_label: "Heavy-duty / winch recovery",
      },
      "",
      ""
    );
    expect(text).toContain("Heavy-duty / winch recovery needed");
  });

  it("routes the something-else branch to the related trade offer", () => {
    expect(
      resolveTowRoute({ start: "G", g_related: "engine_mech" }).alternate
    ).toBe("mechanic");
    expect(
      resolveTowRoute({ start: "G", g_related: "tyre_wheel" }).alternate
    ).toBe("vulcanizer");
    expect(
      resolveTowRoute({ start: "G", g_related: "battery_electrical" }).alternate
    ).toBe("battery");
    expect(
      resolveTowRoute({ start: "G", g_related: "body" }).alternate
    ).toBe("body");
    expect(resolveTowRoute({ start: "G", g_related: "ac" }).alternate).toBe(
      "ac"
    );
    expect(
      resolveTowRoute({ start: "G", g_related: "power", g_power: "solar" })
        .alternate
    ).toBe("solar");
    expect(
      resolveTowRoute({ start: "G", g_related: "power", g_power: "generator" })
        .alternate
    ).toBe("generator");
    expect(
      resolveTowRoute({ start: "G", g_related: "house", g_house: "plumber" })
        .alternate
    ).toBe("plumber");
    expect(
      resolveTowRoute({ start: "G", g_related: "clothing" }).alternate
    ).toBe("fashion");
    expect(
      resolveTowRoute({ start: "G", g_related: "moving" }).needsConfirm
    ).toBe(false);
  });

  it("defaults the confirm fallback back to Tow", () => {
    const route = resolveTowRoute({ start: "G", g_related: "ac" });
    expect(applyTowConfirmChoice(route, true)).toBe("towing");
    expect(applyTowConfirmChoice(route, false)).toBe("ac");
    const plain = resolveTowRoute({ start: "A", a_what: "stalled" });
    expect(applyTowConfirmChoice(plain, false)).toBe("towing");
  });

  it("asks Continue with the stronger trade name", () => {
    expect(confirmQuestion("towing")).toBe("This sounds like Tow. Continue?");
    expect(confirmQuestion("vulcanizer")).toBe(
      "This sounds like Vulcanizer. Continue?"
    );
  });

  it("writes the answers, destination and colour into the problem text", () => {
    const text = composeTowProblem(
      {
        start: "E",
        e_reason: "workshop",
        e_reason_label: "Going to a workshop for repairs",
      },
      "please hurry",
      "Lekki Phase 1",
      { destination: "Toyota Service Centre", colour: "Black" }
    );
    expect(text).toContain(TOW_START_QUESTION);
    expect(text).toContain("Going to a workshop for repairs");
    expect(text).toContain("Lekki Phase 1");
    expect(text).toContain("Toyota Service Centre");
    expect(text).toContain("Black");
    expect(text).toContain("please hurry");
  });

  it("requires at least two photos before finding a Tow pro", () => {
    expect(canFindTowPro(0)).toBe(false);
    expect(canFindTowPro(1)).toBe(false);
    expect(canFindTowPro(2)).toBe(true);
    expect(canFindTowPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });
});