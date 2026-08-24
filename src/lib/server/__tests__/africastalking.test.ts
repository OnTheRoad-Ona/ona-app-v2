import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  normalizeNgPhone,
  isAfricaTalkingConfigured,
} from "@/lib/server/africastalking";

describe("normalizeNgPhone", () => {
  it("normalizes 11-digit Nigerian number starting with 0", () => {
    expect(normalizeNgPhone("08031234567")).toBe("+2348031234567");
  });

  it("normalizes number with 234 prefix without +", () => {
    expect(normalizeNgPhone("2348031234567")).toBe("+2348031234567");
  });

  it("passes through already normalized number", () => {
    expect(normalizeNgPhone("+2348031234567")).toBe("+2348031234567");
  });

  it("handles 00 prefix", () => {
    expect(normalizeNgPhone("002348031234567")).toBe("+2348031234567");
  });

  it("strips non-digit characters", () => {
    expect(normalizeNgPhone("+234 (803) 123-4567")).toBe("+2348031234567");
  });

  it("returns null for empty string", () => {
    expect(normalizeNgPhone("")).toBeNull();
  });

  it("returns null for too-short number", () => {
    expect(normalizeNgPhone("12345")).toBeNull();
  });

  it("returns null for invalid characters only", () => {
    expect(normalizeNgPhone("abc")).toBeNull();
  });

  it("strips whitespace", () => {
    expect(normalizeNgPhone("  08031234567  ")).toBe("+2348031234567");
  });
});

describe("isAfricaTalkingConfigured", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true when both API key and username are set", () => {
    process.env.AT_API_KEY = "test-key";
    process.env.AT_USERNAME = "sandbox";
    expect(isAfricaTalkingConfigured()).toBe(true);
  });

  it("returns false when API key is missing", () => {
    process.env.AT_API_KEY = "";
    process.env.AT_USERNAME = "sandbox";
    expect(isAfricaTalkingConfigured()).toBe(false);
  });

  it("returns false when username is missing", () => {
    process.env.AT_API_KEY = "test-key";
    process.env.AT_USERNAME = "";
    expect(isAfricaTalkingConfigured()).toBe(false);
  });

  it("returns false when both are missing", () => {
    process.env.AT_API_KEY = "";
    process.env.AT_USERNAME = "";
    expect(isAfricaTalkingConfigured()).toBe(false);
  });
});
