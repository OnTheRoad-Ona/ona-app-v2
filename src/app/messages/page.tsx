"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Standalone Messages inbox is disabled.
 * Chat opens only from an active request / job (Message on the job screen).
 */
export default function MessagesPage() {
  const router = useRouter();
  const { theme, accountType } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const home = isPro ? "/dashboard" : "/";

  useEffect(() => {
    router.replace(isPro ? "/jobs" : "/requests");
  }, [router, isPro]);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title="Chat" backHref={home} />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p
          className={cn(
            "text-[15px] font-bold",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          Chat opens from a request
        </p>
        <p className="max-w-xs text-[13px] font-medium text-muted">
          Open an active job or request, then tap Message. There is no separate
          messages inbox.
        </p>
      </div>
    </div>
  );
}
