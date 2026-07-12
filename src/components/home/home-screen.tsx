"use client";

import { useEffect } from "react";
import { AppHeader } from "@/components/home/app-header";
import { HomePanel } from "@/components/home/home-panel";
import { SearchBar } from "@/components/home/search-bar";
import { ServiceMap } from "@/components/map/service-map";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Home without bottom tab bar — navigation lives in hamburger menu.
 */
export function HomeScreen() {
  const {
    visibleTechnicians,
    setSelectedTechId,
    selectedTechId,
    retryLocation,
    theme,
  } = useApp();
  const isLight = theme === "light";

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

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        isLight ? "bg-white" : "matte-metal"
      )}
    >
      <div
        className={cn(
          "z-20 shrink-0",
          isLight ? "bg-white" : "bg-transparent"
        )}
      >
        <AppHeader />
        <SearchBar />
      </div>

      <div className="relative min-h-0 flex-[1.05] basis-0">
        <ServiceMap
          technicians={visibleTechnicians
            .filter((t) => t.status !== "offline")
            .slice(0, 8)}
          onSelect={setSelectedTechId}
        />
      </div>

      <HomePanel />
    </div>
  );
}
