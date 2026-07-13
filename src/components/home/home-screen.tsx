"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { AppHeader } from "@/components/home/app-header";
import { HomePanel } from "@/components/home/home-panel";
import { SearchBar } from "@/components/home/search-bar";
import { ServiceMap } from "@/components/map/service-map";
import { Button } from "@/components/ui/button";
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
  const isLight = theme === "light";
  const [sheetExpanded, setSheetExpanded] = useState(false);

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

        {/* Panel = 55% collapsed; 100% of this area when expanded */}
        <HomePanel
          expanded={sheetExpanded}
          onExpand={() => setSheetExpanded(true)}
          onCollapse={() => setSheetExpanded(false)}
          className={
            sheetExpanded ? "flex-1" : "flex-[0_0_55%] min-h-0"
          }
        />
      </div>

      {/* Original button size; moderate side + bottom inset */}
      <div
        className={cn(
          "z-40 shrink-0 px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <Button
          size="default"
          className="h-11 w-full rounded-md text-[14px] font-bold"
          onClick={handleRapidRequest}
        >
          <Zap className="h-4 w-4 fill-white" />
          Request Help Now
        </Button>
      </div>
    </div>
  );
}
