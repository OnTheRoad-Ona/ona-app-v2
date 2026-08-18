import { describe, expect, it } from "vitest";
import {
  canAdvanceText,
  canFindPlumberPro,
  composePlumberProblem,
  PLUMBER_FINAL_COPY,
  PLUMBER_MAX_PHOTOS,
  PLUMBER_MIN_PHOTOS,
  PLUMBER_SCREENS,
  PLUMBER_START_OPTIONS,
  PLUMBER_START_QUESTION,
  plumberBreadcrumb,
  plumberScreen,
  nextPlumberScreen,
  resolvePlumberRoute,
} from "@/lib/plumber/question-tree";

describe("plumber question tree", () => {
  it("offers the eight start categories A–H", () => {
    expect(PLUMBER_START_OPTIONS.map((o) => o.id)).toEqual([
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

  it("routes each start branch to its first screen", () => {
    expect(nextPlumberScreen("start", "A", {})).toBe("a_flow");
    expect(nextPlumberScreen("start", "B", {})).toBe("b_source");
    expect(nextPlumberScreen("start", "C", {})).toBe("c_blocked");
    expect(nextPlumberScreen("start", "D", {})).toBe("d_what");
    expect(nextPlumberScreen("start", "E", {})).toBe("e_issue");
    expect(nextPlumberScreen("start", "F", {})).toBe("f_happening");
    expect(nextPlumberScreen("start", "G", {})).toBe("g_install");
    expect(nextPlumberScreen("start", "H", {})).toBe("h_describe");
  });

  it("walks the full no-water (A) chain to final", () => {
    expect(nextPlumberScreen("a_flow", "completely-none", {})).toBe("a_area");
    expect(nextPlumberScreen("a_area", "whole-house", {})).toBe("a_supply");
    expect(nextPlumberScreen("a_supply", "borehole", {})).toBe("a_tank");
    expect(nextPlumberScreen("a_tank", "overhead-tank", {})).toBe("a_started");
    expect(nextPlumberScreen("a_started", "Since yesterday", {})).toBe("final");
  });

  it("walks the full leakage (B) chain to final", () => {
    expect(nextPlumberScreen("b_source", "pipe", {})).toBe("b_flow");
    expect(nextPlumberScreen("b_flow", "slow-dripping", {})).toBe("b_damage");
    expect(nextPlumberScreen("b_damage", "yes", {})).toBe("b_exact");
    expect(nextPlumberScreen("b_exact", "no", {})).toBe("final");
  });

  it("walks the full blocked (C) chain to final", () => {
    expect(nextPlumberScreen("c_blocked", "kitchen-sink", {})).toBe("c_backup");
    expect(nextPlumberScreen("c_backup", "backing-up", {})).toBe("c_tried");
    expect(nextPlumberScreen("c_tried", "no", {})).toBe("c_howlong");
    expect(nextPlumberScreen("c_howlong", "Since last night", {})).toBe(
      "final"
    );
  });

  it("walks the full tap/shower (D), geyser (E) and toilet (F) chains to final", () => {
    expect(nextPlumberScreen("d_what", "tap-leaking", {})).toBe("d_mount");
    expect(nextPlumberScreen("d_mount", "wall-mounted", {})).toBe("d_fix");
    expect(nextPlumberScreen("d_fix", "repair", {})).toBe("final");

    expect(nextPlumberScreen("e_issue", "not-heating", {})).toBe("e_type");
    expect(nextPlumberScreen("e_type", "electric", {})).toBe("e_age");
    expect(nextPlumberScreen("e_age", "3 years", {})).toBe("final");

    expect(nextPlumberScreen("f_happening", "weak-flush", {})).toBe(
      "f_cistern"
    );
    expect(nextPlumberScreen("f_cistern", "dual-flush", {})).toBe("final");
  });

  it("walks the full installation (G) and other (H) chains to final", () => {
    expect(nextPlumberScreen("g_install", "kitchen", {})).toBe("g_building");
    expect(nextPlumberScreen("g_building", "existing", {})).toBe("final");

    expect(nextPlumberScreen("h_describe", "gurgling noise", {})).toBe(
      "h_area"
    );
    expect(nextPlumberScreen("h_area", "Upstairs bathroom", {})).toBe("final");
  });

  it("is strictly plumbing — always Plumber, never a confirm card", () => {
    const cases: Record<string, string>[] = [
      { start: "A" },
      { start: "B" },
      { start: "G", g_install: "full-repipe" },
      { start: "H", h_describe: "flooding" },
    ];
    for (const answers of cases) {
      expect(resolvePlumberRoute(answers).trade).toBe("plumber");
      expect(resolvePlumberRoute(answers).needsConfirm).toBe(false);
    }
  });

  it("requires 2 photos (min 2, max 4)", () => {
    expect(PLUMBER_MIN_PHOTOS).toBe(2);
    expect(PLUMBER_MAX_PHOTOS).toBe(4);
    expect(canFindPlumberPro(0)).toBe(false);
    expect(canFindPlumberPro(1)).toBe(false);
    expect(canFindPlumberPro(2)).toBe(true);
    expect(canFindPlumberPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText("  ")).toBe(false);
  });

  it("composes the problem text with questions and answers", () => {
    const out = composePlumberProblem(
      {
        start: "A",
        a_flow: "completely-none",
        a_flow_label: "Completely no water",
      },
      "No water for two days",
      "Lekki"
    );
    expect(out).toContain(PLUMBER_START_QUESTION);
    expect(out).toContain("Completely no water");
    expect(out).toContain("Lekki");
    expect(out).toContain("No water for two days");
  });

  it("builds a breadcrumb with branch letter and send state", () => {
    expect(plumberBreadcrumb(["start"])).toBe("Plumber");
    expect(plumberBreadcrumb(["start", "b_source"])).toBe("Plumber · B");
    expect(plumberBreadcrumb(["start", "final"])).toBe("Plumber · Send");
  });

  it("exposes every chained screen with a question", () => {
    const ids = [
      "start",
      "a_flow",
      "a_area",
      "a_supply",
      "a_tank",
      "a_started",
      "b_source",
      "b_flow",
      "b_damage",
      "b_exact",
      "c_blocked",
      "c_backup",
      "c_tried",
      "c_howlong",
      "d_what",
      "d_mount",
      "d_fix",
      "e_issue",
      "e_type",
      "e_age",
      "f_happening",
      "f_cistern",
      "g_install",
      "g_building",
      "h_describe",
      "h_area",
    ];
    for (const id of ids) {
      const screen = plumberScreen(id);
      expect(screen).toBeDefined();
      expect(screen?.question?.length).toBeGreaterThan(0);
      expect(PLUMBER_SCREENS[id]).toBeDefined();
    }
  });

  it("exposes the final block copy incl. property question", () => {
    expect(PLUMBER_FINAL_COPY.photos).toContain("2–4");
    expect(PLUMBER_FINAL_COPY.property).toMatch(/property/i);
  });
});
