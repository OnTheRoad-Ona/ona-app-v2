import { describe, expect, it } from "vitest";
import {
  canFindPro,
  canOpenEmergencyCard,
} from "@/components/home/need-help-steps";

describe("need-help talk box cards", () => {
  it("does not open the emergency card until they wrote what is going on", () => {
    expect(canOpenEmergencyCard("")).toBe(false);
    expect(canOpenEmergencyCard("hi")).toBe(false);
    expect(canOpenEmergencyCard("car won't start")).toBe(true);
  });

  it("does not show Find a Repair Pro until emergency is picked on card 2", () => {
    expect(canFindPro(1, null)).toBe(false);
    expect(canFindPro(1, false)).toBe(false);
    expect(canFindPro(2, null)).toBe(false);
    expect(canFindPro(2, true)).toBe(true);
    expect(canFindPro(2, false)).toBe(true);
  });
});
