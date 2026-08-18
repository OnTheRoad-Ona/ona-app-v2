import { describe, expect, it } from "vitest";
import { parseJobProblem } from "@/components/jobs/job-problem-qa";

describe("parseJobProblem", () => {
  it("parses the inline format (solar/generator/painter/carpenter)", () => {
    const out = parseJobProblem(
      [
        "Generator work: New generator installation or purchase advice (What kind of generator work do you need?)",
        "What type of property is it? Residential house / flat",
        "What do you want the generator to power? Lights, fans, TV and fridge",
        "Location / landmark: Lagos Island",
        "Extra detail: Install for my shop",
      ].join("\n")
    );
    expect(out.summary).toBe("New generator installation or purchase advice");
    expect(out.rows).toEqual([
      {
        label: "What type of property is it?",
        answer: "Residential house / flat",
      },
      {
        label: "What do you want the generator to power?",
        answer: "Lights, fans, TV and fridge",
      },
      { label: "Location / landmark", answer: "Lagos Island" },
      { label: "Extra detail", answer: "Install for my shop" },
    ]);
    expect(out.notes).toEqual([]);
  });

  it("splits a question and answer even when they share one line", () => {
    const out = parseJobProblem(
      "Painting work: Interior painting (What kind of painting do you need?)\nWho is supplying the paint and materials? I will supply"
    );
    expect(out.summary).toBe("Interior painting");
    expect(out.rows).toEqual([
      {
        label: "Who is supplying the paint and materials?",
        answer: "I will supply",
      },
    ]);
  });

  it("parses the alternating format (battery/mechanic/tow etc.)", () => {
    const out = parseJobProblem(
      [
        "What kind of battery problem do you have?",
        "Battery is dead",
        "How old is the battery?",
        "2 years",
        "Enter exact location",
        "Lekki Phase 1",
        "Any other detail you want the technician to know?",
        "Please come with a new battery",
      ].join("\n")
    );
    expect(out.summary).toBeNull();
    expect(out.rows).toEqual([
      { label: "What kind of battery problem do you have?", answer: "Battery is dead" },
      { label: "How old is the battery?", answer: "2 years" },
      { label: "Enter exact location", answer: "Lekki Phase 1" },
      {
        label: "Any other detail you want the technician to know?",
        answer: "Please come with a new battery",
      },
    ]);
  });

  it("keeps leading unlabeled lines as notes in the inline format", () => {
    const out = parseJobProblem(
      [
        "Generator size (kVA) and type (petrol/diesel) if known Diesel 7.5kVA",
        "Generator work: Servicing (What kind of generator work do you need?)",
        "What kind of service do you need? Normal servicing",
      ].join("\n")
    );
    expect(out.summary).toBe("Servicing");
    expect(out.notes).toEqual([
      "Generator size (kVA) and type (petrol/diesel) if known Diesel 7.5kVA",
    ]);
    expect(out.rows).toEqual([
      { label: "What kind of service do you need?", answer: "Normal servicing" },
    ]);
  });

  it("falls back to the raw text when nothing parses", () => {
    expect(parseJobProblem("").rows).toEqual([]);
    expect(parseJobProblem("Just a plain note").notes).toEqual([]);
  });
});