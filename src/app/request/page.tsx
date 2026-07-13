"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Zap } from "lucide-react";
import {
  VerificationBlockedPanel,
  VerificationWarningBanner,
} from "@/components/auth/verification-gate-banner";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const PROBLEMS = [
  "Flat tire / puncture",
  "Engine issue",
  "Battery dead",
  "Brakes problem",
  "Car stuck / towing",
  "Other roadside help",
];

function RequestFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const techId = params.get("tech");
  const {
    technicians,
    visibleTechnicians,
    bookRequest,
    setSelectedTechId,
    theme,
  } = useApp();
  const isLight = theme === "light";

  const tech = useMemo(() => {
    if (techId) return technicians.find((t) => t.id === techId);
    return (
      visibleTechnicians.find((t) => t.status === "available") ??
      visibleTechnicians[0]
    );
  }, [techId, technicians, visibleTechnicians]);

  const [problem, setProblem] = useState(PROBLEMS[0]);
  const [step, setStep] = useState<"confirm" | "done">("confirm");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  if (!tech) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-3 p-6",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <p className="font-semibold">No technician available</p>
        <p className="text-center text-sm text-muted">
          Expand search radius or try another category.
        </p>
        <Button asChild>
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    );
  }

  const submit = () => {
    setSelectedTechId(tech.id);
    setBlocked(null);
    const result = bookRequest(tech, problem);
    if (!result.ok) {
      setBlocked(result.message);
      return;
    }
    if (result.warning) setWarning(result.warning);
    setRequestId(result.request?.id ?? null);
    setStep("done");
  };

  if (step === "done") {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center px-6 text-center",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        </div>
        <h1
          className={cn(
            "mt-4 text-2xl font-bold",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          Help is on the way
        </h1>
        <p className={cn("mt-2 text-sm", isLight ? "text-slate-500" : "text-slate-400")}>
          Request sent to <strong>{tech.name}</strong>. ETA about{" "}
          {tech.etaMinutes} minutes.
        </p>
        {requestId && (
          <p className="mt-1 text-xs text-slate-400">ID: {requestId}</p>
        )}
        {warning && (
          <div className="mt-4 w-full max-w-sm text-left">
            <VerificationWarningBanner message={warning} isLight={isLight} />
          </div>
        )}
        <div className="mt-6 flex w-full flex-col gap-2">
          <Button size="lg" onClick={() => router.push("/requests")}>
            Track request
          </Button>
          <Button size="lg" variant="secondary" onClick={() => router.push("/")}>
            Back home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <header className="page-header">
        <button
          type="button"
          onClick={() => router.back()}
          className="page-back"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1
            className={cn(
              "text-lg font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Request Help
          </h1>
          <p className="text-xs text-muted">Confirm service · 2 steps max</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        <div className="card-surface rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Matched technician
          </p>
          <p
            className={cn(
              "mt-1 text-lg font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {tech.name}
          </p>
          <p className="text-sm text-muted">
            {tech.roleLabel} · {tech.etaMinutes} min ·{" "}
            {tech.distanceKm.toFixed(1)} km
          </p>
        </div>

        <p
          className={cn(
            "mb-2 mt-5 text-sm font-semibold",
            isLight ? "text-slate-800" : "text-slate-100"
          )}
        >
          What do you need help with?
        </p>
        <div className="space-y-2">
          {PROBLEMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProblem(p)}
              className={cn(
                "w-full rounded-lg border-0 px-4 py-3 text-left text-sm font-medium transition-colors",
                problem === p
                  ? "bg-brand-soft text-brand"
                  : isLight
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "bg-black text-slate-200 hover:bg-slate-700"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {blocked && (
          <VerificationBlockedPanel
            message={blocked}
            isLight={isLight}
            onClose={() => setBlocked(null)}
          />
        )}
        <Button size="lg" className="w-full" onClick={submit}>
          <Zap className="h-5 w-5 fill-white" />
          Confirm & Connect
        </Button>
      </div>
    </div>
  );
}

export default function RequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-white text-sm text-slate-500">
          Loading request…
        </div>
      }
    >
      <RequestFlow />
    </Suspense>
  );
}
