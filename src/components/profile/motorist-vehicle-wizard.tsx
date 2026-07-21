"use client";

/**
 * Add one motorist vehicle — cascade Make/Model/Year then extras.
 * Unlimited vehicles on profile.
 */

import { useState } from "react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { VehicleCascadeFields } from "@/components/vehicles/vehicle-cascade-fields";
import { compressImageFile } from "@/lib/image-compress";
import { COMMON_VEHICLE_ISSUES } from "@/lib/profile-system";
import type { MotoristVehicle } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<Step, string> = {
  1: "Vehicle",
  2: "Plate number",
  3: "Photo (optional)",
  4: "Common issues (optional)",
};

export function MotoristVehicleWizard({
  isLight,
  onCancel,
  onSave,
}: {
  isLight: boolean;
  onCancel: () => void;
  onSave: (v: MotoristVehicle) => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [plate, setPlate] = useState("");
  const [photo, setPhoto] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const field = isLight
    ? "h-11 w-full rounded-md border-0 bg-black/8 px-3 text-[14px] font-medium text-slate-900 outline-none placeholder:text-slate-500 placeholder:opacity-100"
    : "h-11 w-full rounded-md border-0 bg-[#2c2c2e] px-3 text-[14px] font-medium text-white outline-none placeholder:text-white/50 placeholder:opacity-100";

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/70";

  const canNext = () => {
    if (step === 1) return make.trim().length >= 1 && model.trim().length >= 1;
    return true;
  };

  const finish = () => {
    if (!make.trim() || !model.trim()) {
      setErr("Make and model are required.");
      setStep(1);
      return;
    }
    onSave({
      id: `veh-${Date.now()}`,
      make: make.trim(),
      model: model.trim(),
      year: year.trim() || undefined,
      plate: plate.trim() || undefined,
      photo: photo || undefined,
      commonIssues: issues.length ? issues : undefined,
    });
  };

  const goNext = () => {
    setErr(null);
    if (!canNext()) {
      setErr("Pick make and model from the lists.");
      return;
    }
    if (step < 4) setStep((s) => (s + 1) as Step);
    else finish();
  };

  const goBack = () => {
    setErr(null);
    if (step === 1) onCancel();
    else setStep((s) => (s - 1) as Step);
  };

  return (
    <div
      className={cn(
        "rounded-xl px-3 py-3 transition-all duration-200",
        isLight ? "bg-black/[0.04]" : "bg-white/[0.06]"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={cn("text-[12px] font-bold", ink)}>
          Add vehicle · Step {step} of 4
        </p>
        <button
          type="button"
          onClick={onCancel}
          className={cn("border-0 bg-transparent text-[11px] font-semibold", muted)}
        >
          Cancel
        </button>
      </div>
      <p className={cn("mb-3 text-[13px] font-semibold", ink)}>
        {STEP_TITLES[step]}
      </p>

      {step === 1 && (
        <VehicleCascadeFields
          variant="profile"
          isLight={isLight}
          make={make}
          model={model}
          year={year}
          onMakeChange={setMake}
          onModelChange={setModel}
          onYearChange={setYear}
        />
      )}
      {step === 2 && (
        <input
          className={field}
          placeholder="Plate number"
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          autoFocus
        />
      )}
      {step === 3 && (
        <label className="flex cursor-pointer items-center gap-3">
          <span
            className={cn(
              "flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl",
              isLight ? "bg-black/10" : "bg-[#2c2c2e]"
            )}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-5 w-5 text-brand" />
            )}
          </span>
          <span className={cn("text-[12px] font-semibold", ink)}>
            {photo ? "Change photo" : "Tap to add photo · or skip"}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setPhoto(await compressImageFile(f, { maxEdge: 720 }));
              } catch {
                setErr("Could not process photo.");
              }
            }}
          />
        </label>
      )}
      {step === 4 && (
        <div className="flex flex-wrap gap-1.5">
          {COMMON_VEHICLE_ISSUES.map((issue) => {
            const on = issues.includes(issue);
            return (
              <button
                key={issue}
                type="button"
                onClick={() =>
                  setIssues((prev) =>
                    on ? prev.filter((x) => x !== issue) : [...prev, issue]
                  )
                }
                className={cn(
                  "rounded-full border-0 px-2.5 py-1 text-[10px] font-bold",
                  on
                    ? "bg-brand text-white"
                    : isLight
                      ? "bg-black/8 text-slate-700"
                      : "bg-[#2c2c2e] text-white/75"
                )}
              >
                {issue}
              </button>
            );
          })}
        </div>
      )}

      {err && (
        <p className="mt-2 text-[11px] font-semibold text-red-500">{err}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={goBack}
          className={cn(
            "inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-md border-0 text-[13px] font-semibold",
            isLight ? "bg-black/10 text-slate-900" : "bg-[#2c2c2e] text-white"
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          {step === 1 ? "Cancel" : "Back"}
        </button>
        <button
          type="button"
          onClick={goNext}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-md border-0 bg-[#323231] text-[13px] font-semibold text-white"
        >
          {step === 4 ? "Save vehicle" : "Next"}
          {step < 4 && <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
