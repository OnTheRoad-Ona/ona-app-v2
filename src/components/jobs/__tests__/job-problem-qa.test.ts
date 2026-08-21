import { describe, expect, it } from "vitest";
import {
  filterHiddenVehicleRows,
  parseJobProblem,
  stripCoordinateLocations,
} from "@/components/jobs/job-problem-qa";

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

  it("keeps Vehicle on its own row so mechanic Q&A stay paired", () => {
    const out = parseJobProblem(
      [
        "Vehicle: Honda · CR-V · 2027",
        "What's wrong with your vehicle?",
        "The vehicle will not start at all",
        "When you turn the key or press the start button, what happens?",
        "Completely silent / nothing happens",
        "Enter exact location",
        "Lekki Phase 1",
      ].join("\n")
    );
    expect(out.rows).toEqual([
      { label: "Vehicle", answer: "Honda · CR-V · 2027" },
      {
        label: "What's wrong with your vehicle?",
        answer: "The vehicle will not start at all",
      },
      {
        label: "When you turn the key or press the start button, what happens?",
        answer: "Completely silent / nothing happens",
      },
      { label: "Enter exact location", answer: "Lekki Phase 1" },
    ]);
  });

  it("drops the 'Which vehicle?' row when the card title already shows the vehicle", () => {
    const out = parseJobProblem(
      [
        "Which vehicle?",
        "Honda CR-V 2027",
        "What's the issue?",
        "Engine overheating",
      ].join("\n")
    );
    expect(out.rows).toEqual([
      { label: "Which vehicle?", answer: "Honda CR-V 2027" },
      { label: "What's the issue?", answer: "Engine overheating" },
    ]);
    const hidden = filterHiddenVehicleRows(out.rows, true);
    expect(hidden).toEqual([
      { label: "What's the issue?", answer: "Engine overheating" },
    ]);
  });

  it("keeps the 'Which vehicle?' row when the vehicle is not shown in the title", () => {
    const rows = [{ label: "Which vehicle?", answer: "Honda CR-V 2027" }];
    expect(filterHiddenVehicleRows(rows, false)).toEqual(rows);
  });

  it("hides a location answer that is only raw coordinates", () => {
    const rows = [
      { label: "Enter exact location", answer: "6.42810, 3.42190" },
      { label: "Enter exact location", answer: "Lekki Phase 1, Lagos" },
      { label: "Location / landmark", answer: "-6.12345, 3.98765" },
    ];
    expect(stripCoordinateLocations(rows)).toEqual([
      { label: "Enter exact location", answer: "Lekki Phase 1, Lagos" },
    ]);
  });

  it("strips Google plus-codes from the location answer", () => {
    const rows = [
      { label: "Current Location", answer: "FG2R+RJM Lekki Phase 1, Lagos" },
      { label: "Current Location", answer: "FG2R+RJM" },
    ];
    expect(stripCoordinateLocations(rows)).toEqual([
      { label: "Current Location", answer: "Lekki Phase 1, Lagos" },
    ]);
  });

  it("keeps non-location answers that happen to look like coordinates", () => {
    const rows = [
      { label: "Engine size?", answer: "3.5, V6" },
      { label: "Enter exact location", answer: "1.23456, 5.67890" },
    ];
    expect(stripCoordinateLocations(rows)).toEqual([
      { label: "Engine size?", answer: "3.5, V6" },
    ]);
  });

  it("falls back to the raw text when nothing parses", () => {
    expect(parseJobProblem("").rows).toEqual([]);
    expect(parseJobProblem("Just a plain note").notes).toEqual([
      "Just a plain note",
    ]);
  });
});