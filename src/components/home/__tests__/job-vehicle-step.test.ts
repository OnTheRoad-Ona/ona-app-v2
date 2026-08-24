import { describe, expect, it } from "vitest";
import {
  canUseVehicleLabel,
  formatVehicleLabel,
  profileVehiclesOf,
} from "@/components/home/job-vehicle-step";

describe("job vehicle step", () => {
  it("joins vehicle type, brand, model, and optional year", () => {
    expect(
      formatVehicleLabel({
        vehicleType: "Automobile / Passenger Car",
        make: "Toyota",
        model: "Camry",
        year: "2018",
      }),
    ).toBe("Automobile / Passenger Car · Toyota · Camry · 2018");
    expect(
      formatVehicleLabel({
        make: "Toyota",
        model: "Camry",
      }),
    ).toBe("Toyota · Camry");
  });

  it("needs a real vehicle label before continue", () => {
    expect(canUseVehicleLabel("")).toBe(false);
    expect(canUseVehicleLabel("Toyota Camry")).toBe(true);
  });

  it("reads saved vehicles from the profile", () => {
    expect(
      profileVehiclesOf({
        vehicles: [{ id: "1", make: "Honda", model: "Civic", year: "2014" }],
      }).map((v) => formatVehicleLabel(v)),
    ).toEqual(["Honda · Civic · 2014"]);
  });
});
