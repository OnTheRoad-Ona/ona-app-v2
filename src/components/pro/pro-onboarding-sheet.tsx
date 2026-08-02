"use client";

/**
 * Customer → Repair Pro: mandatory onboarding bottom panel.
 * Swipe up/down like the customer home lower panel (grabber + body).
 * Collapses to a tiny fracture. One tier at a time. No dismiss until Care T2.
 * Mounted only after overlay-gates settle (auth + first paint).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArtisanOnboarding } from "@/components/artisan/artisan-onboarding";
import { getArtisanProfile, saveArtisanProfile } from "@/lib/artisan/local-store";
import {
  applyCustomerTiersToArtisan,
  canAutoExpandProSetup,
  isCustomerToProDualPath,
  isProSwitchMandatoryOnboardingDone,
  proSetupSheetTitle,
  writeProSetupLastExpandAt,
} from "@/lib/pro-switch-onboarding";
import { useApp } from "@/lib/store";
import { useOverlayGatesReady } from "@/lib/use-overlay-gates-ready";
import { cn } from "@/lib/utils";

const EXPAND_EVENT = "ona-pro-setup-expand";
const COLLAPSED_H = 14;
const EXPANDED_H_PCT = 58;
/** Same spring as .om-sheet-spring */
const SHEET_EASE = "0.55s cubic-bezier(0.4, 0, 0.2, 1)";

export function requestProOnboardingSheetExpand() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EXPAND_EVENT));
}

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
  const gatesReady = useOverlayGatesReady();
  const isLight = theme === "light";
  const [expanded, setExpanded] = useState(true);
  const [tick, setTick] = useState(0);
  /** Hide flip pill + sheet while ☰ sidebar is open */
  const [menuOpen, setMenuOpen] = useState(false);
  const gestureY = useRef<number | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);

  const dual = isCustomerToProDualPath({
    hasMotoristAccount,
    hasProAccount,
    accountType,
    primaryAccountType,
  });

  const open =
    gatesReady &&
    isAuthenticated &&
    accountType === "professional" &&
    dual &&
    proOnboardingSheetRequired &&
    !menuOpen;

  // App menu sets #ona-phone[data-menu-open] while drawer is open
  useEffect(() => {
    const phone = document.getElementById("ona-phone");
    if (!phone) return;
    const sync = () => setMenuOpen(phone.dataset.menuOpen === "true");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(phone, { attributes: true, attributeFilter: ["data-menu-open"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!open || !backendUserId) return;
    const art = getArtisanProfile(backendUserId);
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

  // User tapped Continue Verification / Settings — always expand (not throttled)
  useEffect(() => {
    const onExpand = () => {
      setExpanded(true);
      if (backendUserId) writeProSetupLastExpandAt(backendUserId);
    };
    window.addEventListener(EXPAND_EVENT, onExpand);
    return () => window.removeEventListener(EXPAND_EVENT, onExpand);
  }, [backendUserId]);

  // Auto-expand at most once per 30 minutes (pill stays if collapsed)
  useEffect(() => {
    if (!open || !backendUserId) return;
    if (canAutoExpandProSetup(backendUserId)) {
      setExpanded(true);
      writeProSetupLastExpandAt(backendUserId);
    } else {
      setExpanded(false);
    }
  }, [open, backendUserId]);

  const onExpand = useCallback(() => {
    setExpanded(true);
    // Manual grabber expand does not reset the 30m auto timer
  }, []);
  const onCollapse = useCallback(() => setExpanded(false), []);

  /** Wheel: same idea as customer HomePanel */
  const onSheetWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 0 && !expanded) {
      e.preventDefault();
      onExpand();
      return;
    }
    if (e.deltaY < 0 && expanded) {
      // Only collapse when body is scrolled to top (or no body)
      const el = bodyScrollRef.current;
      if (el && el.scrollTop > 4) return;
      e.preventDefault();
      onCollapse();
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    gestureY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (gestureY.current == null) return;
    const dy = e.touches[0].clientY - gestureY.current;
    if (!expanded && dy < -14) {
      onExpand();
      gestureY.current = null;
      return;
    }
    if (expanded && dy > 14) {
      const el = bodyScrollRef.current;
      // Allow body scroll when not at top; collapse only from top / grabber
      const fromGrabber =
        (e.target as HTMLElement | null)?.closest?.("[data-pro-sheet-grabber]") !=
        null;
      if (!fromGrabber && el && el.scrollTop > 4) return;
      onCollapse();
      gestureY.current = null;
    }
  };

  const onTouchEnd = () => {
    gestureY.current = null;
  };

  const onPillClick = () => {
    if (expanded) onCollapse();
    else onExpand();
  };

  if (!open) return null;

  const artisan = backendUserId ? getArtisanProfile(backendUserId) : null;
  const title = proSetupSheetTitle(userProfile, artisan);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[150] flex flex-col justify-end"
      data-no-theme-toggle
    >
      {expanded ? (
        <button
          type="button"
          aria-label="Collapse setup"
          className="pointer-events-auto absolute inset-0 border-0 bg-black/35"
          onClick={onCollapse}
        />
      ) : null}

      <div
        className={cn(
          "om-sheet-spring pointer-events-auto relative flex w-full flex-col overflow-hidden",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
        style={{
          height: expanded ? `${EXPANDED_H_PCT}%` : COLLAPSED_H,
          maxHeight: expanded ? `${EXPANDED_H_PCT}%` : COLLAPSED_H,
          transition: `height ${SHEET_EASE}, max-height ${SHEET_EASE}, border-radius ${SHEET_EASE}`,
          borderTopLeftRadius: expanded ? 14 : 10,
          borderTopRightRadius: expanded ? 14 : 10,
          boxShadow: isLight
            ? "0 -4px 24px rgba(0,0,0,0.12)"
            : "0 -4px 24px rgba(0,0,0,0.45)",
        }}
        onWheel={onSheetWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* Grabber — customer-style pill */}
        <div
          data-pro-sheet-grabber
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={
            expanded ? "Collapse Repair Pro setup" : "Expand Repair Pro setup"
          }
          onClick={onPillClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPillClick();
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onExpand();
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onCollapse();
            }
          }}
          className={cn(
            "flex w-full shrink-0 cursor-grab flex-col items-center active:cursor-grabbing",
            expanded ? "px-3 pb-1 pt-2.5" : "h-full justify-center px-3 py-0"
          )}
          style={{ touchAction: "pan-y" }}
        >
          <span
            className={cn(
              "rounded-full",
              expanded ? "mb-1.5 h-1.5 w-11" : "h-1 w-12",
              isLight
                ? "bg-[#6b7280] shadow-sm ring-1 ring-black/10"
                : "bg-white/40"
            )}
          />
          {expanded ? (
            <span
              className={cn(
                "w-full text-left text-[13px] font-bold leading-tight",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              {title}
            </span>
          ) : null}
        </div>

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
              embedScrollParentRef={bodyScrollRef}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
