"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { JobFlowScreen } from "@/components/jobs/job-flow-screen";
import { apiGetJob } from "@/lib/jobs/client";
import { useApp } from "@/lib/store";

function JobPageInner() {
  const params = useParams();
  const id = String(params?.id || "");
  const router = useRouter();
  const { theme, userProfile, accountType, backendUserId } = useApp();
  const isLight = theme === "light";

  const actorId = useMemo(
    () =>
      backendUserId ||
      userProfile?.identityId ||
      userProfile?.email ||
      "local-user",
    [backendUserId, userProfile]
  );

  /**
   * Prefer job membership over current “Use as” role so dual-role users
   * who are still on Repair Pro still see Customer “I am satisfied”.
   */
  const [viewer, setViewer] = useState<"motorist" | "repair_pro">(
    accountType === "professional" ? "repair_pro" : "motorist"
  );

  useEffect(() => {
    let cancelled = false;
    if (!id || !actorId) return;
    void (async () => {
      const res = await apiGetJob(id);
      if (cancelled) return;
      if (!res.ok) {
        if (res.message === "Job not found") {
          router.replace(accountType === "professional" ? "/jobs" : "/");
          return;
        }
        return;
      }
      const j = res.data.job;
      if (j.motoristId && j.motoristId === actorId) {
        setViewer("motorist");
      } else if (j.repairProId && j.repairProId === actorId) {
        setViewer("repair_pro");
      } else {
        setViewer(accountType === "professional" ? "repair_pro" : "motorist");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, actorId, accountType]);

  if (!id) {
    return (
      <div className="p-6 text-center text-sm font-semibold opacity-60">
        Missing job id
      </div>
    );
  }

  return (
    <JobFlowScreen
      jobId={id}
      isLight={isLight}
      viewer={viewer}
      actorId={actorId}
      email={userProfile?.email}
    />
  );
}

export default function JobPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm font-semibold opacity-60">
          Loading…
        </div>
      }
    >
      <JobPageInner />
    </Suspense>
  );
}
