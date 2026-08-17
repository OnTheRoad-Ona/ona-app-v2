import { describe, expect, it } from "vitest";
import {
  decideHelpTrade,
  resolveDispatchTrades,
} from "@/lib/callout/dispatch-trades";
import { customerMoveSurchargeNaira } from "@/lib/callout/customer-move";
import { isWithinArrivalProximity } from "@/lib/callout/arrival";
import { calculateCalloutFee } from "@/lib/callout/engine";
import { haversineMeters } from "@/lib/callout/integrity";

describe("dispatch consistency — words beat the wrong tap", () => {
  it("puncture + mechanic tap → vulcanizer dispatch", () => {
    const d = resolveDispatchTrades("I have a puncture", "mechanic");
    expect(d.mismatch).toBe(true);
    expect(d.dispatchTrades).toContain("vulcanizer");
    expect(d.primary).toBe("vulcanizer");
    expect(d.statedTrade).toBe("mechanic");
  });

  it("vague problem keeps the tap", () => {
    const d = resolveDispatchTrades("Please help", "plumber");
    expect(d.mismatch).toBe(false);
    expect(d.dispatchTrades).toEqual(["plumber"]);
  });

  it("won't start keeps mechanic among likely trades", () => {
    const d = resolveDispatchTrades("My car won't start", "mechanic");
    expect(d.dispatchTrades.length).toBeGreaterThan(0);
    expect(d.mismatch).toBe(false);
  });
});

describe("decideHelpTrade — ask before sending a different trade", () => {
  it("asks when words point to vulcanizer but they tapped mechanic", () => {
    const d = decideHelpTrade("I have a puncture", "mechanic");
    expect(d.needsConfirm).toBe(true);
    expect(d.suggested).toBe("vulcanizer");
    expect(d.tapped).toBe("mechanic");
  });

  it("does not ask when words match the tap", () => {
    const d = decideHelpTrade("Engine overheating", "mechanic");
    expect(d.needsConfirm).toBe(false);
    expect(d.suggested).toBe("mechanic");
  });

  it("picks the stronger trade when two could fit", () => {
    const d = decideHelpTrade("Need a jump start, car won't start", "mechanic");
    expect(d.suggested).toBe("battery");
    expect(d.needsConfirm).toBe(true);
  });
});

describe("customer move surcharge", () => {
  it("under 500 m adds nothing", () => {
    expect(customerMoveSurchargeNaira(499)).toEqual({ steps: 0, extraNaira: 0 });
  });

  it("each full 500 m adds ₦500", () => {
    expect(customerMoveSurchargeNaira(500)).toEqual({ steps: 1, extraNaira: 500 });
    expect(customerMoveSurchargeNaira(999)).toEqual({ steps: 1, extraNaira: 500 });
    expect(customerMoveSurchargeNaira(1000)).toEqual({ steps: 2, extraNaira: 1000 });
  });
});

describe("arrival proximity", () => {
  it("accepts a pin within 200 m of the customer", () => {
    const r = isWithinArrivalProximity(
      { lat: 6.5, lng: 3.3 },
      { lat: 6.5001, lng: 3.3001 }
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a pin far from the customer", () => {
    const r = isWithinArrivalProximity(
      { lat: 6.53, lng: 3.35 },
      { lat: 6.5, lng: 3.3 }
    );
    expect(r.ok).toBe(false);
    expect(haversineMeters({ lat: 6.53, lng: 3.35 }, { lat: 6.5, lng: 3.3 })).toBeGreaterThan(
      200
    );
  });
});

describe("locked fee still ignores pro driving", () => {
  it("1.5 km stay ₦3,525 after a 10 km wander", () => {
    const locked = calculateCalloutFee({
      tradeId: "mechanic",
      approvedRouteDistanceKm: 1.5,
    });
    expect(locked.calloutFee).toBe(3525);
    expect(
      calculateCalloutFee({
        tradeId: "mechanic",
        approvedRouteDistanceKm: 1.5,
      }).calloutFee
    ).toBe(3525);
  });
});
