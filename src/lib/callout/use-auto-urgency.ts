"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CalloutUrgencyKind } from "@/lib/callout/urgency";
import { autoCalloutUrgency } from "@/lib/callout/urgency";

/** Nearest visible pro's distance (km) among the given trades, or null. */
export function nearestProDistanceKm(
  techs: { serviceType: string; distanceKm: number }[],
  trades: readonly string[]
): number | null {
  let best: number | null = null;
  for (const t of techs) {
    if (!trades.includes(t.serviceType)) continue;
    if (Number.isFinite(t.distanceKm) && (best === null || t.distanceKm < best)) {
      best = t.distanceKm;
    }
  }
  return best;
}

/**
 * Urgency state that auto-selects the best chip (Night / Remote / Emergency /
 * Normal) so the customer doesn't have to choose it. The choice is locked the
 * moment the customer taps a chip or a saved session restores a value.
 */
export function useAutoCalloutUrgency(opts: {
  /** Diagnosis says it's not safe to drive / use. */
  unsafe?: boolean;
  /** Distance to the nearest matched pro (km). */
  distanceKm?: number | null;
}) {
  const [urgency, setUrgencyState] = useState<CalloutUrgencyKind>("normal");
  const chosenRef = useRef(false);
  const auto = useMemo(
    () =>
      autoCalloutUrgency({
        unsafe: opts.unsafe,
        distanceKm: opts.distanceKm,
      }),
    [opts.unsafe, opts.distanceKm]
  );

  useEffect(() => {
    if (chosenRef.current) return;
    setUrgencyState(auto);
  }, [auto]);

  const setUrgency = useCallback((k: CalloutUrgencyKind) => {
    chosenRef.current = true;
    setUrgencyState(k);
  }, []);

  /**
   * Restore a saved session value without locking auto-selection. Only a
   * non-default choice (anything but "normal") is treated as deliberate and
   * restored + locked; a saved "normal" is left alone so the auto value
   * (e.g. Night) stays in place and can still re-evaluate from the diagnosis.
   */
  const restoreUrgency = useCallback((k: CalloutUrgencyKind) => {
    if (k === "normal") return;
    chosenRef.current = true;
    setUrgencyState(k);
  }, []);

  /** Re-arm auto-selection (used when the flow resets, e.g. trade change). */
  const resetUrgency = useCallback((k: CalloutUrgencyKind = "normal") => {
    chosenRef.current = false;
    setUrgencyState(k);
  }, []);

  return { urgency, setUrgency, restoreUrgency, resetUrgency };
}