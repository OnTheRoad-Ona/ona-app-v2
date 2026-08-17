"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { VehicleCascadeFields } from "@/components/vehicles/vehicle-cascade-fields";
import type { MotoristVehicle, UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

export function formatVehicleLabel(v: {
  vehicleType?: string;
  make?: string;
  model?: string;
  year?: string;
}): string {
  return [v.vehicleType, v.make, v.model, v.year].filter(Boolean).join(" · ");
}

export function profileVehiclesOf(
  userProfile:
    | Pick<
        UserProfile,
        "vehicles" | "vehicleMake" | "vehicleModel" | "vehicleYear"
      >
    | null
    | undefined
): MotoristVehicle[] {
  const list = userProfile?.vehicles?.filter(
    (v) => v.make || v.model || v.vehicleType
  );
  if (list?.length) return list;
  if (userProfile?.vehicleMake || userProfile?.vehicleModel) {
    return [
      {
        id: "primary",
        vehicleType: undefined,
        make: userProfile.vehicleMake || "",
        model: userProfile.vehicleModel || "",
        year: userProfile.vehicleYear,
      },
    ];
  }
  return [];
}

export function canUseVehicleLabel(label: string): boolean {
  return label.trim().length >= 3;
}

export function JobVehicleStep({
  isLight,
  vehicles,
  label,
  onChange,
}: {
  isLight: boolean;
  vehicles: MotoristVehicle[];
  label: string;
  onChange: (label: string) => void;
}) {
  const [manual, setManual] = useState(vehicles.length === 0);
  const [vehicleType, setVehicleType] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-white/50";

  const savedMatch = useMemo(
    () => vehicles.find((v) => formatVehicleLabel(v) === label),
    [vehicles, label]
  );

  const pushManual = (
    nextType: string,
    nextMake: string,
    nextModel: string,
    nextYear: string
  ) => {
    onChange(
      formatVehicleLabel({
        vehicleType: nextType,
        make: nextMake,
        model: nextModel,
        year: nextYear,
      })
    );
  };

  return (
    <div>
      <p className={cn("px-0.5 pb-2 text-[14px] font-bold leading-snug", ink)}>
        {vehicles.length && !manual
          ? "Which vehicle?"
          : "Enter your vehicle"}
      </p>

      {vehicles.length > 0 && !manual ? (
        <div className="flex flex-col">
          {vehicles.map((v) => {
            const text = formatVehicleLabel(v);
            const on = savedMatch?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onChange(text)}
                className={cn(
                  "flex w-full items-center gap-2 border-0 border-b bg-transparent px-1 py-2.5 text-left",
                  isLight ? "border-black/10" : "border-white/10"
                )}
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[13px] font-semibold leading-snug",
                    on ? "text-brand" : ink
                  )}
                >
                  {text}
                </span>
                <ChevronRight
                  className={cn("h-4 w-4 shrink-0", muted)}
                  strokeWidth={2.2}
                />
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setManual(true);
              onChange("");
            }}
            className={cn(
              "w-full border-0 bg-transparent px-1 py-2.5 text-left text-[13px] font-semibold",
              ink
            )}
          >
            Enter another vehicle
          </button>
        </div>
      ) : (
        <VehicleCascadeFields
          variant="profile"
          isLight={isLight}
          makeLabel="Brand"
          vehicleType={vehicleType}
          onVehicleTypeChange={(v) => {
            setVehicleType(v);
            pushManual(v, make, model, year);
          }}
          make={make}
          model={model}
          year={year}
          onMakeChange={(v) => {
            setMake(v);
            pushManual(vehicleType, v, "", "");
          }}
          onModelChange={(v) => {
            setModel(v);
            pushManual(vehicleType, make, v, "");
          }}
          onYearChange={(v) => {
            setYear(v);
            pushManual(vehicleType, make, model, v);
          }}
        />
      )}
    </div>
  );
}
