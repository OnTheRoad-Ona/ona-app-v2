"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCreateJob } from "@/lib/jobs/client";
import { decideHelpTrade } from "@/lib/callout/dispatch-trades";
import { PRO_SERVICE_LABELS } from "@/lib/pro-service-id";
import { problemPlaceholderForTrade } from "@/lib/pricing";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  canFindPro,
  canOpenEmergencyCard,
  talkBoxAfterTradePick,
} from "@/components/home/need-help-steps";

/**
 * Replaces the nearby-pro list. Customer already picked a trade
 * on the strip. Cards open one at a time; SSPE finds the Repair Pro.
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
  } = useApp();

  const statedTrade = talkBoxAfterTradePick(category) ? category : null;

  const [problem, setProblem] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [chosenTrade, setChosenTrade] = useState<ProService | null>(null);
  const [emergency, setEmergency] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ink = isLight ? "text-slate-900" : "text-white";
  const field = isLight
    ? "bg-white text-slate-900 placeholder:text-slate-400"
    : "bg-[#2c2c2e] text-white placeholder:text-white/40";
  const card = isLight ? "bg-white/80" : "bg-[#1c1c1e]";

  const decision = useMemo(
    () => decideHelpTrade(problem, statedTrade),
    [problem, statedTrade]
  );

  useEffect(() => {
    setProblem("");
    setStep(1);
    setChosenTrade(null);
    setEmergency(null);
    setError(null);
  }, [statedTrade]);

  const goAfterProblem = () => {
    if (!canOpenEmergencyCard(problem)) {
      setError("A few words is enough.");
      return;
    }
    setError(null);
    if (decision.needsConfirm) {
      setStep(2);
      return;
    }
    setChosenTrade(statedTrade);
    setStep(3);
  };

  const acceptSuggested = () => {
    setChosenTrade(decision.suggested);
    setEmergency(null);
    setStep(3);
  };

  const keepTappedTrade = () => {
    setChosenTrade(statedTrade);
    setEmergency(null);
    setStep(3);
  };

  const send = async () => {
    if (!canFindPro(step, emergency)) {
      setError("Pick Yes or No for emergency first.");
      return;
    }
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
    setBusy(true);
    setError(null);
    const res = await apiCreateJob({
      motoristId,
      motoristName: userProfile?.fullName || "Customer",
      motoristPhoto: userProfile?.avatarUrl || null,
      serviceType: chosenTrade || statedTrade || decision.suggested,
      problem: text,
      emergency: Boolean(emergency),
      currency: "NGN",
      locationLabel: helpingSomeoneElse
        ? helpingSomeoneLabel || location.label
        : location.label,
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
      radiusKm,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message || "Could not send. Try again.");
      return;
    }
    router.replace(`/jobs/${res.data.job.id}`);
  };

  const continueGray = isLight
    ? "bg-[#9b9ea4] text-white"
    : "bg-[#5c5c60] text-white";

  const action =
    step === 1 ? (
      <button
        type="button"
        disabled={!canOpenEmergencyCard(problem)}
        onClick={goAfterProblem}
        className={cn(
          "h-11 w-full rounded-md border-0 text-[14px] font-bold disabled:opacity-50",
          continueGray
        )}
      >
        Continue
      </button>
    ) : step === 2 ? (
      <button
        type="button"
        disabled
        className={cn(
          "h-11 w-full rounded-md border-0 text-[14px] font-bold opacity-50",
          continueGray
        )}
      >
        Continue
      </button>
    ) : canFindPro(step, emergency) ? (
      <button
        type="button"
        disabled={busy}
        onClick={() => void send()}
        className={cn(
          "h-11 w-full rounded-md border-0 text-[14px] font-bold text-white disabled:opacity-50",
          emergency ? "bg-red-600" : "bg-brand"
        )}
      >
        {busy ? "Finding help…" : "Find a Repair Pro"}
      </button>
    ) : (
      <button
        type="button"
        disabled
        className="h-11 w-full rounded-md border-0 bg-brand text-[14px] font-bold text-white opacity-50"
      >
        Find a Repair Pro
      </button>
    );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-t-lg px-3 pb-2 pt-1.5",
        isLight ? "bg-[#d8dce4]/90 backdrop-blur-sm" : "bg-black"
      )}
    >
      <div className={cn("shrink-0 rounded-xl px-3 py-2", card)}>
        <label className={cn("block text-[13px] font-bold", ink)}>
          What do you need help with?
        </label>
        <textarea
          value={problem}
          onChange={(e) => {
            const next = e.target.value;
            setProblem(next);
            if (!canOpenEmergencyCard(next) && step !== 1) {
              setStep(1);
              setChosenTrade(null);
              setEmergency(null);
            }
          }}
          rows={2}
          placeholder={problemPlaceholderForTrade(statedTrade)}
          className={cn(
            "mt-1 w-full resize-none rounded-xl border-0 px-2.5 py-2 text-[13px] font-medium leading-snug outline-none",
            field
          )}
        />
      </div>

      {step === 2 ? (
        <div className={cn("mt-1.5 rounded-xl px-3 py-2", card)}>
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
                isLight
                  ? "bg-black/8 text-slate-700"
                  : "bg-[#2c2c2e] text-white/75"
              )}
            >
              No
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className={cn("mt-1.5 rounded-xl px-3 py-2", card)}>
          <p className={cn("text-[13px] font-bold", ink)}>Emergency?</p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setEmergency(true)}
              className={cn(
                "rounded-full border-0 px-3 py-1.5 text-[12px] font-bold",
                emergency === true
                  ? "bg-red-600 text-white"
                  : isLight
                    ? "bg-black/8 text-slate-700"
                    : "bg-[#2c2c2e] text-white/75"
              )}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setEmergency(false)}
              className={cn(
                "rounded-full border-0 px-3 py-1.5 text-[12px] font-bold",
                emergency === false
                  ? "bg-brand text-white"
                  : isLight
                    ? "bg-black/8 text-slate-700"
                    : "bg-[#2c2c2e] text-white/75"
              )}
            >
              No
            </button>
          </div>
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
