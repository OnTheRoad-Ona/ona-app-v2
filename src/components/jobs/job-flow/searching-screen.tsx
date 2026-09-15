"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Minimize2 } from "lucide-react";
import { JobShell } from "@/components/jobs/job-shell";
import { apiTransition } from "@/lib/jobs/client";
import type { JobRecord } from "@/lib/jobs/types";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { cn } from "@/lib/utils";
import { SEARCH_REROUTE_WINDOW_MS } from "./job-utils";

// Lazy-load the searching map so the timer page paints instantly; the Google
// map mounts after the ring timer and bottom sheet are visible.
const SearchingMap = dynamic(
  () => import("@/components/jobs/searching-map").then((m) => m.SearchingMap),
  { ssr: false, loading: () => null },
);

export function SearchingScreen({
  job,
  viewer,
  backendUserId,
  isLight,
  err,
  onBack,
  nearbyLine,
}: {
  job: JobRecord;
  viewer: "motorist" | "repair_pro";
  backendUserId?: string | null;
  isLight: boolean;
  err: string | null;
  onBack: () => void;
  /** e.g. "2 Mechanics are near you" under the search feedback */
  nearbyLine?: string | null;
}) {
  const router = useRouter();
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const skillLabel =
    (PRO_SERVICE_LABELS[job.serviceType] || "Pro")
      .replace(/\s*Pro$/i, "")
      .trim() || "Pro";
  const [idx, setIdx] = useState(0);
  const messages = useMemo(
    () => [
      `Searching for the nearest ${skillLabel} near you…`,
      `Checking ${skillLabel}s available right now…`,
      `Still looking for an available ${skillLabel}…`,
      `Widening the search to more ${skillLabel}s…`,
    ],
    [skillLabel],
  );
  useEffect(() => {
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % messages.length),
      2600,
    );
    return () => window.clearInterval(id);
  }, [messages.length]);

  const cancelSearch = useCallback(
    (auto: boolean) => {
      // Pending (/jobs/new) has no server job yet just go home, no CANCEL.
      if (job.id.startsWith("pending-")) {
        router.replace("/");
        return;
      }
      // Navigate first no hang waiting on CANCEL network
      router.replace(auto ? `/requests/${job.id}` : "/");
      void apiTransition({
        jobId: job.id,
        event: "CANCEL",
        actor: "motorist",
        actorId: job.motoristId,
        reason: "motorist_cancelled_search",
      }).catch(() => {
        /* ignore */
      });
    },
    [job.id, job.motoristId, router],
  );

  // Manual cancel (user-initiated) go home.
  const handleCancelSearch = useCallback(
    () => void cancelSearch(false),
    [cancelSearch],
  );

  // 3-minute auto-cancel timer → auto-close: customer to job details page.
  useEffect(() => {
    const t = window.setTimeout(
      () => void cancelSearch(true),
      SEARCH_REROUTE_WINDOW_MS,
    );
    return () => window.clearTimeout(t);
  }, [cancelSearch]);

  // Pro never uses this full-page searching UI for requests panel only
  if (viewer === "repair_pro") {
    router.replace("/dashboard");
    return (
      <JobShell isLight={isLight} title="Service Request" compactHeader>
        <p
          className={cn(
            "px-0.5 pt-8 text-center text-[13px] font-medium",
            muted,
          )}
        >
          Opening dashboard…
        </p>
      </JobShell>
    );
  }

  return (
    <JobShell
      isLight={isLight}
      title={`Finding ${skillLabel} near you`}
      compactHeader
      fullBleed
      fillBody
      onBack={onBack}
      backIcon={<Minimize2 className="h-4 w-4" />}
    >
      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        {/* 60% real Google Map anchored on the motorist location */}
        <div className="relative min-h-0 flex-[3]">
          <SearchingMap job={job} isLight={isLight} />
        </div>

        {/* 40% bottom sheet with live searching feedback */}
        <div
          className={cn(
            "relative z-20 flex min-h-0 flex-[2] flex-col rounded-t-[2rem] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5",
            "shadow-[0_-10px_30px_rgba(0,0,0,0.35)]",
            isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white",
          )}
        >
          <div
            className={cn(
              "mx-auto h-1 w-10 shrink-0 rounded-full",
              isLight ? "bg-black/15" : "bg-white/20",
            )}
          />
          <p className="mt-3 text-center text-[10px] font-black uppercase tracking-[0.14em] text-[#FF6B35]">
            Searching for the nearest {skillLabel}
          </p>
          {nearbyLine ? (
            <p className={cn("mt-2 text-center text-[14px] font-bold", ink)}>
              {nearbyLine}
            </p>
          ) : null}
          <h2
            key={idx}
            className={cn(
              "mt-2 text-center text-[15px] font-bold leading-snug",
              ink,
            )}
          >
            {messages[idx]}
          </h2>
          <div className="mt-auto pb-2">
            <button
              type="button"
              onClick={() => void handleCancelSearch()}
              className={cn(
                "h-11 w-full rounded-xl border-0 text-[13px] font-bold transition-colors",
                isLight
                  ? "bg-red-500/15 text-red-700 hover:bg-red-500/25"
                  : "bg-red-500/20 text-red-400 hover:bg-red-500/30",
              )}
            >
              Cancel Request
            </button>
          </div>
        </div>
      </div>
      {err && (
        <p className="mt-4 text-center text-[12px] font-medium text-red-500">
          {err}
        </p>
      )}
    </JobShell>
  );
}
