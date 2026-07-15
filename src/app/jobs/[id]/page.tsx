"use client";

import { Suspense, useMemo } from "react";
import { useParams } from "next/navigation";
import { JobFlowScreen } from "@/components/jobs/job-flow-screen";
import { useApp } from "@/lib/store";

function JobPageInner() {
  const params = useParams();
  const id = String(params?.id || "");
  const { theme, userProfile, accountType, backendUserId } = useApp();
  const isLight = theme === "light";

  const viewer = accountType === "professional" ? "repair_pro" : "motorist";
  const actorId = useMemo(
    () =>
      backendUserId ||
      userProfile?.identityId ||
      userProfile?.email ||
      "local-user",
    [backendUserId, userProfile]
  );

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
