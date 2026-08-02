"use client";

/**
 * Customer → Repair Pro: mandatory onboarding in a ~60% bottom panel.
 * Can collapse to a peek bar; cannot fully dismiss until T2 is satisfied
 * (from Customer or completed here). Skips T1/T2 UI when Customer already done.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";
import { ArtisanOnboarding } from "@/components/artisan/artisan-onboarding";
import { getArtisanProfile, saveArtisanProfile } from "@/lib/artisan/local-store";
import {
  applyCustomerTiersToArtisan,
  isCustomerToProDualPath,
  isProSwitchMandatoryOnboardingDone,
  proT2Satisfied,
} from "@/lib/pro-switch-onboarding";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ProOnboardingSheet() {
  const {
    theme,
    isAuthenticated,
    accountType,
    userProfile,
    backendUserId,
    hasMotoristAccount,
    hasProAccount,
    primaryAccountType,
    proOnboardingSheetRequired,
    setProOnboardingSheetRequired,
  } = useApp();
  const isLight = theme === "light";
  const [expanded, setExpanded] = useState(true);
  const [tick, setTick] = useState(0);

  const dual = isCustomerToProDualPath({
    hasMotoristAccount,
    hasProAccount,
    accountType,
    primaryAccountType,
  });

  const open =
    isAuthenticated &&
    accountType === "professional" &&
    dual &&
    proOnboardingSheetRequired;

  // Inherit Customer T1/T2 onto artisan draft so steps are skipped
  useEffect(() => {
    if (!open || !backendUserId) return;
    const uid = backendUserId;
    const art = getArtisanProfile(uid);
    if (!art) return;
    const next = applyCustomerTiersToArtisan(art, userProfile);
    if (
      next.tiers.tier1_phone !== art.tiers.tier1_phone ||
      next.tiers.tier2_govId !== art.tiers.tier2_govId ||
      next.govIdReviewStatus !== art.govIdReviewStatus
    ) {
      saveArtisanProfile(next);
      setTick((n) => n + 1);
    }
  }, [open, backendUserId, userProfile]);

  const recheckDone = useCallback(() => {
    if (!backendUserId) return;
    const art = getArtisanProfile(backendUserId);
    const merged = art
      ? applyCustomerTiersToArtisan(art, userProfile)
      : null;
    if (isProSwitchMandatoryOnboardingDone(userProfile, merged)) {
      setProOnboardingSheetRequired(false);
    }
  }, [backendUserId, userProfile, setProOnboardingSheetRequired]);

  useEffect(() => {
    if (!open) return;
    recheckDone();
    const t = window.setInterval(recheckDone, 1500);
    return () => window.clearInterval(t);
  }, [open, recheckDone, tick]);

  if (!open) return null;

  const t2Done = proT2Satisfied(
    userProfile,
    backendUserId ? getArtisanProfile(backendUserId) : null
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[150] flex flex-col justify-end"
      data-no-theme-toggle
    >
      {/* Soft dim only when expanded */}
      {expanded ? (
        <button
          type="button"
          aria-label="Collapse setup"
          className="pointer-events-auto absolute inset-0 border-0 bg-black/35"
          onClick={() => setExpanded(false)}
        />
      ) : null}

      <div
        className={cn(
          "pointer-events-auto relative flex w-full flex-col overflow-hidden",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
        style={{
          height: expanded ? "60%" : "52px",
          maxHeight: expanded ? "60%" : "52px",
          transition: "height 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          boxShadow: isLight
            ? "0 -4px 24px rgba(0,0,0,0.12)"
            : "0 -4px 24px rgba(0,0,0,0.45)",
        }}
      >
        {/* Grabber — collapse only (cannot dismiss until T2 done) */}
        <button
          type="button"
          className={cn(
            "flex w-full shrink-0 flex-col items-center border-0 bg-transparent px-3 pb-1 pt-2",
            isLight ? "text-slate-700" : "text-white/80"
          )}
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          <span
            className={cn(
              "mb-1 h-1 w-10 rounded-full",
              isLight ? "bg-black/25" : "bg-white/30"
            )}
          />
          <span className="flex w-full items-center justify-between text-[12px] font-bold">
            <span>
              {t2Done
                ? "Repair Pro setup almost done"
                : "Complete Repair Pro setup"}
            </span>
            <ChevronUp
              className={cn(
                "h-4 w-4 transition-transform",
                !expanded && "rotate-180"
              )}
            />
          </span>
          {!expanded ? (
            <span
              className={cn(
                "w-full text-left text-[10px] font-medium",
                isLight ? "text-slate-500" : "text-white/50"
              )}
            >
              Tap to expand — finishes when Tier 2 is complete
            </span>
          ) : null}
        </button>

        {expanded ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <ArtisanOnboarding
              key={`pro-sheet-${tick}`}
              mode="settings"
              embedInSheet
              skipT1IfCustomerDone
              skipT2IfCustomerDone
              onMandatoryComplete={() => {
                recheckDone();
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
