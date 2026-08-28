import { describe, expect, it } from "vitest";
import {
  helpFlowProgressPercent,
  remainingHopsToFinal,
} from "@/lib/help-flow-progress";
import {
  mechanicScreen,
  nextMechanicScreen,
} from "@/lib/mechanic/question-tree";

const FINAL = ["urgency", "photos", "voice", "location"] as const;

function pct(partial: {
  stackLength: number;
  step: string;
  finalStep?: string;
  remainingQa: number;
}): number {
  return helpFlowProgressPercent({
    stackLength: partial.stackLength,
    step: partial.step,
    finalStep: partial.finalStep ?? "urgency",
    finalSteps: FINAL,
    remainingQa: partial.remainingQa,
  });
}

describe("helpFlowProgressPercent", () => {
  it("is 0 on the first screen", () => {
    expect(
      pct({ stackLength: 1, step: "vehicle", remainingQa: 8 }),
    ).toBe(0);
  });

  it("is 100 on the last final step", () => {
    expect(
      pct({
        stackLength: 8,
        step: "final",
        finalStep: "location",
        remainingQa: 0,
      }),
    ).toBe(100);
  });

  it("puts Urgency after Q&A and before photos (no backward jump)", () => {
    const lastQa = pct({
      stackLength: 7,
      step: "a_danger",
      remainingQa: 1,
    });
    const urgency = pct({
      stackLength: 8,
      step: "final",
      finalStep: "urgency",
      remainingQa: 0,
    });
    const photos = pct({
      stackLength: 8,
      step: "final",
      finalStep: "photos",
      remainingQa: 0,
    });
    expect(lastQa).toBeGreaterThan(0);
    expect(urgency).toBeGreaterThan(lastQa);
    expect(photos).toBeGreaterThan(urgency);
    expect(urgency).toBeLessThan(100);
  });
});

describe("remainingHopsToFinal", () => {
  const optionIds = (id: string, answers: Record<string, string>) =>
    mechanicScreen(id, answers)?.options?.map((o) => o.id);

  it("counts a hop from the vehicle picker into the tree", () => {
    const fromVehicle = remainingHopsToFinal({
      current: "vehicle",
      answers: {},
      next: nextMechanicScreen,
      optionIds,
      bridge: { vehicle: "start" },
    });
    const fromStart = remainingHopsToFinal({
      current: "start",
      answers: {},
      next: nextMechanicScreen,
      optionIds,
    });
    expect(fromVehicle).toBe(fromStart + 1);
    expect(fromStart).toBeGreaterThan(3);
  });

  it("is 0 at final and 1 at confirm", () => {
    expect(
      remainingHopsToFinal({
        current: "final",
        answers: {},
        next: nextMechanicScreen,
        optionIds,
      }),
    ).toBe(0);
    expect(
      remainingHopsToFinal({
        current: "confirm",
        answers: {},
        next: nextMechanicScreen,
        optionIds,
      }),
    ).toBe(1);
  });

  it("keeps the orange line moving forward on a real mechanic path", () => {
    const path = [
      "vehicle",
      "start",
      "a_what",
      "a_lights",
      "a_when",
      "a_recent",
      "a_danger",
    ];
    const answers: Record<string, string> = {
      start: "A",
      a_what: "silent",
      a_lights: "off",
      a_when: "now",
      a_recent: "no",
    };
    const fills: number[] = [];
    for (let i = 0; i < path.length; i++) {
      const step = path[i];
      const remainingQa = remainingHopsToFinal({
        current: step,
        answers,
        next: nextMechanicScreen,
        optionIds,
        bridge: { vehicle: "start" },
      });
      fills.push(
        pct({ stackLength: i + 1, step, remainingQa }),
      );
    }
    for (let i = 1; i < fills.length; i++) {
      expect(fills[i]).toBeGreaterThan(fills[i - 1]);
    }
    const urgency = pct({
      stackLength: path.length + 1,
      step: "final",
      finalStep: "urgency",
      remainingQa: 0,
    });
    expect(urgency).toBeGreaterThan(fills[fills.length - 1]);
    expect(urgency).toBeLessThan(100);
  });
});
