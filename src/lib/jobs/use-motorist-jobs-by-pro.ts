"use client";

import { useCallback, useEffect, useState } from "react";
import { apiListJobs } from "@/lib/jobs/client";
import {
  indexJobsByProId,
  listOpenCustomerJobs,
} from "@/lib/jobs/motorist-pro-cta";
import type { JobRecord } from "@/lib/jobs/types";
import { useApp } from "@/lib/store";

/**
 * Open (non-terminal) motorist jobs keyed by repairProId.
 * Powers “Open” vs “Request” on discovery list after customer leaves a job.
 */
export function useMotoristJobsByPro(): {
  byPro: Record<string, JobRecord>;
  openJobs: JobRecord[];
  ready: boolean;
  refresh: () => void;
} {
  const { backendUserId, accountType } = useApp();
  const [byPro, setByPro] = useState<Record<string, JobRecord>>({});
  const [openJobs, setOpenJobs] = useState<JobRecord[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!backendUserId || accountType === "professional") {
      setByPro({});
      setOpenJobs([]);
      setReady(true);
      return;
    }
    try {
      const res = await apiListJobs(backendUserId, "motorist");
      if (!res.ok) {
        setReady(true);
        return;
      }
      const jobs = res.data.jobs || [];
      setByPro(indexJobsByProId(jobs));
      setOpenJobs(listOpenCustomerJobs(jobs));
    } catch {
      /* keep last */
    } finally {
      setReady(true);
    }
  }, [backendUserId, accountType]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    // Soft poll so CTA flips Request → Open (Realtime covers most updates)
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, 45_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(t);
    };
  }, [load]);

  return { byPro, openJobs, ready, refresh: load };
}
