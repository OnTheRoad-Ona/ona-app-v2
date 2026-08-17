"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCreateJob } from "@/lib/jobs/client";
import { resolveDispatchTrades } from "@/lib/callout/dispatch-trades";
import { PRO_SERVICE_LABELS } from "@/lib/pro-service-id";
import { useApp } from "@/lib/store";
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
  const [step, setStep] = useState<1 | 2>(1);
  const [emergency, setEmergency] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/55";
  const field = isLight
    ? "bg-white text-slate-900 placeholder:text-slate-400"
    : "bg-[#2c2c2e] text-white placeholder:text-white/40";
  const card = isLight ? "bg-white/80" : "bg-[#1c1c1e]";

  const guessed = useMemo(
    () => resolveDispatchTrades(problem, statedTrade),
    [problem, statedTrade]
  );

  useEffect(() => {
    setProblem("");
    setStep(1);
    setEmergency(null);
    setError(null);
  }, [statedTrade]);

  const openEmergency = () => {
    if (!canOpenEmergencyCard(problem)) {
      setError("Tell us what is going on — a few words is enough.");
      return;
    }
    setError(null);
    setStep(2);
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
      serviceType: guessed.primary,
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

  return (
    <div
      className={cn(
        "min-h-full overflow-hidden rounded-t-lg px-3 pb-4 pt-2",
        isLight ? "bg-[#d8dce4]/90 backdrop-blur-sm" : "bg-black"
      )}
    >
      <p
        className={cn(
          "text-[10px] font-semibold uppercase tracking-wide",
          muted
        )}
      >
        Tell us what you need
      </p>

      <div className={cn("mt-2 rounded-xl p-3", card)}>
        <label className={cn("block text-[13px] font-bold", ink)}>
          What’s really going on?
        </label>
        <textarea
          value={problem}
          onChange={(e) => {
            const next = e.target.value;
            setProblem(next);
            if (!canOpenEmergencyCard(next) && step === 2) {
              setStep(1);
              setEmergency(null);
            }
          }}
          rows={2}
          placeholder="e.g. My car won’t start. I don’t know why."
          className={cn(
            "mt-1.5 w-full resize-none rounded-xl border-0 p-3 text-[14px] font-medium leading-relaxed outline-none",
            field
          )}
        />
        {step === 1 ? (
          <button
            type="button"
            disabled={!canOpenEmergencyCard(problem)}
            onClick={openEmergency}
            className="mt-3 h-10 w-full rounded-md border-0 bg-brand text-[13px] font-bold text-white disabled:opacity-50"
          >
            Continue
          </button>
        ) : null}
      </div>

      {step === 2 ? (
        <div className={cn("mt-2 rounded-xl p-3", card)}>
          <p className={cn("text-[13px] font-bold", ink)}>Emergency?</p>
          <div className="mt-1.5 flex gap-2">
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

      {step === 2 && guessed.mismatch && statedTrade ? (
        <p className={cn("mt-1.5 px-0.5 text-[11px] font-medium", muted)}>
          What you wrote sounds like{" "}
          {guessed.dispatchTrades.map((t) => PRO_SERVICE_LABELS[t]).join(", ")}.
          We’ll send that.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-[12px] font-semibold text-red-500">{error}</p>
      ) : null}

      {canFindPro(step, emergency) ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className={cn(
            "mt-3 h-11 w-full rounded-md border-0 text-[14px] font-bold text-white disabled:opacity-50",
            emergency ? "bg-red-600" : "bg-brand"
          )}
        >
          {busy ? "Finding help…" : "Find a Repair Pro"}
        </button>
      ) : null}
    </div>
  );
}
