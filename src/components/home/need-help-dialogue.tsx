"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCreateJob } from "@/lib/jobs/client";
import { resolveDispatchTrades } from "@/lib/callout/dispatch-trades";
import { PRO_SERVICE_LABELS, ALL_PRO_SERVICES } from "@/lib/services";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { isProService } from "@/lib/services";
import { cn } from "@/lib/utils";

/**
 * Replaces the nearby-pro list. Customer says what is going on;
 * SSPE finds the Repair Pro.
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

  const prefill =
    category !== "all" && isProService(category) ? category : null;
  const [problem, setProblem] = useState("");
  const [service, setService] = useState<ProService | "unsure">(
    prefill ?? "unsure"
  );

  useEffect(() => {
    if (prefill) setService(prefill);
  }, [prefill]);
  const [emergency, setEmergency] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/55";
  const field = isLight
    ? "bg-white text-slate-900 placeholder:text-slate-400"
    : "bg-[#2c2c2e] text-white placeholder:text-white/40";

  const guessed = useMemo(
    () => resolveDispatchTrades(problem, service === "unsure" ? null : service),
    [problem, service]
  );

  const send = async () => {
    const text = problem.trim();
    if (text.length < 3) {
      setError("Tell us what is going on — a few words is enough.");
      return;
    }
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
    const trade =
      service !== "unsure"
        ? service
        : guessed.primary;
    const res = await apiCreateJob({
      motoristId,
      motoristName: userProfile?.fullName || "Customer",
      motoristPhoto: userProfile?.avatarUrl || null,
      serviceType: trade,
      problem: text,
      emergency,
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
      <label className={cn("mt-2 block text-[13px] font-bold", ink)}>
        What’s really going on?
      </label>
      <textarea
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        rows={4}
        placeholder="e.g. My car won’t start. I don’t know why."
        className={cn(
          "mt-1.5 w-full resize-y rounded-xl border-0 p-3 text-[14px] font-medium leading-relaxed outline-none",
          field
        )}
      />

      <p className={cn("mt-3 text-[13px] font-bold", ink)}>What service?</p>
      <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
        Pick one if you know. If you’re not sure, leave it — we’ll match from
        what you wrote.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setService("unsure")}
          className={cn(
            "rounded-full border-0 px-2.5 py-1 text-[11px] font-bold",
            service === "unsure"
              ? "bg-brand text-white"
              : isLight
                ? "bg-black/8 text-slate-700"
                : "bg-[#2c2c2e] text-white/75"
          )}
        >
          Not sure
        </button>
        {ALL_PRO_SERVICES.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setService(id)}
            className={cn(
              "rounded-full border-0 px-2.5 py-1 text-[11px] font-bold",
              service === id
                ? "bg-brand text-white"
                : isLight
                  ? "bg-black/8 text-slate-700"
                  : "bg-[#2c2c2e] text-white/75"
            )}
          >
            {PRO_SERVICE_LABELS[id]}
          </button>
        ))}
      </div>
      {guessed.mismatch && service !== "unsure" ? (
        <p className={cn("mt-1.5 text-[11px] font-medium", muted)}>
          What you wrote sounds like{" "}
          {guessed.dispatchTrades.map((t) => PRO_SERVICE_LABELS[t]).join(", ")}.
          We’ll send that.
        </p>
      ) : null}

      <p className={cn("mt-3 text-[13px] font-bold", ink)}>Emergency?</p>
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          onClick={() => setEmergency(true)}
          className={cn(
            "rounded-full border-0 px-3 py-1.5 text-[12px] font-bold",
            emergency
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
            !emergency
              ? "bg-brand text-white"
              : isLight
                ? "bg-black/8 text-slate-700"
                : "bg-[#2c2c2e] text-white/75"
          )}
        >
          No
        </button>
      </div>

      {error ? (
        <p className="mt-2 text-[12px] font-semibold text-red-500">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void send()}
        className={cn(
          "mt-4 h-11 w-full rounded-md border-0 text-[14px] font-bold text-white disabled:opacity-50",
          emergency ? "bg-red-600" : "bg-brand"
        )}
      >
        {busy ? "Finding help…" : "Find a Repair Pro"}
      </button>
    </div>
  );
}
