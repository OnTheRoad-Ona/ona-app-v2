import { describe, expect, it } from "vitest";
import {
  composeExpressProblem,
  detectExpressTrade,
  EXPRESS_SCREENS,
  getExpressScreen,
  nextExpressStep,
} from "@/lib/express/question-engine";
import {
  expressBaseFeeMajor,
  expressAssignedTitle,
  isExpressTrade,
  isValidScheduleTime,
} from "@/lib/express/pricing";

function answer(path: string[]): Record<string, string> {
  const answers: Record<string, string> = {};
  let id = "main";
  for (const optionId of path) {
    const screen = EXPRESS_SCREENS[id];
    const opt = screen?.options?.find((o) => o.id === optionId);
    answers[id] = optionId;
    if (opt) answers[`${id}_label`] = opt.label;
    const next = nextExpressStep(id, optionId, answers);
    if (next === "detect") break;
    id = next;
  }
  return answers;
}

describe("express pricing", () => {
  it("charges ₦20,000 base for Mechanic and ₦15,000 for every other trade", () => {
    expect(expressBaseFeeMajor("mechanic")).toBe(20000);
    expect(expressBaseFeeMajor("towing")).toBe(15000);
    expect(expressBaseFeeMajor("battery")).toBe(15000);
    expect(expressBaseFeeMajor("ac")).toBe(15000);
    expect(expressBaseFeeMajor("body")).toBe(15000);
    expect(expressBaseFeeMajor("electrical")).toBe(15000);
    expect(expressBaseFeeMajor("diagnostics")).toBe(15000);
    expect(expressBaseFeeMajor("vulcanizer")).toBe(15000);
  });

  it("validates the 1-week scheduling window", () => {
    const now = Date.now();
    expect(isValidScheduleTime(new Date(now + 3600_000).toISOString(), now)).toBe(
      true,
    );
    expect(
      isValidScheduleTime(new Date(now + 8 * 24 * 3600_000).toISOString(), now),
    ).toBe(false);
    expect(isValidScheduleTime(new Date(now - 1000).toISOString(), now)).toBe(
      false,
    );
  });

  it("titles the assignment screen per trade", () => {
    expect(expressAssignedTitle("mechanic")).toBe("Mechanic Assigned");
    expect(expressAssignedTitle("diagnostics")).toBe("Scan Expert Assigned");
  });
});

describe("express question engine", () => {
  it("detects Tow immediately from the main screen", () => {
    expect(detectExpressTrade(answer(["tow"]))).toBe("towing");
    expect(nextExpressStep("main", "tow", answer(["tow"]))).toBe("detect");
  });

  it("detects Routine service as Mechanic", () => {
    expect(detectExpressTrade(answer(["service"]))).toBe("mechanic");
  });

  it("narrows won't-start: dead battery vs starter vs sensors", () => {
    // Completely dark dash → battery
    expect(detectExpressTrade(answer(["wont-start", "dead-click", "no-lights"]))).toBe(
      "battery",
    );
    // Dash fine + battery tested good → starter/mechanic
    expect(
      detectExpressTrade(
        answer(["wont-start", "dead-click", "lights-ok", "tested-fine"]),
      ),
    ).toBe("mechanic");
    // Dash fine, battery never checked → battery
    expect(
      detectExpressTrade(
        answer(["wont-start", "dead-click", "lights-ok", "not-tested"]),
      ),
    ).toBe("battery");
    // Strong crank with fuel smell → mechanic (fuel system)
    expect(
      detectExpressTrade(
        answer(["wont-start", "cranks", "strong-crank", "fuel-smell"]),
      ),
    ).toBe("mechanic");
    // Strong crank, nothing obvious → diagnostics first
    expect(
      detectExpressTrade(
        answer(["wont-start", "cranks", "strong-crank", "none"]),
      ),
    ).toBe("diagnostics");
    // Security light flashing at stall → diagnostics/electrical
    expect(
      detectExpressTrade(answer(["wont-start", "starts-dies", "security-flash"])),
    ).toBe("diagnostics");
  });

  it("routes warning lights precisely", () => {
    // Steady CEL, car fine → scan
    expect(detectExpressTrade(answer(["warning-light", "check-engine", "steady"]))).toBe(
      "diagnostics",
    );
    // Flashing CEL → stop driving → mechanic
    expect(
      detectExpressTrade(answer(["warning-light", "check-engine", "flashing"])),
    ).toBe("mechanic");
    // Battery light while running → alternator → electrical
    expect(
      detectExpressTrade(answer(["warning-light", "battery-light", "while-driving"])),
    ).toBe("electrical");
    // Oil / temp light → mechanic
    expect(detectExpressTrade(answer(["warning-light", "oil-temp", "oil-light"]))).toBe(
      "mechanic",
    );
    // Many lights after rain → electrical
    expect(detectExpressTrade(answer(["warning-light", "many-lights", "wet-rain"]))).toBe(
      "electrical",
    );
    // ABS light → mechanic
    expect(detectExpressTrade(answer(["warning-light", "abs-brake"]))).toBe(
      "mechanic",
    );
  });

  it("sends every tyre problem to the Vulcanizer", () => {
    expect(detectExpressTrade(answer(["tyre", "flat"]))).toBe("vulcanizer");
    expect(detectExpressTrade(answer(["tyre", "slow-loss", "nail"]))).toBe(
      "vulcanizer",
    );
    expect(detectExpressTrade(answer(["tyre", "worn"]))).toBe("vulcanizer");
    // Highway steering shake → balancing → vulcanizer
    expect(
      detectExpressTrade(answer(["tyre", "wobble", "steering-highway"])),
    ).toBe("vulcanizer");
    // Knocking over bumps → suspension → mechanic wins
    expect(detectExpressTrade(answer(["tyre", "wobble", "bumps"]))).toBe(
      "mechanic",
    );
  });

  it("keeps A/C and Body branches inside their trades", () => {
    expect(detectExpressTrade(answer(["ac", "warm"]))).toBe("ac");
    expect(detectExpressTrade(answer(["ac", "drip"]))).toBe("ac");
    expect(detectExpressTrade(answer(["body-damage", "dent-scratch"]))).toBe(
      "body",
    );
    expect(detectExpressTrade(answer(["body-damage", "doors-misaligned"]))).toBe(
      "body",
    );
  });

  it("uses the drain follow-up to split Battery from Vehicle Electric", () => {
    expect(
      detectExpressTrade(answer(["electrical", "drains", "old-battery"])),
    ).toBe("battery");
    expect(
      detectExpressTrade(answer(["electrical", "drains", "new-battery"])),
    ).toBe("electrical");
    expect(detectExpressTrade(answer(["electrical", "windows-locks"]))).toBe(
      "electrical",
    );
  });

  it("splits performance issues by smoke colour and CEL state", () => {
    expect(detectExpressTrade(answer(["performance", "smoke", "blue"]))).toBe(
      "mechanic",
    );
    expect(detectExpressTrade(answer(["performance", "smoke", "black"]))).toBe(
      "mechanic",
    );
    // Loss of power WITH check engine light → scan first
    expect(detectExpressTrade(answer(["performance", "no-power", "cel-on"]))).toBe(
      "diagnostics",
    );
    // Loss of power without light → mechanic
    expect(detectExpressTrade(answer(["performance", "no-power", "cel-off"]))).toBe(
      "mechanic",
    );
    // Gear/transmission → mechanic
    expect(detectExpressTrade(answer(["performance", "gear"]))).toBe("mechanic");
  });

  it("identifies leaks by fluid colour; clear water points to A/C drain", () => {
    expect(detectExpressTrade(answer(["overheat-leak", "puddle", "red-trans"]))).toBe(
      "mechanic",
    );
    expect(detectExpressTrade(answer(["overheat-leak", "puddle", "clear-water"]))).toBe(
      "ac",
    );
    expect(
      detectExpressTrade(answer(["overheat-leak", "overheating", "coolant-ok"])),
    ).toBe("mechanic");
  });

  it("keeps brakes/steering/suspension with the right depth", () => {
    expect(detectExpressTrade(answer(["bss", "brake-noise"]))).toBe("mechanic");
    expect(detectExpressTrade(answer(["bss", "brake-soft", "pedal-floor"]))).toBe(
      "mechanic",
    );
    // Pulls to one side → alignment → vulcanizer
    expect(detectExpressTrade(answer(["bss", "suspension", "pulls-side"]))).toBe(
      "vulcanizer",
    );
    expect(detectExpressTrade(answer(["bss", "steering-heavy"]))).toBe("mechanic");
  });

  it("resolves uncertain input to Scan (diagnostic first)", () => {
    expect(
      detectExpressTrade({ not_sure_describe: "it behaves oddly" }),
    ).toBe("diagnostics");
  });

  it("covers all eight Express trades end-to-end", () => {
    const cases: Array<[string[], string]> = [
      [["service"], "mechanic"],
      [["tyre", "flat"], "vulcanizer"],
      [["tyre", "slow-loss", "valve-rim"], "vulcanizer"],
      [["bss", "suspension", "pulls-side"], "vulcanizer"],
      [["tow"], "towing"],
      [["warning-light", "check-engine", "steady"], "diagnostics"],
      [["ac", "smell-noise"], "ac"],
      [["overheat-leak", "puddle", "clear-water"], "ac"],
      [["body-damage", "crash-parts"], "body"],
      [["electrical", "lights-horn"], "electrical"],
      [["performance", "noise", "braking"], "mechanic"],
      [["start_kind"].length ? ["wont-start", "dead-click", "no-lights"] : [], "battery"],
    ];
    for (const [path, expected] of cases) {
      expect(detectExpressTrade(answer(path))).toBe(expected);
    }
  });

  it("composes a Q&A transcript for the technician", () => {
    const text = composeExpressProblem(answer(["tyre", "flat"]));
    expect(text).toContain("tyre");
    expect(text).toContain("Flat or punctured right now");
  });

  it("exposes every screen with a question and valid routing", () => {
    for (const screen of Object.values(EXPRESS_SCREENS)) {
      expect(screen.question.length).toBeGreaterThan(5);
      if (screen.kind === "choice") {
        expect(screen.options?.length).toBeGreaterThanOrEqual(2);
        for (const opt of screen.options ?? []) {
          if (!opt.next) continue;
          expect(getExpressScreen(opt.next)).toBeDefined();
        }
      }
    }
    expect(isExpressTrade("mechanic")).toBe(true);
    expect(isExpressTrade("plumber")).toBe(false);
  });
});
