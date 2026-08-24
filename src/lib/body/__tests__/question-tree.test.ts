import { describe, expect, it } from "vitest";
import {
  BODY_FINAL_COPY,
  BODY_MAX_PHOTOS,
  BODY_MIN_PHOTOS,
  BODY_SCREENS,
  BODY_START_OPTIONS,
  BODY_START_QUESTION,
  bodyBreadcrumb,
  bodyScreen,
  canAdvanceText,
  canFindBodyPro,
  composeBodyProblem,
  nextBodyScreen,
  resolveBodyRoute,
} from "@/lib/body/question-tree";

describe("body question tree", () => {
  it("offers the seven start categories A-G", () => {
    expect(BODY_START_OPTIONS.map((o) => o.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
  });

  it("routes each start letter into its branch", () => {
    expect(nextBodyScreen("start", "A", {})).toBe("a_serious");
    expect(nextBodyScreen("start", "B", {})).toBe("b_count");
    expect(nextBodyScreen("start", "C", {})).toBe("c_depth");
    expect(nextBodyScreen("start", "D", {})).toBe("d_state");
    expect(nextBodyScreen("start", "E", {})).toBe("e_part");
    expect(nextBodyScreen("start", "F", {})).toBe("f_areas");
    expect(nextBodyScreen("start", "G", {})).toBe("g_describe");
  });

  it("walks the full accident (A) chain to final", () => {
    expect(nextBodyScreen("a_serious", "minor", {})).toBe("a_parts");
    expect(nextBodyScreen("a_parts", "front wing", {})).toBe("a_driveable");
    expect(nextBodyScreen("a_driveable", "yes", {})).toBe("a_insurance");
    expect(nextBodyScreen("a_insurance", "no", {})).toBe("a_safe");
    expect(nextBodyScreen("a_safe", "yes", {})).toBe("final");
  });

  it("walks the full dent (B) chain to final", () => {
    expect(nextBodyScreen("b_count", "two", {})).toBe("b_panels");
    expect(nextBodyScreen("b_panels", "door", {})).toBe("b_depth");
    expect(nextBodyScreen("b_depth", "deep", {})).toBe("b_paint");
    expect(nextBodyScreen("b_paint", "both", {})).toBe("b_repair");
    expect(nextBodyScreen("b_repair", "pdr", {})).toBe("final");
  });

  it("walks the full scratch (C) chain to final", () => {
    expect(nextBodyScreen("c_depth", "metal", {})).toBe("c_size");
    expect(nextBodyScreen("c_size", "small", {})).toBe("c_respray");
    expect(nextBodyScreen("c_respray", "touchup", {})).toBe("c_paint");
    expect(nextBodyScreen("c_paint", "yes", {})).toBe("final");
  });

  it("walks the full bumper (D) chain to final", () => {
    expect(nextBodyScreen("d_state", "hanging", {})).toBe("d_position");
    expect(nextBodyScreen("d_position", "front", {})).toBe("d_mounts");
    expect(nextBodyScreen("d_mounts", "yes", {})).toBe("d_drive");
    expect(nextBodyScreen("d_drive", "no", {})).toBe("final");
  });

  it("walks the full door/fender/bonnet (E) chain to final", () => {
    expect(nextBodyScreen("e_part", "door", {})).toBe("e_opens");
    expect(nextBodyScreen("e_opens", "no", {})).toBe("e_alignment");
    expect(nextBodyScreen("e_alignment", "yes", {})).toBe("e_mechanical");
    expect(nextBodyScreen("e_mechanical", "hinge", {})).toBe("final");
  });

  it("walks the full panel beating (F) chain to final", () => {
    expect(nextBodyScreen("f_areas", "bonnet", {})).toBe("f_quotation");
    expect(nextBodyScreen("f_quotation", "quotation", {})).toBe("f_colour");
    expect(nextBodyScreen("f_colour", "same", {})).toBe("f_driveable");
    expect(nextBodyScreen("f_driveable", "yes", {})).toBe("final");
  });

  it("walks the full something-else (G) chain to final", () => {
    expect(nextBodyScreen("g_describe", "rattle", {})).toBe("g_related");
    expect(nextBodyScreen("g_related", "mechanic", {})).toBe("final");
  });

  it("never needs a confirm card body stays body everywhere", () => {
    const cases: Record<string, string>[] = [
      { start: "A", a_serious: "severe" },
      { start: "D", d_drive: "no" },
      { start: "F", f_driveable: "no" },
      { start: "G", g_related: "mechanic" },
    ];
    for (const answers of cases) {
      expect(resolveBodyRoute(answers).trade).toBe("body");
      expect(resolveBodyRoute(answers).needsConfirm).toBe(false);
    }
  });

  it("requires 4 photos before dispatch", () => {
    expect(BODY_MIN_PHOTOS).toBe(4);
    expect(BODY_MAX_PHOTOS).toBe(4);
    expect(canFindBodyPro(3)).toBe(false);
    expect(canFindBodyPro(4)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });

  it("composes the problem text with questions and answers", () => {
    const out = composeBodyProblem(
      {
        start: "A",
        a_serious: "severe",
        a_parts: "front wing and bumper",
        a_driveable: "no",
      },
      "Please call before arrival",
      "Lagos mainland",
    );
    expect(out).toContain(BODY_START_QUESTION);
    expect(out).toContain("Accident or collision damage");
    expect(out).toContain("Severe (vehicle cannot move safely)");
    expect(out).toContain("front wing and bumper");
    expect(out).toContain("Lagos mainland");
    expect(out).toContain("Please call before arrival");
  });

  it("builds a breadcrumb with the branch letter", () => {
    expect(bodyBreadcrumb(["vehicle"])).toBe("Body");
    expect(bodyBreadcrumb(["vehicle", "a_serious", "a_parts"])).toBe(
      "Body · A",
    );
  });

  it("exposes every chained screen with a question", () => {
    const ids = [
      "start",
      "a_serious",
      "a_parts",
      "a_driveable",
      "a_insurance",
      "a_safe",
      "b_count",
      "b_panels",
      "b_depth",
      "b_paint",
      "b_repair",
      "c_depth",
      "c_size",
      "c_respray",
      "c_paint",
      "d_state",
      "d_position",
      "d_mounts",
      "d_drive",
      "e_part",
      "e_opens",
      "e_alignment",
      "e_mechanical",
      "f_areas",
      "f_quotation",
      "f_colour",
      "f_driveable",
      "g_describe",
      "g_related",
    ];
    for (const id of ids) {
      const screen = bodyScreen(id);
      expect(screen).toBeDefined();
      expect(screen?.question?.length).toBeGreaterThan(0);
      expect(BODY_SCREENS[id]).toBeDefined();
    }
  });

  it("exposes the final copy strings", () => {
    expect(BODY_FINAL_COPY.photos).toContain("4");
    expect(BODY_FINAL_COPY.tow).toContain("towed");
  });
});
