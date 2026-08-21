"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCreateJob } from "@/lib/jobs/client";
import { decideHelpTrade } from "@/lib/callout/dispatch-trades";
import { CALLOUT_URGENCY_OPTIONS } from "@/lib/callout/urgency";
import { PRO_SERVICE_LABELS } from "@/lib/pro-service-id";
import { problemPlaceholderForTrade } from "@/lib/pricing";
import { useApp } from "@/lib/store";
import {
  nearestProDistanceKm,
  useAutoCalloutUrgency,
} from "@/lib/callout/use-auto-urgency";
import type { MotoristVehicle, ProService } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  canFindPro,
  canOpenEmergencyCard,
  talkBoxAfterTradePick,
  type HelpStep,
} from "@/components/home/need-help-steps";
import {
  formatVehicleLabel,
  JobVehicleStep,
  profileVehiclesOf,
} from "@/components/home/job-vehicle-step";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";

/**
 * One card at a time. SSPE finds the Repair Pro after they finish.
 */
export function NeedHelpDialogue({ isLight }: { isLight: boolean }) {
  const router = useRouter();
  const {
    category,
    location,
    userProfile,
    backendUserId,
    radiusKm,
    isAuthenticated,
    helpingSomeoneElse,
    helpingSomeoneLabel,
    updateUserProfile,
    visibleTechnicians,
  } = useApp();

  const statedTrade = talkBoxAfterTradePick(category) ? category : null;
  const needsVehicle = isAutomotiveTrade(statedTrade);

  const [problem, setProblem] = useState("");
  const [step, setStep] = useState<HelpStep>("help");
  const [chosenTrade, setChosenTrade] = useState<ProService | null>(null);
  const autoTrade = chosenTrade ?? statedTrade;
  const { urgency, setUrgency, resetUrgency } = useAutoCalloutUrgency({
    unsafe: false,
    distanceKm: nearestProDistanceKm(
      visibleTechnicians,
      autoTrade ? [autoTrade] : []
    ),
  });
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [manualVehicles, setManualVehicles] = useState<MotoristVehicle[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileVehicles = useMemo(
    () => profileVehiclesOf(userProfile),
    [userProfile]
  );
  /** Profile vehicles + vehicles saved in this session (deduped by label). */
  const savedVehicles = useMemo(
    () => [
      ...profileVehicles,
      ...manualVehicles.filter(
        (mv) =>
          !profileVehicles.some(
            (pv) => formatVehicleLabel(pv) === formatVehicleLabel(mv)
          )
      ),
    ],
    [profileVehicles, manualVehicles]
  );

  const saveVehicle = (v: MotoristVehicle): string | null => {
    setManualVehicles((prev) => [...prev, v]);
    if (userProfile) {
      updateUserProfile({ vehicles: [...(userProfile.vehicles ?? []), v] });
    }
    return null;
  };

  const ink = isLight ? "text-slate-900" : "text-white";
  const field = isLight
    ? "bg-white text-slate-900 placeholder:text-slate-400"
    : "bg-[#2c2c2e] text-white placeholder:text-white/40";
  const card = isLight ? "bg-white/80" : "bg-[#1c1c1e]";
  const nextGray = isLight
    ? "bg-[#4a4d53] text-white"
    : "bg-[#5c5c60] text-white";
  const chipIdle = isLight
    ? "bg-black/8 text-slate-700"
    : "bg-[#2c2c2e] text-white/75";

  const decision = useMemo(
    () => decideHelpTrade(problem, statedTrade),
    [problem, statedTrade]
  );

  useEffect(() => {
    setProblem("");
    setStep(isAutomotiveTrade(statedTrade) ? "vehicle" : "help");
    setChosenTrade(null);
    resetUrgency();
    setVehicleLabel("");
    setError(null);
  }, [statedTrade, resetUrgency]);

  const goAfterHelp = () => {
    if (!canOpenEmergencyCard(problem)) {
      setError("A few words is enough.");
      return;
    }
    setError(null);
    if (decision.needsConfirm) {
      setStep("confirm");
      return;
    }
    setChosenTrade(statedTrade);
    setStep("urgency");
  };

  const acceptSuggested = () => {
    setChosenTrade(decision.suggested);
    setStep("urgency");
  };

  const keepTappedTrade = () => {
    setChosenTrade(statedTrade);
    setStep("urgency");
  };

  const goBack = () => {
    setError(null);
    if (step === "send") {
      setStep("urgency");
      return;
    }
    if (step === "urgency") {
      setStep(decision.needsConfirm ? "confirm" : "help");
      return;
    }
    if (step === "confirm") {
      setStep("help");
      return;
    }
    if (step === "help" && needsVehicle) setStep("vehicle");
  };

  const send = async () => {
    if (!canFindPro(step)) return;
    const text = problem.trim();
    if (!isAuthenticated) {
      router.push("/login/role");
      return;
    }
    const motoristId = backendUserId || userProfile?.identityId || "";
    if (!motoristId) {
      router.push("/login/role");
      return;
    }
    const payload = {
      motoristId,
      motoristName: userProfile?.fullName || "Customer",
      motoristPhoto: userProfile?.avatarUrl || null,
      serviceType: chosenTrade || statedTrade || decision.suggested,
      motoristVehicle: needsVehicle ? vehicleLabel || null : null,
      problem: text,
      emergency: urgency === "emergency",
      calloutUrgency: urgency,
      currency: "NGN",
      locationLabel: helpingSomeoneElse
        ? helpingSomeoneLabel || location.label
        : location.label,
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
      radiusKm,
    };
    setError(null);
    // Instant paint: hand the payload to /jobs/new (optimistic) and create the
    // job there in the background. Fall back to POST-first if the payload can't
    // be stashed (e.g. sessionStorage quota).
    let preloaded = false;
    try {
      window.sessionStorage.setItem("ona-new-request", JSON.stringify(payload));
      preloaded = true;
    } catch {
      /* fall through to POST-first */
    }
    if (preloaded) {
      router.replace("/jobs/new");
      return;
    }
    setBusy(true);
    const res = await apiCreateJob(payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.message || "Could not send. Try again.");
      return;
    }
    try {
      window.sessionStorage.setItem(
        `ona-seed-job:${res.data.job.id}`,
        JSON.stringify(res.data.job)
      );
    } catch {
      /* ignore */
    }
    router.replace(`/jobs/${res.data.job.id}`);
  };

  const action = (
    <div className="flex gap-2">
      {step !== "vehicle" && (step !== "help" || needsVehicle) ? (
        <button
          type="button"
          onClick={goBack}
          className={cn(
            "h-11 flex-1 rounded-md border-0 text-[14px] font-bold",
            nextGray
          )}
        >
          Back
        </button>
      ) : null}
      {step === "help" ? (
        <button
          type="button"
          disabled={!canOpenEmergencyCard(problem)}
          onClick={goAfterHelp}
          className={cn(
            "h-11 w-full rounded-md border-0 text-[14px] font-bold disabled:opacity-50",
            nextGray
          )}
        >
          Next
        </button>
      ) : null}
      {step === "urgency" ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep("send");
          }}
          className={cn(
            "h-11 flex-1 rounded-md border-0 text-[14px] font-bold",
            nextGray
          )}
        >
          Next
        </button>
      ) : null}
      {step === "send" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className="h-11 flex-1 rounded-md border-0 bg-brand text-[14px] font-bold text-white disabled:opacity-50"
        >
          {busy ? "Finding help…" : "Find a Repair Pro"}
        </button>
      ) : null}
    </div>
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-t-lg px-3 pb-2 pt-1.5",
        isLight ? "bg-[#d8dce4]/90 backdrop-blur-sm" : "bg-black"
      )}
    >
      {step === "vehicle" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <JobVehicleStep
            isLight={isLight}
            vehicles={savedVehicles}
            label={vehicleLabel}
            onChange={(next) => {
              setVehicleLabel(next);
              setError(null);
            }}
            onPick={(next) => {
              setVehicleLabel(next);
              setError(null);
              setStep("help");
            }}
            onSaveVehicle={saveVehicle}
          />
        </div>
      ) : null}

      {step === "help" ? (
        <div className={cn("shrink-0 rounded-xl px-3 py-2", card)}>
          <label className={cn("block text-[13px] font-bold", ink)}>
            What do you need help with?
          </label>
          <textarea
            value={problem}
            onChange={(e) => {
              setProblem(e.target.value);
              setError(null);
            }}
            rows={2}
            placeholder={problemPlaceholderForTrade(statedTrade)}
            className={cn(
              "mt-1 w-full resize-none rounded-xl border-0 px-2.5 py-2 text-[13px] font-medium leading-snug outline-none",
              field
            )}
          />
        </div>
      ) : null}

      {step === "confirm" ? (
        <div className={cn("shrink-0 rounded-xl px-3 py-2", card)}>
          <p className={cn("text-[13px] font-bold", ink)}>
            This sounds like {PRO_SERVICE_LABELS[decision.suggested]}. Continue?
          </p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={acceptSuggested}
              className="rounded-full border-0 bg-brand px-3 py-1.5 text-[12px] font-bold text-white"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={keepTappedTrade}
              className={cn(
                "rounded-full border-0 px-3 py-1.5 text-[12px] font-bold",
                chipIdle
              )}
            >
              No
            </button>
          </div>
        </div>
      ) : null}

      {step === "urgency" ? (
        <div className={cn("shrink-0 rounded-xl px-3 py-2", card)}>
          <p className={cn("text-[13px] font-bold", ink)}>How urgent is this?</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CALLOUT_URGENCY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setUrgency(opt.id)}
                className={cn(
                  "rounded-full border-0 px-3 py-1.5 text-[12px] font-bold",
                  urgency === opt.id
                    ? "bg-brand text-white"
                    : chipIdle
                )}
              >
                {opt.label} {opt.multiplier === 1 ? "1x" : `${opt.multiplier}x`}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === "send" ? (
        <div className={cn("shrink-0 rounded-xl px-3 py-2", card)}>
          <p className={cn("text-[13px] font-bold", ink)}>Ready to send</p>
          <p className={cn("mt-1 text-[12px] font-medium", isLight ? "text-slate-600" : "text-white/55")}>
            {PRO_SERVICE_LABELS[chosenTrade || statedTrade || decision.suggested]}{" "}
            · {CALLOUT_URGENCY_OPTIONS.find((o) => o.id === urgency)?.label}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-1 shrink-0 text-[12px] font-semibold text-red-500">
          {error}
        </p>
      ) : null}

      <div className="mt-auto shrink-0 pt-2">{action}</div>
    </div>
  );
}
