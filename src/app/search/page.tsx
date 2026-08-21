"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { TechCard } from "@/components/technician/tech-card";
import { useMotoristJobsByPro } from "@/lib/jobs/use-motorist-jobs-by-pro";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function SearchResultsBody() {
  const router = useRouter();
  const params = useSearchParams();
  const qParam = params.get("q") ?? "";
  const t = useT();
  const {
    query,
    setQuery,
    visibleTechnicians,
    setSelectedTechId,
    selectedTechId,
    theme,
    radiusKm,
  } = useApp();
  const isLight = theme === "light";
  const { byPro: jobsByPro } = useMotoristJobsByPro();

  useEffect(() => {
    if (qParam && qParam !== query) setQuery(qParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam]);

  const list = visibleTechnicians;

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title={t("search.title")} subtitle={t("search.subtitle")} />

      <div className="px-3 pb-2">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-brand" />
          <input
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const q = query.trim();
                router.replace(
                  q ? `/search?q=${encodeURIComponent(q)}` : "/search"
                );
              }
            }}
            placeholder={t("search.placeholder")}
            className={cn(
              "h-10 w-full rounded-md border-0 pl-8 pr-3 text-[13px] font-medium outline-none",
              isLight
                ? "bg-[#bebfc4] text-slate-900 placeholder:text-slate-500"
                : "bg-neutral-950 text-white placeholder:text-white/45"
            )}
          />
        </label>
        <p
          className={cn(
            "mt-1.5 text-[11px]",
            isLight ? "text-slate-500" : "text-white/55"
          )}
        >
          {list.length === 1
            ? t("search.withinKm", { km: radiusKm, count: list.length })
            : t("search.withinKmPlural", { km: radiusKm, count: list.length })}
          {query.trim() ? t("search.forQuery", { q: query.trim() }) : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        {list.length === 0 ? (
          <div className="px-4 py-8 text-center bg-transparent">
            <p
              className={cn(
                "text-sm font-semibold",
                isLight ? "text-slate-800" : "text-white"
              )}
            >
              {query.trim()
                ? t("search.noResultsFor", { q: query.trim() })
                : t("search.noMatchesNearby")}
            </p>
            <p
              className={cn(
                "mt-1 text-[12px]",
                isLight ? "text-slate-500" : "text-white/60"
              )}
            >
              {query.trim() ? t("search.tryAnother") : t("search.tryBrowse")}
            </p>
            <Link
              href="/"
              className="mt-3 inline-block text-[12px] font-bold text-brand"
            >
              {t("search.backHome")}
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden bg-transparent">
            {list.map((tech) => (
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
              >
                <TechCard
                  tech={tech}
                  selected={selectedTechId === tech.id}
                  activeJob={jobsByPro[tech.id] ?? null}
                  onOpenJob={(jobId) => router.push(`/jobs/${jobId}`)}
                  onRequest={(t) => {
                    setSelectedTechId(t.id);
                    router.push(`/?trade=${t.serviceType}`);
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#c8c9cd] text-sm text-slate-600">
          Loading search…
        </div>
      }
    >
      <SearchResultsBody />
    </Suspense>
  );
}
