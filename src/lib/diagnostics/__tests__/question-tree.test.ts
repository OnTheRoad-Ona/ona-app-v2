import { describe, expect, it } from "vitest";
import {
  applyConfirmChoice,
  canAdvanceText,
  canFindScanPro,
  composeScanProblem,
  confirmQuestion,
  nextScanScreen,
  resolveScanRoute,
  scanBreadcrumb,
  scanScreen,
  SCAN_FINAL_COPY,
  SCAN_MAX_PHOTOS,
  SCAN_MIN_PHOTOS,
  SCAN_SCREENS,
  SCAN_START_OPTIONS,
  SCAN_START_QUESTION,
} from "@/lib/diagnostics/question-tree";

describe("scan (diagnostics) question tree", () => {
  it("offers the seven start categories A-G", () => {
    expect(SCAN_START_OPTIONS.map((o) => o.id)).toEqual([
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
    expect(nextScanScreen("start", "A", {})).toBe("a_light");
    expect(nextScanScreen("start", "B", {})).toBe("b_what");
    expect(nextScanScreen("start", "C", {})).toBe("c_what");
    expect(nextScanScreen("start", "D", {})).toBe("d_routine");
    expect(nextScanScreen("start", "E", {})).toBe("e_repair");
    expect(nextScanScreen("start", "F", {})).toBe("f_describe");
    expect(nextScanScreen("start", "G", {})).toBe("ev_scan");
  });

  it("routes the EV scan branch back to resolve, keeping Diagnostics (Electrical alternate for charging)", () => {
    expect(nextScanScreen("ev_scan", "battery", { start: "G" })).toBe("final");
    const route = resolveScanRoute({ start: "G", ev_scan: "charging" });
    expect(route.trade).toBe("diagnostics");
    expect(route.alternate).toBe("electrical");
    const hv = resolveScanRoute({ start: "G", ev_scan: "motor" });
    expect(hv.trade).toBe("diagnostics");
    expect(hv.needsConfirm).toBe(false);
  });

  it("walks the full branch A chain to a seamless final", () => {
    const seamless = { start: "A", a_light: "ce", a_flash: "steady" };
    expect(nextScanScreen("a_light", "ce", {})).toBe("a_flash");
    expect(nextScanScreen("a_flash", "steady", {})).toBe("a_when");
    expect(nextScanScreen("a_when", "today", {})).toBe("a_symptoms");
    expect(nextScanScreen("a_symptoms", "no", {})).toBe("a_scanned");
    expect(nextScanScreen("a_scanned", "no", seamless)).toBe("final");
  });

  it("routes battery/charging light to Battery + Electric confirm", () => {
    const answers = { start: "A", a_light: "battery" };
    expect(nextScanScreen("a_scanned", "no", answers)).toBe("confirm");
    const route = resolveScanRoute(answers);
    expect(route.trade).toBe("battery");
    expect(route.alternate).toBe("electrical");
    expect(route.needsConfirm).toBe(true);
  });

  it("routes oil pressure and temperature lights to Mechanic confirm", () => {
    for (const light of ["oil", "temp"]) {
      const answers = { start: "A", a_light: light };
      const route = resolveScanRoute(answers);
      expect(route.trade).toBe("mechanic");
      expect(route.needsConfirm).toBe(true);
    }
  });

  it("routes a flashing check-engine light to Priority Scan + Mechanic", () => {
    const answers = {
      start: "A",
      a_light: "ce",
      a_flash: "flashing",
    };
    const route = resolveScanRoute(answers);
    expect(route.trade).toBe("diagnostics");
    expect(route.alternate).toBe("mechanic");
    expect(route.needsConfirm).toBe(true);
    expect(nextScanScreen("a_scanned", "no", answers)).toBe("confirm");
  });

  it("keeps ABS, airbag, other and steady check-engine on Scan", () => {
    for (const light of ["abs", "airbag", "other"]) {
      expect(resolveScanRoute({ start: "A", a_light: light }).trade).toBe(
        "diagnostics",
      );
      expect(
        resolveScanRoute({ start: "A", a_light: light }).needsConfirm,
      ).toBe(false);
    }
    expect(
      resolveScanRoute({ start: "A", a_light: "ce", a_flash: "steady" })
        .needsConfirm,
    ).toBe(false);
  });

  it("walks branch B to final, always staying on Scan", () => {
    expect(nextScanScreen("b_what", "limp", {})).toBe("b_when");
    expect(nextScanScreen("b_when", "hot", {})).toBe("b_noise");
    expect(nextScanScreen("b_noise", "yes", {})).toBe("b_lights");
    expect(nextScanScreen("b_lights", "yes", { start: "B" })).toBe("final");
    expect(resolveScanRoute({ start: "B" }).trade).toBe("diagnostics");
  });

  it("routes dead or slow crank to Battery first with Electric alternate", () => {
    for (const what of ["dead", "slow"]) {
      const answers = { start: "C", c_what: what };
      expect(nextScanScreen("c_work", "no", answers)).toBe("confirm");
      const route = resolveScanRoute(answers);
      expect(route.trade).toBe("battery");
      expect(route.alternate).toBe("electrical");
    }
  });

  it("routes cranks-but-no-start to Scan + Mechanic confirm", () => {
    const answers = { start: "C", c_what: "crank" };
    const route = resolveScanRoute(answers);
    expect(route.trade).toBe("diagnostics");
    expect(route.alternate).toBe("mechanic");
    expect(route.needsConfirm).toBe(true);
    expect(nextScanScreen("c_work", "no", answers)).toBe("confirm");
  });

  it("keeps starts-then-dies on Scan", () => {
    expect(resolveScanRoute({ start: "C", c_what: "dies" }).trade).toBe(
      "diagnostics",
    );
  });

  it("walks branches D and E to seamless finals", () => {
    expect(nextScanScreen("d_routine", "routine", {})).toBe("d_symptoms");
    expect(nextScanScreen("d_symptoms", "no", {})).toBe("d_scope");
    expect(nextScanScreen("d_scope", "full", { start: "D" })).toBe("final");

    expect(nextScanScreen("e_repair", "x", {})).toBe("e_light");
    expect(nextScanScreen("e_light", "still", {})).toBe("e_clear");
    expect(nextScanScreen("e_clear", "yes", { start: "E" })).toBe("final");
  });

  it("routes the something-else branch to any specialist", () => {
    const cases: [string, string][] = [
      ["tyre", "vulcanizer"],
      ["body", "body"],
      ["ac", "ac"],
      ["battery", "battery"],
      ["tow", "towing"],
      ["clothing", "fashion"],
    ];
    for (const [related, trade] of cases) {
      expect(resolveScanRoute({ start: "F", f_related: related }).trade).toBe(
        trade,
      );
    }
  });

  it("routes power and house sub-options", () => {
    expect(
      resolveScanRoute({ start: "F", f_related: "power", f_power: "solar" })
        .trade,
    ).toBe("solar");
    expect(
      resolveScanRoute({ start: "F", f_related: "power", f_power: "electric" })
        .trade,
    ).toBe("electrical");
    expect(
      resolveScanRoute({
        start: "F",
        f_related: "power",
        f_power: "generator",
      }).trade,
    ).toBe("generator");
    expect(
      resolveScanRoute({ start: "F", f_related: "house", f_house: "plumber" })
        .trade,
    ).toBe("plumber");
    expect(
      resolveScanRoute({ start: "F", f_related: "house", f_house: "painter" })
        .trade,
    ).toBe("painter");
    expect(
      resolveScanRoute({ start: "F", f_related: "house", f_house: "carpenter" })
        .trade,
    ).toBe("carpenter");
    expect(resolveScanRoute({ start: "F", f_related: "diagnosis" }).trade).toBe(
      "diagnostics",
    );
  });

  it("walks power/house sub-questions then routes to confirm", () => {
    expect(nextScanScreen("f_describe", "x", {})).toBe("f_related");
    expect(nextScanScreen("f_related", "power", {})).toBe("f_power");
    expect(
      nextScanScreen("f_power", "solar", { start: "F", f_related: "power" }),
    ).toBe("confirm");
    expect(nextScanScreen("f_related", "house", {})).toBe("f_house");
    expect(
      nextScanScreen("f_house", "carpenter", {
        start: "F",
        f_related: "house",
      }),
    ).toBe("confirm");
  });

  it("applyConfirmChoice honors yes/no with alternate", () => {
    const route = resolveScanRoute({ start: "A", a_light: "battery" });
    expect(applyConfirmChoice(route, true)).toBe("battery");
    expect(applyConfirmChoice(route, false)).toBe("electrical");

    const crank = resolveScanRoute({ start: "C", c_what: "crank" });
    expect(applyConfirmChoice(crank, true)).toBe("diagnostics");
    expect(applyConfirmChoice(crank, false)).toBe("mechanic");

    const flat = resolveScanRoute({ start: "F", f_related: "tow" });
    expect(applyConfirmChoice(flat, true)).toBe("towing");
    expect(applyConfirmChoice(flat, false)).toBe("diagnostics");
  });

  it("requires at least 1 photo", () => {
    expect(SCAN_MIN_PHOTOS).toBe(1);
    expect(SCAN_MAX_PHOTOS).toBe(4);
    expect(canFindScanPro(0)).toBe(false);
    expect(canFindScanPro(1)).toBe(true);
    expect(canAdvanceText("ok")).toBe(true);
    expect(canAdvanceText(" ")).toBe(false);
  });

  it("builds confirm question strings", () => {
    expect(confirmQuestion("battery")).toBe(
      "This sounds like Battery. Continue?",
    );
    expect(confirmQuestion("diagnostics")).toBe(
      "This sounds like Diagnostics. Continue?",
    );
  });

  it("composes the problem text with questions and answers", () => {
    const out = composeScanProblem(
      {
        start: "A",
        a_light: "ce",
        a_flash: "steady",
      },
      "Call before arrival",
      "Lekki",
    );
    expect(out).toContain(SCAN_START_QUESTION);
    expect(out).toContain("Check engine light or warning light is on");
    expect(out).toContain("Check Engine (MIL)");
    expect(out).toContain("Lekki");
    expect(out).toContain("Call before arrival");
  });

  it("builds a breadcrumb with branch letter and confirm/send state", () => {
    expect(scanBreadcrumb(["vehicle", "start"])).toBe("Scan");
    expect(scanBreadcrumb(["vehicle", "start", "a_light"])).toBe("Scan · A");
    expect(scanBreadcrumb(["vehicle", "start", "confirm"])).toBe(
      "Scan · Confirm",
    );
    expect(scanBreadcrumb(["vehicle", "start", "final"])).toBe("Scan · Send");
  });

  it("exposes every chained screen with a question", () => {
    const ids = [
      "start",
      "a_light",
      "a_flash",
      "a_when",
      "a_symptoms",
      "a_scanned",
      "b_what",
      "b_when",
      "b_noise",
      "b_lights",
      "c_what",
      "c_lights",
      "c_sudden",
      "c_work",
      "d_routine",
      "d_symptoms",
      "d_scope",
      "e_repair",
      "e_light",
      "e_clear",
      "f_describe",
      "f_related",
      "f_power",
      "f_house",
    ];
    for (const id of ids) {
      const screen = scanScreen(id);
      expect(screen).toBeDefined();
      expect(screen?.question?.length).toBeGreaterThan(0);
      expect(SCAN_SCREENS[id]).toBeDefined();
    }
  });

  it("exposes the final block copy", () => {
    expect(SCAN_FINAL_COPY.tow).toContain("workshop for the scan");
    expect(SCAN_FINAL_COPY.photos).toContain("dashboard");
  });
});
