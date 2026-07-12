"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SearchBar() {
  const { query, setQuery, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div className="shrink-0 px-3 pb-2">
      <label className="relative flex items-center" htmlFor="home-search">
        <span className="sr-only">Search problems, technicians, services</span>
        <Search
          className={cn(
            "pointer-events-none absolute left-3 h-3.5 w-3.5",
            isLight ? "text-slate-400" : "text-white/55"
          )}
          aria-hidden
        />
        <input
          id="home-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search problem, technician, service..."
          autoComplete="off"
          className={cn(
            "h-10 w-full rounded-lg pl-9 pr-10 text-[12px] outline-none focus:ring-2 focus:ring-brand/30",
            isLight
              ? "bg-slate-100 text-slate-900 placeholder:text-slate-400"
              : "matte-metal-inset text-white placeholder:text-white/50"
          )}
        />
        <button
          type="button"
          className={cn(
            "absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-md border-0",
            isLight
              ? "text-slate-500 hover:bg-white"
              : "text-white/70 hover:bg-white/10"
          )}
          aria-label="Filters"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
      </label>
    </div>
  );
}
