import { describe, expect, it } from "vitest";
import { EN } from "@/lib/i18n/catalog/en";

describe("one-account role-switch copy", () => {
  it("keeps the exact Customer-missing message", () => {
    expect(EN["menu.noMotorist"]).toBe(
      "You don't have a Customer account yet.",
    );
  });

  it("keeps the exact Repair Pro-missing message", () => {
    expect(EN["menu.noPro"]).toBe(
      "You don't have a Repair Pro account yet. Finish signup to go Live and receive jobs.",
    );
  });
});
