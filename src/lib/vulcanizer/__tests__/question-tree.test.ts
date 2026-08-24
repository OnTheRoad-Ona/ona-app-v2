import { describe, expect, it } from "vitest";
import {
  applyVulcanizerConfirmChoice,
  canAdvanceText,
  canFindVulcanizerPro,
  composeVulcanizerProblem,
  confirmQuestion,
  VULCANIZER_START_OPTIONS,
  VULCANIZER_START_QUESTION,
  nextVulcanizerScreen,
  resolveVulcanizerRoute,
} from "@/lib/vulcanizer/question-tree";

describe("vulcanizer question tree", () => {
  it("asks the tyre/wheel start question with eight options", () => {
    expect(VULCANIZER_START_QUESTION).toBe(
      "What is the main tyre or wheel problem you are experiencing?",
    );
    expect(VULCANIZER_START_OPTIONS.map((o) => o.id)).toEqual([
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

  it("opens branch A from start", () => {
    expect(nextVulcanizerScreen("start", "A", { start: "A" })).toBe("a_which");
  });

  it("jumps from multiple flats to the multi-tyre branch", () => {
    expect(nextVulcanizerScreen("a_which", "more", { a_which: "more" })).toBe(
      "g_howmany",
    );
    expect(nextVulcanizerScreen("a_which", "front_left", {})).toBe("a_object");
  });

  it("routes a flat with no spare or on the road to Tow", () => {
    const route = resolveVulcanizerRoute({
      start: "A",
      a_which: "front_left",
      a_spare: "no",
      a_safe: "safe",
    });
    expect(route.trade).toBe("towing");
    expect(route.needsConfirm).toBe(true);

    const road = resolveVulcanizerRoute({
      start: "A",
      a_which: "front_left",
      a_spare: "yes",
      a_safe: "road",
    });
    expect(road.trade).toBe("towing");
  });

  it("keeps a single flat with spare in a safe spot with Vulcanizer", () => {
    const route = resolveVulcanizerRoute({
      start: "A",
      a_which: "rear_right",
      a_spare: "yes",
      a_safe: "safe",
    });
    expect(route.trade).toBe("vulcanizer");
    expect(route.needsConfirm).toBe(false);
  });

  it("routes multiple flats that cannot drive to Tow", () => {
    const route = resolveVulcanizerRoute({
      start: "A",
      a_which: "more",
      g_drive: "no",
    });
    expect(route.trade).toBe("towing");
    expect(
      resolveVulcanizerRoute({ start: "A", a_which: "more", g_drive: "yes" })
        .trade,
    ).toBe("vulcanizer");
  });

  it("routes an unsafe burst to Tow, but pull to one side to Mechanic", () => {
    expect(
      resolveVulcanizerRoute({
        start: "B",
        b_safe: "no",
        b_pull: "no",
        b_rim: "no",
        b_spare: "yes",
      }).trade,
    ).toBe("towing");

    const suspension = resolveVulcanizerRoute({
      start: "B",
      b_safe: "yes",
      b_spare: "yes",
      b_rim: "no",
      b_pull: "yes",
    });
    expect(suspension.trade).toBe("mechanic");
    expect(suspension.alternate).toBe("vulcanizer");
    expect(applyVulcanizerConfirmChoice(suspension, false)).toBe("vulcanizer");
  });

  it("stays with Vulcanizer for a slow puncture", () => {
    expect(
      resolveVulcanizerRoute({
        start: "C",
        c_damage: "sidewall",
        c_air: "yes",
      }).trade,
    ).toBe("vulcanizer");
  });

  it("routes an unsafe rim to Tow and an accident rim to Body", () => {
    expect(
      resolveVulcanizerRoute({
        start: "D",
        d_how: "pothole",
        d_air: "no",
        d_use: "unsafe",
      }).trade,
    ).toBe("towing");

    expect(
      resolveVulcanizerRoute({
        start: "D",
        d_how: "accident",
        d_use: "usable",
      }).trade,
    ).toBe("body");

    expect(
      resolveVulcanizerRoute({
        start: "D",
        d_how: "pothole",
        d_use: "usable",
      }).trade,
    ).toBe("vulcanizer");
  });

  it("routes loose steering to Mechanic, pure balancing stays", () => {
    expect(
      resolveVulcanizerRoute({
        start: "E",
        e_symptoms: "loose",
        e_trigger: "gradual",
      }).trade,
    ).toBe("mechanic");

    expect(
      resolveVulcanizerRoute({
        start: "E",
        e_symptoms: "vibration",
        e_trigger: "new_tyres",
      }).trade,
    ).toBe("vulcanizer");
  });

  it("keeps tyre replacement with Vulcanizer", () => {
    expect(
      resolveVulcanizerRoute({
        start: "F",
        f_which: "both_front",
        f_supply: "supply",
        f_balance: "yes",
      }).trade,
    ).toBe("vulcanizer");
  });

  it("routes the multi-tyre branch by driveability", () => {
    const notDriveable = resolveVulcanizerRoute({
      start: "G",
      g_howmany: "two",
      g_drive: "no",
    });
    expect(notDriveable.trade).toBe("towing");

    expect(
      resolveVulcanizerRoute({
        start: "G",
        g_howmany: "two",
        g_drive: "yes",
      }).trade,
    ).toBe("vulcanizer");
  });

  it("routes the something-else branch to the related trade", () => {
    expect(
      resolveVulcanizerRoute({ start: "H", h_related: "engine" }).trade,
    ).toBe("mechanic");
    expect(
      resolveVulcanizerRoute({ start: "H", h_related: "battery" }).trade,
    ).toBe("battery");
    expect(
      resolveVulcanizerRoute({ start: "H", h_related: "battery" }).alternate,
    ).toBe("electrical");
    expect(
      resolveVulcanizerRoute({ start: "H", h_related: "body" }).trade,
    ).toBe("body");
    expect(resolveVulcanizerRoute({ start: "H", h_related: "tow" }).trade).toBe(
      "towing",
    );
    expect(
      resolveVulcanizerRoute({
        start: "H",
        h_related: "power",
        h_power: "solar",
      }).trade,
    ).toBe("solar");
    expect(
      resolveVulcanizerRoute({
        start: "H",
        h_related: "power",
        h_power: "generator",
      }).trade,
    ).toBe("generator");
    expect(
      resolveVulcanizerRoute({
        start: "H",
        h_related: "house",
        h_house: "plumber",
      }).trade,
    ).toBe("plumber");
    expect(
      resolveVulcanizerRoute({ start: "H", h_related: "clothing" }).trade,
    ).toBe("fashion");
    expect(
      resolveVulcanizerRoute({ start: "H", h_related: "tyre" }).trade,
    ).toBe("vulcanizer");
  });

  it("defaults the confirm fallback back to Vulcanizer", () => {
    const route = resolveVulcanizerRoute({ start: "H", h_related: "tow" });
    expect(route.trade).toBe("towing");
    expect(applyVulcanizerConfirmChoice(route, false)).toBe("vulcanizer");
  });

  it("asks Continue with the stronger trade name", () => {
    expect(confirmQuestion("towing")).toBe("This sounds like Tow. Continue?");
    expect(confirmQuestion("vulcanizer")).toBe(
      "This sounds like Vulcanizer. Continue?",
    );
  });

  it("writes the answers into the job problem text", () => {
    const text = composeVulcanizerProblem(
      {
        start: "A",
        a_which: "front_left",
        a_which_label: "Front left",
      },
      "please hurry",
      " lekki phase 1 ",
    );
    expect(text).toContain(VULCANIZER_START_QUESTION);
    expect(text).toContain("Flat tyre / puncture");
    expect(text).toContain("Front left");
    expect(text).toContain("please hurry");
    expect(text).toContain("lekki phase 1");
  });

  it("allows Find a Repair Pro with zero to four photos", () => {
    expect(canFindVulcanizerPro(0)).toBe(true);
    expect(canFindVulcanizerPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });
});
