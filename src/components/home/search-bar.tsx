"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useAppConfig } from "@/components/app-config-provider";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Search submits on Enter / Done → search results page (theme-aware).
 */
export function SearchBar() {
  const router = useRouter();
  const { query, setQuery, theme } = useApp();
  const { config } = useAppConfig();
  const t = useT();
  const isLight = theme === "light";

  const goSearch = () => {
    const q = query.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="shrink-0 px-3 pb-1.5 pt-2">
      {config.content.homeBanner ? (
        <div className="mb-1.5 rounded-md bg-[#323231] px-2.5 py-1.5 text-center text-[11px] font-semibold text-white">
          {config.content.homeBanner}
        </div>
      ) : null}
      <label
        className="relative flex items-center"
        htmlFor="home-search"
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="sr-only">{t("common.search")}</span>
        <Search
          className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#FF6B35]"
          aria-hidden
        />
        <input
          id="home-search"
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              goSearch();
            }
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder={
            config.content.homeSearchPlaceholder ||
            t("home.searchPlaceholder")
          }
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className={cn(
            "search-metal-orange h-9 w-full select-text rounded-sm pl-8 pr-3 text-[12px]",
            "outline-none focus:outline-none focus:ring-0 focus:border-0",
            "[-webkit-user-select:text] [user-select:text]",
            isLight
              ? "bg-[#bebfc4]/95 text-[#1e293b] placeholder:text-[#6b7280]"
              : "bg-black text-white placeholder:text-white/50"
          )}
        />
      </label>
    </div>
  );
}
