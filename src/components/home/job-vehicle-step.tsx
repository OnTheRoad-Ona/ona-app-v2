"use client";

import { useMemo, useState } from "react";
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
  onPick,
  onSaveVehicle,
  onBack,
}: {
  isLight: boolean;
  vehicles: MotoristVehicle[];
  label: string;
  onChange: (label: string) => void;
  /** Tapping a saved vehicle advances to the next question. */
  onPick?: (label: string, vehicle?: MotoristVehicle) => void;
  /** Persist a manually entered vehicle. Returns an error string or null. */
  onSaveVehicle?: (vehicle: MotoristVehicle) => string | null;
  /** When set, renders a pinned Back bar (with Save vehicle in manual mode). */
  onBack?: () => void;
}) {
  const [manual, setManual] = useState(vehicles.length === 0);
  const [vehicleType, setVehicleType] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [powertrain, setPowertrain] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const ink = isLight ? "text-slate-900" : "text-white";

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

  const handleSave = () => {
    setSaveError(null);
    if (!make.trim() || !model.trim()) {
      setSaveError("Enter brand and model first.");
      return;
    }
    const saved: MotoristVehicle = {
      id: `veh_${Date.now()}`,
      make: make.trim(),
      model: model.trim(),
      year: year.trim() || undefined,
      vehicleType: vehicleType.trim() || undefined,
      powertrain: powertrain.trim() || undefined,
    };
    if (onSaveVehicle) {
      const err = onSaveVehicle(saved);
      if (err) {
        setSaveError(err);
        return;
      }
    }
    setManual(false);
    onChange(formatVehicleLabel(saved));
  };

  const pickVehicle = (text: string) => {
    onChange(text);
    const picked = vehicles.find((v) => formatVehicleLabel(v) === text);
    onPick?.(text, picked);
  };

  const nextGray = isLight
    ? "bg-[#4a4d53] text-white"
    : "bg-[#5c5c60] text-white";
  const actionFlat = isLight ? "text-slate-700" : "text-white/85";
  const rowCard = isLight ? "bg-black/[0.02]" : "bg-white/[0.02]";
  const insetLine = isLight
    ? "relative after:absolute after:bottom-0 after:left-1 after:right-0 after:h-px after:bg-black/[0.08]"
    : "relative after:absolute after:bottom-0 after:left-1 after:right-0 after:h-px after:bg-white/[0.08]";

  const heading = (
    <p className={cn("mt-2 px-0.5 pb-2 text-[14px] font-bold leading-snug", ink)}>
      {vehicles.length && !manual
        ? "Which vehicle?"
        : "Enter your vehicle"}
    </p>
  );

  const body = vehicles.length > 0 && !manual ? (
    <div className="flex flex-col gap-1">
      {vehicles.map((v) => {
        const text = formatVehicleLabel(v);
        const on = savedMatch?.id === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => pickVehicle(text)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[4px] border-0 px-1 py-3 text-left transition-transform duration-150 active:scale-[0.985]",
              rowCard,
              insetLine
            )}
          >
            <span
              className={cn(
                "min-w-0 flex-1 text-[13px] font-semibold capitalize leading-snug",
                on ? "text-brand" : ink
              )}
            >
              {text}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => {
          setManual(true);
          setSaveError(null);
          onChange("");
        }}
        className={cn(
          "w-full rounded-[4px] border-0 px-1 py-3 text-left text-[13px] font-semibold",
          rowCard,
          ink
        )}
      >
        Enter another vehicle
      </button>
    </div>
  ) : (
    <div>
      <VehicleCascadeFields
        variant="profile"
        isLight={isLight}
        makeLabel="Brand"
        vehicleType={vehicleType}
        onVehicleTypeChange={(v) => {
          setVehicleType(v);
          pushManual(v, make, model, year);
        }}
        powertrain={powertrain}
        onPowertrainChange={(v) => {
          setPowertrain(v);
          pushManual(vehicleType, make, model, year);
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
      {!onBack ? (
        <button
          type="button"
          disabled={!make.trim() || !model.trim()}
          onClick={handleSave}
          className={cn(
            "mt-3 h-11 w-full rounded-md border-0 text-[14px] font-bold disabled:opacity-50",
            nextGray
          )}
        >
          Save vehicle
        </button>
      ) : null}
      {!onBack && saveError ? (
        <p className="mt-1 text-[12px] font-semibold text-red-500">
          {saveError}
        </p>
      ) : null}
    </div>
  );

  if (onBack) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
          {heading}
          {body}
        </div>
        {saveError ? (
          <p className="mt-1 shrink-0 text-[12px] font-semibold text-red-500">
            {saveError}
          </p>
        ) : null}
        <div className="flex shrink-0 gap-2 pt-2">
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "h-11 flex-1 rounded-md border-0 text-[14px] font-bold",
              actionFlat
            )}
          >
            Back
          </button>
          {manual ? (
            <button
              type="button"
              disabled={!make.trim() || !model.trim()}
              onClick={handleSave}
              className={cn(
                "h-11 flex-1 rounded-md border-0 text-[14px] font-bold disabled:opacity-50",
                nextGray
              )}
            >
              Save vehicle
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      {heading}
      {body}
    </div>
  );
}
