import { describe, expect, it } from "vitest";
import {
  canFindPro,
  canOpenEmergencyCard,
  talkBoxAfterTradePick,
} from "@/components/home/need-help-steps";
import { problemPlaceholderForTrade } from "@/lib/pricing";

describe("need-help talk box cards", () => {
  it("does not open the emergency card until they wrote what is going on", () => {
    expect(canOpenEmergencyCard("")).toBe(false);
    expect(canOpenEmergencyCard("hi")).toBe(false);
    expect(canOpenEmergencyCard("car won't start")).toBe(true);
  });

  it("only sends from the last card", () => {
    expect(canFindPro("vehicle")).toBe(false);
    expect(canFindPro("help")).toBe(false);
    expect(canFindPro("confirm")).toBe(false);
    expect(canFindPro("urgency")).toBe(false);
    expect(canFindPro("send")).toBe(true);
  });

  it("shows the talk box only after they pick a trade", () => {
    expect(talkBoxAfterTradePick("none")).toBe(false);
    expect(talkBoxAfterTradePick("all")).toBe(false);
    expect(talkBoxAfterTradePick("mechanic")).toBe(true);
    expect(talkBoxAfterTradePick("towing")).toBe(true);
  });

  it("uses a hint that matches the tapped trade", () => {
    expect(problemPlaceholderForTrade("mechanic").toLowerCase()).toMatch(
      /engine|car|bonnet/,
    );
    expect(problemPlaceholderForTrade("vulcanizer").toLowerCase()).toMatch(
      /tyre|tire/,
    );
    expect(problemPlaceholderForTrade("plumber").toLowerCase()).toMatch(
      /pipe|water/,
    );
    expect(problemPlaceholderForTrade("fashion").toLowerCase()).toMatch(
      /dress|tailor|fitting/,
    );
    expect(problemPlaceholderForTrade("plumber")).not.toMatch(
      /car won’t start/i,
    );
  });
});
