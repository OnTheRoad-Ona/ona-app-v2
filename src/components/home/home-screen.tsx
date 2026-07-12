"use client";

import { useEffect } from "react";
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
 * Layout:
 * header + search
 * map
 * results sheet
 * bottom bar = Request Help Now (exact slot of old 5-tab nav)
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

      <div className="relative min-h-0 flex-1 basis-0">
        <ServiceMap
          technicians={visibleTechnicians
            .filter((t) => t.status !== "offline")
            .slice(0, 8)}
          onSelect={setSelectedTechId}
        />
      </div>

      <HomePanel />

      {/* Bottom bar — same zone as former 5-tab nav */}
      <div
        className={cn(
          "z-40 shrink-0 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2",
          isLight ? "bg-white" : "matte-metal"
        )}
      >
        <Button
          size="default"
          className="h-12 w-full rounded-lg text-[14px] font-bold"
          onClick={handleRapidRequest}
        >
          <Zap className="h-4 w-4 fill-white" />
          Request Help Now
        </Button>
      </div>
    </div>
  );
}
