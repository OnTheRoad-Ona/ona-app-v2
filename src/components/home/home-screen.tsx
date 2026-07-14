"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/home/app-header";
import { HomePanel } from "@/components/home/home-panel";
import { SearchBar } from "@/components/home/search-bar";
import { ServiceMap } from "@/components/map/service-map";
import { useAppConfig } from "@/components/app-config-provider";
import { useApp } from "@/lib/store";
import { MAX_TECHNICIANS } from "@/lib/matching";
import { cn } from "@/lib/utils";

/**
 * Map 45% / panel 55% initially.
 * Expand/collapse: flip pill + service category axis only.
 */
export function HomeScreen() {
  const {
    visibleTechnicians,
    setSelectedTechId,
    selectedTechId,
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

  // GPS is managed in store (10 min cadence). Avoid forced refresh on every home open.

  useEffect(() => {
    if (
      visibleTechnicians.length > 0 &&
      !visibleTechnicians.some((t) => t.id === selectedTechId)
    ) {
      setSelectedTechId(visibleTechnicians[0].id);
    }
  }, [visibleTechnicians, selectedTechId, setSelectedTechId]);

  const sheetBg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const mapTechs = visibleTechnicians
    .filter((t) => t.status !== "offline")
    .slice(0, Math.min(8, MAX_TECHNICIANS));

  return (
    <div className={cn("flex h-full min-h-0 flex-col", sheetBg)}>
      <div className={cn("z-20 shrink-0", sheetBg)}>
        <AppHeader />
        <SearchBar />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            "om-sheet-spring relative min-h-0 overflow-hidden",
            sheetExpanded
              ? "h-0 flex-[0_0_0%] opacity-0 pointer-events-none"
              : "flex-[0_0_45%] opacity-100"
          )}
        >
          <ServiceMap technicians={mapTechs} onSelect={setSelectedTechId} />
        </div>

        <div
          className={cn(
            "om-sheet-spring z-30 flex min-h-0 flex-col overflow-hidden",
            sheetExpanded ? "flex-1" : "flex-[0_0_55%]",
            // Complete black lower panel on dark toggle only
            isLight ? "bg-[#c8c9cd]" : "bg-black",
            !sheetExpanded &&
              "rounded-t-2xl shadow-[0_-6px_24px_rgba(0,0,0,0.18)]"
          )}
          style={{ touchAction: "pan-y" }}
        >
          <HomePanel
            expanded={sheetExpanded}
            onExpand={() => setSheetExpanded(true)}
            onCollapse={() => setSheetExpanded(false)}
            className="min-h-0 flex-1 bg-transparent pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          />
        </div>
      </div>
    </div>
  );
}
