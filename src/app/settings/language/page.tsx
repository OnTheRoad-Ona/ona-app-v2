"use client";

import { Check } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { LOCALES, useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Full-page language picker — switches app UI strings.
 */
export default function SettingsLanguagePage() {
  const { theme } = useApp();
  const { locale, setLocale, t } = useI18n();
  const isLight = theme === "light";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title={t("language.title")}
        subtitle={t("language.subtitle")}
        backHref="/settings"
      />

      <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <p
          className={cn(
            "mb-3 px-1 text-[12px] font-medium leading-snug",
            isLight ? "text-slate-600" : "text-white/65"
          )}
        >
          {t("language.hint")}
        </p>

        <ul
          className={cn(
            "overflow-hidden rounded-md",
            isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
          )}
          role="listbox"
          aria-label={t("language.title")}
        >
          {LOCALES.map((lang, i) => {
            const selected = locale === lang.code;
            return (
              <li key={lang.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => setLocale(lang.code)}
                  className={cn(
                    "flex w-full items-center gap-3 border-0 px-3 py-3 text-left transition-colors",
                    isLight
                      ? "bg-transparent hover:bg-black/[0.04]"
                      : "bg-transparent hover:bg-white/[0.04]"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[14px] font-semibold",
                        isLight ? "text-slate-900" : "text-white"
                      )}
                    >
                      {lang.nativeName}
                    </span>
                    <span
                      className={cn(
                        "block text-[11px] font-medium",
                        isLight ? "text-slate-600" : "text-white/65"
                      )}
                    >
                      {lang.name}
                      {selected ? ` · ${t("language.current")}` : ""}
                    </span>
                  </span>
                  {selected ? (
                    <Check
                      className="h-5 w-5 shrink-0"
                      style={{ color: "#FF6B35" }}
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  ) : (
                    <span
                      className={cn(
                        "h-5 w-5 shrink-0 rounded-full border-2",
                        isLight ? "border-black/20" : "border-white/25"
                      )}
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
