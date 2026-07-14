"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { AppHeader } from "@/components/home/app-header";
import { HomePanel } from "@/components/home/home-panel";
import { SearchBar } from "@/components/home/search-bar";
import { ServiceMap } from "@/components/map/service-map";
import { useAppConfig } from "@/components/app-config-provider";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Map 45% / panel 55% initially.
 * Expand/collapse: flip pill + service category axis only.
 * List scrolls independently and does not move the panel.
 */
export function HomeScreen() {
  const router = useRouter();
  const {
    visibleTechnicians,
    setSelectedTechId,
    selectedTechId,
    retryLocation,
    theme,
  } = useApp();
  const { config } = useAppConfig();
  const isLight = theme === "light";
  const [sheetExpanded, setSheetExpanded] = useState(false);

  if (config.app.maintenanceMode) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-3 px-6 text-center",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <p
          className={cn(
            "text-lg font-bold",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          {config.app.name}
        </p>
        <p className="max-w-xs text-sm text-muted">
          {config.app.maintenanceMessage}
        </p>
      </div>
    );
  }

  // Refresh GPS every time home opens so the live map centers on the user
  useEffect(() => {
    retryLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      visibleTechnicians.length > 0 &&
      !visibleTechnicians.some((t) => t.id === selectedTechId)
    ) {
      setSelectedTechId(visibleTechnicians[0].id);
    }
  }, [visibleTechnicians, selectedTechId, setSelectedTechId]);

  const handleRapidRequest = () => {
    const best =
      visibleTechnicians.find((t) => t.status === "available") ??
      visibleTechnicians[0];
    if (best) {
      setSelectedTechId(best.id);
      router.push(`/request?tech=${best.id}`);
    } else {
      router.push("/request");
    }
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <div
        className={cn("z-20 shrink-0", isLight ? "bg-[#c8c9cd]" : "bg-black")}
      >
        <AppHeader />
        <SearchBar />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Map = 45% when collapsed */}
        <div
          className={cn(
            "relative min-h-0 overflow-hidden transition-all duration-300 ease-out",
            sheetExpanded
              ? "h-0 flex-[0_0_0%] opacity-0 pointer-events-none"
              : "flex-[0_0_45%] opacity-100"
          )}
        >
          <ServiceMap
            technicians={visibleTechnicians
              .filter((t) => t.status !== "offline")
              .slice(0, 8)}
            onSelect={setSelectedTechId}
          />
        </div>

        {/*
          One continuous lower chrome: panel + CTA share the same background
          so the sheet runs under Request Help Now with no gap strip.
        */}
        <div
          className={cn(
            "z-30 flex min-h-0 flex-col",
            sheetExpanded ? "flex-1" : "flex-[0_0_55%]",
            isLight ? "bg-[#c8c9cd]" : "bg-black"
          )}
        >
          <HomePanel
            expanded={sheetExpanded}
            onExpand={() => setSheetExpanded(true)}
            onCollapse={() => setSheetExpanded(false)}
            className="min-h-0 flex-1 bg-transparent"
          />

          <div className="shrink-0 px-3 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleRapidRequest}
              className={cn(
                "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border-0 text-[14px] font-bold transition-colors active:scale-[0.98]",
                isLight
                  ? // Vendor select #c5ccd8, one step darker so it reads on sheet
                    "bg-[#aeb6c4] text-slate-900 hover:bg-[#a4adbc] shadow-[inset_0_0_0_1px_rgba(30,41,59,0.08)]"
                  : // Same wash as dark selected vendor row
                    "bg-white/[0.1] text-white hover:bg-white/[0.14] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
              )}
            >
              <Zap
                className={cn(
                  "h-4 w-4",
                  isLight
                    ? "fill-slate-900 text-slate-900"
                    : "fill-white text-white"
                )}
              />
              Request Help Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
