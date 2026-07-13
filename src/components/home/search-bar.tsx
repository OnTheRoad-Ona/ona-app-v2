"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Slight gap under location header.
 * Fully selectable text (user-select + stop double-click theme).
 */
export function SearchBar() {
  const { query, setQuery, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div className="shrink-0 px-3 pb-1.5 pt-2">
      <label
        className="relative flex items-center"
        htmlFor="home-search"
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="sr-only">Search</span>
        <Search
          className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#e85a12]"
          aria-hidden
        />
        <input
          id="home-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onDoubleClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Search problem, technician, service..."
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className={cn(
            "search-metal-orange h-9 w-full select-text rounded-sm pl-8 pr-9 text-[12px]",
            "outline-none focus:outline-none focus:ring-0 focus:border-0",
            "[-webkit-user-select:text] [user-select:text]",
            isLight
              ? "bg-[#bebfc4]/95 text-[#1e293b] placeholder:text-[#6b7280]"
              : "bg-black text-white placeholder:text-white/50"
          )}
        />
        <button
          type="button"
          className={cn(
            "absolute right-1 flex h-7 w-7 items-center justify-center rounded-sm border-0",
            isLight
              ? "text-[#9aa3b2] hover:bg-[#d9dde6] hover:text-[#e85a12]"
              : "text-white/45 hover:bg-white/10 hover:text-[#e85a12]"
          )}
          aria-label="Filters"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
      </label>
    </div>
  );
}
