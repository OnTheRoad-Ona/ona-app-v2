"use client";

import { useCallback, useEffect, useState } from "react";
import { apiListJobs } from "@/lib/jobs/client";
import { indexJobsByProId } from "@/lib/jobs/motorist-pro-cta";
import type { JobRecord } from "@/lib/jobs/types";
import { useApp } from "@/lib/store";

/**
 * Active motorist jobs keyed by repairProId.
 * Loads on mount + when tab becomes visible only (low data — no polling loop).
 */
export function useMotoristJobsByPro(): {
  byPro: Record<string, JobRecord>;
  ready: boolean;
  refresh: () => void;
} {
  const { backendUserId, accountType } = useApp();
  const [byPro, setByPro] = useState<Record<string, JobRecord>>({});
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!backendUserId || accountType === "professional") {
      setByPro({});
      setReady(true);
      return;
    }
    try {
      const res = await apiListJobs(backendUserId, "motorist");
      if (!res.ok) {
        setReady(true);
        return;
      }
      setByPro(indexJobsByProId(res.data.jobs || []));
    } catch {
      /* keep last */
    } finally {
      setReady(true);
    }
  }, [backendUserId, accountType]);

  useEffect(() => {
    void load();
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  return { byPro, ready, refresh: load };
}
