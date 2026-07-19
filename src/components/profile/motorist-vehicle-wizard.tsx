"use client";

/**
 * Add one motorist vehicle — one field group per step, unlimited vehicles.
 */

import { useState } from "react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { compressImageFile } from "@/lib/image-compress";
import { COMMON_VEHICLE_ISSUES } from "@/lib/profile-system";
import type { MotoristVehicle } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_TITLES: Record<Step, string> = {
  1: "Make",
  2: "Model",
  3: "Year",
  4: "Plate number",
  5: "Photo (optional)",
  6: "Common issues (optional)",
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
    ? "h-11 w-full rounded-md border-0 bg-black/8 px-3 text-[14px] font-medium text-slate-900 outline-none"
    : "h-11 w-full rounded-md border-0 bg-[#2c2c2e] px-3 text-[14px] font-medium text-white outline-none";

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/70";

  const canNext = () => {
    if (step === 1) return make.trim().length >= 1;
    if (step === 2) return model.trim().length >= 1;
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
      setErr(step === 1 ? "Enter the make." : "Enter the model.");
      return;
    }
    if (step < 6) setStep((s) => (s + 1) as Step);
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
          Add vehicle · Step {step} of 6
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
        <input
          className={field}
          placeholder="e.g. Toyota"
          value={make}
          onChange={(e) => setMake(e.target.value)}
          autoFocus
        />
      )}
      {step === 2 && (
        <input
          className={field}
          placeholder="e.g. Corolla"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          autoFocus
        />
      )}
      {step === 3 && (
        <input
          className={field}
          placeholder="e.g. 2018"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          inputMode="numeric"
          autoFocus
        />
      )}
      {step === 4 && (
        <input
          className={field}
          placeholder="Plate number"
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          autoFocus
        />
      )}
      {step === 5 && (
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
      {step === 6 && (
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
          {step === 6 ? "Save vehicle" : "Next"}
          {step < 6 && <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
