"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, Clock, Hammer, MapPin, Paintbrush, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { CategoryTabs } from "@/components/home/category-tabs";
import { FilterChips } from "@/components/home/filter-chips";
import { MechanicHelpFlow } from "@/components/home/mechanic-help-flow";
import { VulcanizerHelpFlow } from "@/components/home/vulcanizer-help-flow";
import { TowHelpFlow } from "@/components/home/tow-help-flow";
import { BatteryHelpFlow } from "@/components/home/battery-help-flow";
import { NeedHelpDialogue } from "@/components/home/need-help-dialogue";
import { RadiusSlider } from "@/components/home/radius-slider";
import { SpecialtyFilterBar } from "@/components/home/specialty-filter-bar";
import { TechCard } from "@/components/technician/tech-card";
import { shouldUseLiveMaps } from "@/lib/google-maps";
import { useOnaGoogleMaps } from "@/lib/google-maps-loader";
import {
  knownPlaceToPick,
  matchKnownPlaces,
  resolveKnownPlace,
  type KnownPlace,
} from "@/lib/known-places";
import { HomeVerifyPanel } from "@/components/auth/verification-gate-banner";
import { useMotoristJobsByPro } from "@/lib/jobs/use-motorist-jobs-by-pro";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";
import { talkBoxAfterTradePick } from "@/components/home/need-help-steps";
import { MAX_TECHNICIANS } from "@/lib/matching";
import { shouldShowHomeVerifyPanel } from "@/lib/verification-gate";

/** Fallback geocode when Places is unavailable (curated places first). */
async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const known = resolveKnownPlace(q);
  if (known) {
    const p = knownPlaceToPick(known);
    return { lat: p.lat, lng: p.lng, label: p.label };
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      q
    )}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    const data = (await res.json()) as {
      lat?: string;
      lon?: string;
      display_name?: string;
    }[];
    const hit = data?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    // Real Nominatim label — do not snap coords to curated POI names
    return {
      lat,
      lng,
      label: hit.display_name || q,
    };
  } catch {
    return null;
  }
}

const PAGE_SIZE = 10;

/**
 * Motorist lower sheet: trade strip + list always visible.
 * Chevron / swipe-left swaps only the top strip for a quiet
 * “Where are they?” Places field — no separate page.
 */
export function HomePanel({
  expanded,
  onExpand,
  onCollapse,
  className,
  footer,
}: {
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  className?: string;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const t = useT();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  /** Only the top strip swaps; list / radius / filters stay */
  const [helpMode, setHelpMode] = useState(false);
  const [helpAddress, setHelpAddress] = useState("");
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpError, setHelpError] = useState<string | null>(null);
  const [helpKnownHits, setHelpKnownHits] = useState<KnownPlace[]>([]);
  const [helpSuggestOpen, setHelpSuggestOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const gestureY = useRef<number | null>(null);
  const helpInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const applyPlaceRef = useRef<
    (label: string, lat: number, lng: number) => void
  >(() => {});

  const {
    visibleTechnicians,
    radiusKm,
    filters,
    specialtyPickerOpen,
    setSelectedTechId,
    selectedTechId,
    locationError,
    retryLocation,
    theme,
    accountType,
    setManualLocation,
    isAuthenticated,
    refreshNearbyPros,
    helpingSomeoneElse,
    setHelpingSomeoneElse,
    userProfile,
    query,
    category,
    setCategory,
    setRadiusKm,
    toggleFilter,
  } = useApp();
  const isLight = theme === "light";
  const [refreshingPros, setRefreshingPros] = useState(false);

  /** Delay the verify panel until the page has fully loaded + painted */
  const [verifyPanelReady, setVerifyPanelReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const show = () => {
      if (cancelled) return;
      // rAF after load → ensure the shell/list has painted first
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        setVerifyPanelReady(true);
      });
    };
    if (document.readyState === "complete") {
      show();
    } else {
      window.addEventListener("load", show, { once: true });
    }
    return () => {
      cancelled = true;
      window.removeEventListener("load", show);
    };
  }, []);

  /** Address confirmed → show trade strip under the field (no chip). */
  const addressConfirmed = helpingSomeoneElse;

  const isMotorist = isAuthenticated && accountType === "motorist";

  /** Repair Pro in professional mode — market shows ONLY their primary trade. */
  const isProMode = accountType === "professional";

  /** Talk box only after they tap a trade. Never for Repair Pro. */
  const tradeChosen = talkBoxAfterTradePick(category);
  const isMechanicFlow = !isProMode && category === "mechanic";
  const isVulcanizerFlow = !isProMode && category === "vulcanizer";
  const isTowFlow = !isProMode && category === "towing";
  const isBatteryFlow = !isProMode && category === "battery";
  const showTalkBox =
    !isProMode &&
    tradeChosen &&
    !isMechanicFlow &&
    !isVulcanizerFlow &&
    !isTowFlow &&
    !isBatteryFlow;

  /**
   * Lower panel only: every home open when phone is still unverified
   * after the 30-day free window from first request. Hidden once phone is verified.
   */
  const showVerifyPanel =
    isMotorist && shouldShowHomeVerifyPanel(userProfile, accountType);
  const verifyMessage = showVerifyPanel
    ? "Verify your phone number to request help"
    : null;

  const liveMaps = shouldUseLiveMaps();
  // Same loader options as every other map surface — never apiKey "disabled"
  // (that crashed re-search after pro decline with different loader options).
  const { isLoaded: mapsLoaded } = useOnaGoogleMaps();
  // Places Autocomplete only when help mode is open (script may already be ready).
  const needPlaces = helpMode && liveMaps;

  const { byPro: jobsByPro } = useMotoristJobsByPro();

  const handleRequest = (tech: Technician) => {
    setSelectedTechId(tech.id);
    router.push(`/request?tech=${tech.id}`);
  };

  const handleOpenJob = (jobId: string) => {
    router.push(`/jobs/${jobId}`);
  };

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [radiusKm, visibleTechnicians.length]);

  useEffect(() => {
    if (!isMotorist && helpMode) setHelpMode(false);
  }, [isMotorist, helpMode]);

  const total = Math.min(visibleTechnicians.length, MAX_TECHNICIANS);
  const list = visibleTechnicians.slice(0, Math.min(visibleCount, total));
  const canShowMore = list.length < total;

  const openHelpSomeone = () => {
    if (!isMotorist) return;
    setHelpMode(true);
    setHelpError(null);
    // Focus after paint so keyboard + Places attach cleanly
    window.setTimeout(() => helpInputRef.current?.focus(), 80);
  };

  const closeHelpMode = () => {
    setHelpMode(false);
    setHelpError(null);
  };

  const applyHelpLocation = useCallback(
    (label: string, lat: number, lng: number) => {
      const coordinates = { lat, lng };
      setHelpingSomeoneElse({ label, coordinates });
      setManualLocation(label, coordinates);
      refreshNearbyPros();
      setHelpAddress(label);
      setHelpError(null);
      // Stay in help mode: address on top, trades reappear below (no chip)
    },
    [setHelpingSomeoneElse, setManualLocation, refreshNearbyPros]
  );

  applyPlaceRef.current = applyHelpLocation;

  // Google Places Autocomplete — worldwide (Uber-style suggestions)
  useEffect(() => {
    if (!helpMode || !mapsLoaded || !liveMaps) return;
    if (!helpInputRef.current) return;
    if (!window.google?.maps?.places) return;

    // Re-bind when reopening help mode
    if (autocompleteRef.current) {
      google.maps.event.clearInstanceListeners(autocompleteRef.current);
      autocompleteRef.current = null;
    }

    try {
      const ac = new google.maps.places.Autocomplete(helpInputRef.current, {
        fields: ["formatted_address", "geometry", "name", "place_id"],
        // Worldwide — no country restriction
        types: ["geocode"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (!loc) {
          setHelpError(t("home.pickSuggestion"));
          return;
        }
        const lat = loc.lat();
        const lng = loc.lng();
        // Google suggestion → real address only (curated POI via typed search suggestions)
        const label =
          place.formatted_address ||
          place.name ||
          `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        applyPlaceRef.current(label, lat, lng);
      });
      autocompleteRef.current = ac;
    } catch {
      /* Places optional — Enter uses Nominatim fallback */
    }

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [helpMode, mapsLoaded, liveMaps, t]);

  const submitHelpAddress = async () => {
    const typed = helpAddress.trim();
    if (!typed) {
      setHelpError(t("home.typeAddress"));
      return;
    }
    setHelpBusy(true);
    setHelpError(null);
    try {
      const geo = await geocodeAddress(typed);
      if (!geo) {
        setHelpError(t("home.couldNotFind"));
        return;
      }
      applyHelpLocation(geo.label, geo.lat, geo.lng);
    } finally {
      setHelpBusy(false);
    }
  };

  /** Clear address → restore my location (C2). Stay in help mode to type again. */
  const clearHelpingSomeone = () => {
    setHelpingSomeoneElse(null);
    setHelpAddress("");
    setHelpError(null);
    retryLocation();
    refreshNearbyPros();
    window.setTimeout(() => helpInputRef.current?.focus(), 60);
  };

  const onSheetWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 0 && !expanded) {
      e.preventDefault();
      onExpand();
      return;
    }
    if (e.deltaY < 0 && expanded) {
      e.preventDefault();
      onCollapse();
    }
  };

  const onPillTouchStart = (e: React.TouchEvent) => {
    gestureY.current = e.touches[0].clientY;
  };

  const onPillTouchMove = (e: React.TouchEvent) => {
    if (gestureY.current == null) return;
    const dy = e.touches[0].clientY - gestureY.current;
    if (!expanded && dy < -14) {
      onExpand();
      gestureY.current = null;
      return;
    }
    if (expanded && dy > 14) {
      onCollapse();
      gestureY.current = null;
    }
  };

  const onPillClick = () => {
    if (expanded) onCollapse();
    else onExpand();
  };

  // Watch data attribute set by AppMenu so we can reposition the dashboard
  // horizontally when the sidebar opens (left portion becomes visible in the
  // right 20% gap).
  useEffect(() => {
    const phone = document.getElementById("ona-phone");
    if (!phone) return;
    const synced = phone.dataset.menuOpen === "true";
    if (synced !== menuOpen) setMenuOpen(synced);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "data-menu-open") {
          setMenuOpen(phone.dataset.menuOpen === "true");
        }
      }
    });
    observer.observe(phone, { attributes: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn("relative z-30 flex min-h-0 flex-col", className)}
      style={{
        transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        // Same split as .om-x-drawer / .om-x-rail — chips land in the capsule tube
        transform: menuOpen
          ? "translateX(var(--om-menu-split, 80%))"
          : "translateX(0%)",
        willChange: "transform",
      }}
    >
      <div onWheel={onSheetWheel} className="shrink-0">
        <div
          role="button"
          tabIndex={0}
          aria-label={
            expanded ? t("home.collapsePanel") : t("home.expandPanel")
          }
          onClick={onPillClick}
          onTouchStart={onPillTouchStart}
          onTouchMove={onPillTouchMove}
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
          className="flex cursor-grab justify-center pb-1.5 pt-2.5 active:cursor-grabbing"
          style={{ touchAction: "pan-y" }}
        >
          <span
            className={cn(
              "h-1.5 w-11 rounded-full",
              isLight
                ? "bg-[#6b7280] shadow-sm ring-1 ring-black/10"
                : "bg-white/40"
            )}
          />
        </div>

        {/*
          Default: trade strip only.
          Help mode: quiet “Where are they?” on top.
          After confirm: address stays + trade strip below (no chip).
          Repair Pro mode: no trade strip — the market is pinned to their
          own trade (server-enforced), so there is nothing to switch between.
        */}
        {helpMode ? (
          <>
            <div
              className="px-3 pb-1 pt-1"
              onTouchStart={(e) => {
                gestureY.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                if (gestureY.current == null) return;
                const dx = e.changedTouches[0].clientX - gestureY.current;
                gestureY.current = null;
                // Swipe right → leave help mode (back to trades-only top)
                if (dx > 40) closeHelpMode();
              }}
              style={{ touchAction: "manipulation" }}
            >
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (addressConfirmed) {
                      clearHelpingSomeone();
                    }
                    closeHelpMode();
                  }}
                  aria-label={t("home.backToTrades")}
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center border-0 bg-transparent p-0",
                    isLight ? "text-slate-600" : "text-white/70"
                  )}
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
                </button>

                <div className="relative min-w-0 flex-1">
                  <MapPin
                    className={cn(
                      "pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2",
                      isLight ? "text-slate-400" : "text-white/40"
                    )}
                    strokeWidth={2}
                  />
                  <input
                    ref={helpInputRef}
                    type="text"
                    value={helpAddress}
                    onChange={(e) => {
                      const next = e.target.value;
                      setHelpAddress(next);
                      setHelpError(null);
                      const hits = matchKnownPlaces(next, 4).map((r) => r.place);
                      setHelpKnownHits(hits);
                      setHelpSuggestOpen(hits.length > 0 && next.trim().length >= 2);
                      // Clearing the field restores my location
                      if (!next.trim() && addressConfirmed) {
                        clearHelpingSomeone();
                      }
                    }}
                    onFocus={() => {
                      const hits = matchKnownPlaces(helpAddress, 4).map(
                        (r) => r.place
                      );
                      setHelpKnownHits(hits);
                      setHelpSuggestOpen(
                        hits.length > 0 && helpAddress.trim().length >= 2
                      );
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setHelpSuggestOpen(false), 180);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setHelpSuggestOpen(false);
                        void submitHelpAddress();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        if (addressConfirmed) clearHelpingSomeone();
                        closeHelpMode();
                      }
                    }}
                    placeholder={t("home.whereAreThey")}
                    autoComplete="off"
                    enterKeyHint="search"
                    aria-label={t("home.whereAreTheyAria")}
                    className={cn(
                      "om-help-where-input h-9 w-full border-0 border-b bg-transparent pl-5 pr-7 text-[13px] font-medium outline-none transition-colors",
                      isLight
                        ? "border-slate-400/50 text-slate-900 placeholder:text-slate-400 focus:border-brand/60"
                        : "border-white/20 text-white placeholder:text-white/40 focus:border-brand/50"
                    )}
                  />
                  {helpSuggestOpen && helpKnownHits.length > 0 ? (
                    <ul
                      className={cn(
                        "absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-44 overflow-y-auto rounded-md border-0",
                        isLight ? "bg-[#c8c9cd]" : "bg-black"
                      )}
                      role="listbox"
                    >
                      {helpKnownHits.map((p) => (
                        <li key={p.id} role="option">
                          <button
                            type="button"
                            className={cn(
                              "flex w-full flex-col items-start border-0 bg-transparent px-2.5 py-2 text-left",
                              isLight
                                ? "hover:bg-[#d4d5db]"
                                : "hover:bg-white/10"
                            )}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const pick = knownPlaceToPick(p);
                              applyHelpLocation(pick.label, pick.lat, pick.lng);
                              setHelpSuggestOpen(false);
                            }}
                          >
                            <span
                              className={cn(
                                "text-[12px] font-bold",
                                isLight ? "text-slate-900" : "text-white"
                              )}
                            >
                              {p.name}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] font-medium",
                                isLight ? "text-slate-600" : "text-white/55"
                              )}
                            >
                              {p.address}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {(helpAddress || helpBusy) && (
                    <button
                      type="button"
                      aria-label={t("home.clearAddress")}
                      disabled={helpBusy}
                      onClick={clearHelpingSomeone}
                      className={cn(
                        "absolute right-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0",
                        isLight ? "text-slate-400" : "text-white/40"
                      )}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {helpError && (
                <p className="mt-1 pl-9 text-[10px] font-medium text-red-500">
                  {helpError}
                </p>
              )}
              {helpBusy && (
                <p
                  className={cn(
                    "mt-1 pl-9 text-[10px]",
                    isLight ? "text-slate-500" : "text-white/45"
                  )}
                >
                  {t("home.findingPlace")}
                </p>
              )}
            </div>

            {/* After address confirm: trade options under the address field */}
            {addressConfirmed && (
              <CategoryTabs
                expanded={expanded}
                onExpand={onExpand}
                onCollapse={onCollapse}
                menuOpen={menuOpen}
              />
            )}
          </>
        ) : !isProMode ? (
          <CategoryTabs
            expanded={expanded}
            onExpand={onExpand}
            onCollapse={onCollapse}
            onSwipeLeft={isMotorist ? openHelpSomeone : undefined}
            onOpenHelp={isMotorist ? openHelpSomeone : undefined}
            menuOpen={menuOpen}
          />
        ) : null}

        {/* Mechanic / Vulcanizer / Tow / Battery: no radius — Repair Pro is found by urgency. */}
        {isProMode ||
        (tradeChosen &&
          !isMechanicFlow &&
          !isVulcanizerFlow &&
          !isTowFlow &&
          !isBatteryFlow) ? (
          <RadiusSlider />
        ) : null}
        {isProMode && specialtyPickerOpen ? <SpecialtyFilterBar /> : null}
        {isProMode ? <FilterChips /> : null}
      </div>

      {locationError && (
        <div
          className="mx-3 mb-1 shrink-0 rounded-md bg-[#FF6B35]/15 px-2.5 py-1.5 text-[11px] text-[#FF6B35]"
          role="status"
        >
          {locationError}{" "}
          <button
            type="button"
            onClick={retryLocation}
            className="font-bold underline"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* Empty state — Repair Pro market only */}
      {isProMode && list.length === 0 && !showVerifyPanel && (
        <div
          className={cn(
            "shrink-0 overflow-hidden rounded-t-lg",
            isLight ? "bg-[#c8c9cd]" : "bg-black"
          )}
          style={{ transform: "translateZ(0)" }}
        >
          <div className="p-4 text-center">
            <p
              className={cn(
                "text-sm font-semibold",
                isLight ? "text-slate-800" : "text-white"
              )}
            >
              {query.trim()
                ? t("search.noResultsFor", { q: query.trim() })
                : filters.availableNow
                  ? t("home.noProsAvailable")
                  : filters.rating45 ||
                      filters.verified ||
                      filters.fastResponse
                    ? t("home.noProsMatch")
                    : t("home.noRepairPros")}
            </p>
            <button
              type="button"
              disabled={refreshingPros}
              onClick={() => {
                setRefreshingPros(true);
                retryLocation();
                window.setTimeout(() => {
                  refreshNearbyPros();
                  setRefreshingPros(false);
                }, 1500);
              }}
              className="mt-2 border-0 bg-transparent text-[12px] font-bold text-brand disabled:opacity-60"
            >
              {refreshingPros ? t("home.refreshing") : t("home.refresh")}
            </button>
          </div>
        </div>
      )}

      {/* Talk box: no scroll. Repair Pro list may scroll. */}
      <div
        className={cn(
          "min-h-0 flex-1 px-3 pb-0",
          showTalkBox || isMechanicFlow || isVulcanizerFlow || isTowFlow || isBatteryFlow
            ? "flex flex-col overflow-hidden"
            : "overflow-y-auto overscroll-contain scrollbar-hide"
        )}
      >
        {showVerifyPanel && verifyPanelReady ? (
          <div className="mb-2 shrink-0">
            <HomeVerifyPanel message={verifyMessage} isLight={isLight} />
          </div>
        ) : null}
        {isMechanicFlow ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <MechanicHelpFlow
              isLight={isLight}
              onExit={() => setCategory("none")}
            />
          </div>
        ) : isVulcanizerFlow ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <VulcanizerHelpFlow
              isLight={isLight}
              onExit={() => setCategory("none")}
            />
          </div>
        ) : isTowFlow ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <TowHelpFlow
              isLight={isLight}
              onExit={() => setCategory("none")}
            />
          </div>
        ) : isBatteryFlow ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <BatteryHelpFlow
              isLight={isLight}
              onExit={() => setCategory("none")}
            />
          </div>
        ) : showTalkBox ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <NeedHelpDialogue isLight={isLight} />
          </div>
        ) : isProMode && list.length > 0 && (
          <div
            className={cn(
              "min-h-full overflow-hidden rounded-t-lg",
              isLight ? "bg-[#d8dce4]/90 backdrop-blur-sm" : "bg-black"
            )}
            style={{ transform: "translateZ(0)" }}
          >
            <p
                className={cn(
                  "px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide",
                  isLight ? "text-slate-600" : "text-white/55"
                )}
              >
                {t("home.nearbyCount", { total })}
              </p>
              {list.map((tech) => (
                <div
                  key={tech.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedTechId(tech.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedTechId(tech.id);
                    }
                  }}
                  className="cursor-pointer outline-none"
                >
                  <TechCard
                    tech={tech}
                    onRequest={handleRequest}
                    selected={selectedTechId === tech.id}
                    activeJob={jobsByPro[tech.id] ?? null}
                    onOpenJob={handleOpenJob}
                  />
                </div>
              ))}

              {canShowMore && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((n) =>
                      Math.min(n + PAGE_SIZE, MAX_TECHNICIANS, total)
                    )
                  }
                  className={cn(
                    "w-full border-0 py-2.5 text-[12px] font-bold",
                    isLight
                      ? "bg-transparent text-slate-700 hover:bg-slate-200/60"
                      : "bg-transparent text-white/80 hover:bg-white/[0.04]"
                  )}
                >
                  {t("home.seeMore", { shown: list.length, total })}
                </button>
              )}

              {!canShowMore && total > PAGE_SIZE && (
                <p
                  className={cn(
                    "py-1.5 text-center text-[10px]",
                    isLight ? "text-slate-400" : "text-white/45"
                  )}
                >
                  {t("home.showingAll", { total, km: radiusKm })}
                </p>
              )}
          </div>
        )}

        {isProMode && !expanded && list.length > 0 && (
          <p
            className={cn(
              "py-2 text-center text-[10px]",
              isLight ? "text-slate-400" : "text-white/45"
            )}
          >
            {t("home.swipeHint")}
          </p>
        )}
      </div>

      {footer}
    </div>
  );
}
