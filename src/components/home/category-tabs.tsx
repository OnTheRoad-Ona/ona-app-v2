"use client";

import { Car, CircleDot, Grid2x2, Wrench } from "lucide-react";
import { useApp } from "@/lib/store";
import type { ServiceCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const tabs: {
  id: ServiceCategory;
  label: string;
  icon: typeof Wrench;
}[] = [
  { id: "mechanic", label: "Mechanic", icon: Wrench },
  { id: "vulcanizer", label: "Vulcanizer", icon: CircleDot },
  { id: "towing", label: "Tow", icon: Car },
  { id: "all", label: "All", icon: Grid2x2 },
];

/** Full-size segmented tabs — same footprint as original design */
export function CategoryTabs() {
  const { category, setCategory, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div className="px-4 pt-1 pb-2">
      <div
        role="tablist"
        aria-label="Service category"
        className={cn(
          "grid grid-cols-4 gap-1.5 rounded-xl p-1",
          isLight ? "bg-slate-100" : "matte-metal-inset"
        )}
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = category === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(id)}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2.5 text-[10px] font-semibold border-0 transition-colors",
                active
                  ? "metallic-orange text-white"
                  : isLight
                    ? "bg-transparent text-slate-500 hover:bg-white hover:text-slate-800"
                    : "bg-transparent text-white/75 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon
                className="h-[18px] w-[18px] shrink-0"
                strokeWidth={active ? 2.4 : 2}
              />
              <span className="truncate leading-none tracking-tight">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
