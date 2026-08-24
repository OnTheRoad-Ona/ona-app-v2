import { describe, expect, it } from "vitest";
import {
  isSamePerson,
  type IdentityCheck,
} from "@/lib/server/payments/self-payment-guard";

function person(
  fullName: string,
  ninLast4 = "1234",
  bvnLast4 = "5678",
): IdentityCheck {
  return { fullName, ninLast4, bvnLast4 };
}

describe("isSamePerson", () => {
  it("blocks when name, NIN and BVN all match", () => {
    expect(
      isSamePerson(
        person("Oluwatosin Temitope"),
        person("Oluwatosin Temitope"),
      ),
    ).toBe(true);
  });

  it("blocks when names differ only by case / punctuation / spacing", () => {
    expect(
      isSamePerson(
        person("Oluwatosin, Olanrewaju"),
        person("oluwatosin olanrewaju."),
      ),
    ).toBe(true);
  });

  it("does not block different people with one shared identity digit set", () => {
    expect(
      isSamePerson(person("King Lucky"), person("Oluwatosin Temitope")),
    ).toBe(false);
  });

  it("does not block same name alone (must be corroborated by BVN+NIN)", () => {
    expect(
      isSamePerson(
        person("Oluwatosin Temitope", "0000", "9999"),
        person("Oluwatosin Temitope", "1111", "2222"),
      ),
    ).toBe(false);
  });

  it("does not block when identities are missing", () => {
    expect(isSamePerson(null, person("Oluwatosin Temitope"))).toBe(false);
    expect(isSamePerson(person(""), person("Oluwatosin Temitope"))).toBe(false);
    expect(isSamePerson(undefined, undefined)).toBe(false);
  });
});
