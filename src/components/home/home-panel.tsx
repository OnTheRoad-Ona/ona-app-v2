"use client";

import { useRouter } from "next/navigation";
import { CategoryTabs } from "@/components/home/category-tabs";
import { FilterChips } from "@/components/home/filter-chips";
import { RadiusSlider } from "@/components/home/radius-slider";
import { TechCard } from "@/components/technician/tech-card";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Results sheet only — CTA sits in HomeScreen bottom bar
 * (where bottom nav used to be).
 */
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

  const list = visibleTechnicians.slice(0, 10);

  return (
    <div
      className={cn(
        "relative z-30 flex min-h-0 flex-[1.15] flex-col rounded-t-2xl",
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

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-2 scrollbar-hide">
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
              className="cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <TechCard
                tech={tech}
                onRequest={handleRequest}
                selected={selectedTechId === tech.id}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
