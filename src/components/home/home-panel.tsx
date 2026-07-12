"use client";

import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { CategoryTabs } from "@/components/home/category-tabs";
import { FilterChips } from "@/components/home/filter-chips";
import { RadiusSlider } from "@/components/home/radius-slider";
import { TechCard } from "@/components/technician/tech-card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";

export function HomePanel() {
  const router = useRouter();
  const {
    visibleTechnicians,
    radiusMiles,
    setRadiusMiles,
    setSelectedTechId,
    selectedTechId,
    locationError,
    retryLocation,
    theme,
  } = useApp();
  const isLight = theme === "light";

  const handleRequest = (tech: Technician) => {
    setSelectedTechId(tech.id);
    router.push(`/request?tech=${tech.id}`);
  };

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

  // Show up to 10 in the list window (scroll for more)
  const list = visibleTechnicians.slice(0, 10);

  return (
    <div
      className={cn(
        "relative z-30 flex max-h-[54%] min-h-[48%] flex-col rounded-t-2xl",
        isLight
          ? "bg-white shadow-[0_-4px_20px_rgba(15,23,42,0.08)]"
          : "matte-metal-panel shadow-[0_-4px_20px_rgba(0,0,0,0.25)]"
      )}
    >
      <div className="flex justify-center pb-0.5 pt-1.5" aria-hidden>
        <span
          className={cn(
            "h-1 w-8 rounded-full",
            isLight ? "bg-slate-200" : "bg-white/25"
          )}
        />
      </div>

      <CategoryTabs />
      <RadiusSlider />
      <FilterChips />

      {locationError && (
        <div
          className="mx-3 mb-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900"
          role="status"
        >
          {locationError}{" "}
          <button
            type="button"
            onClick={retryLocation}
            className="font-bold underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-16 scrollbar-hide">
        {list.length === 0 ? (
          <div
            className={cn(
              "rounded-lg p-4 text-center",
              isLight ? "bg-slate-50" : "matte-metal-inset"
            )}
          >
            <p
              className={cn(
                "text-sm font-semibold",
                isLight ? "text-slate-800" : "text-white"
              )}
            >
              No technicians nearby
            </p>
            <p
              className={cn(
                "mt-1 text-[12px]",
                isLight ? "text-slate-500" : "text-white/75"
              )}
            >
              Nothing within {radiusMiles} miles. Drag the radius higher.
            </p>
            <button
              type="button"
              onClick={() => setRadiusMiles(50)}
              className="mt-2 text-[12px] font-bold text-brand"
            >
              Set 50 miles
            </button>
          </div>
        ) : (
          list.map((tech) => (
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
              className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-lg"
            >
              <TechCard
                tech={tech}
                onRequest={handleRequest}
                selected={selectedTechId === tech.id}
                compact
              />
            </div>
          ))
        )}
        {visibleTechnicians.length > 10 && (
          <p
            className={cn(
              "py-1 text-center text-[10px]",
              isLight ? "text-slate-400" : "text-white/50"
            )}
          >
            Showing 10 of {visibleTechnicians.length} — scroll radius or filters
          </p>
        )}
      </div>

      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 px-3 pb-2.5 pt-6",
          isLight
            ? "bg-gradient-to-t from-white via-white to-transparent"
            : "bg-gradient-to-t from-[var(--metal-face)] via-[var(--metal-face)] to-transparent"
        )}
      >
        <Button
          size="default"
          className="h-11 w-full rounded-lg text-[14px] font-bold"
          onClick={handleRapidRequest}
        >
          <Zap className="h-4 w-4 fill-white" />
          Request Help Now
        </Button>
      </div>
    </div>
  );
}
