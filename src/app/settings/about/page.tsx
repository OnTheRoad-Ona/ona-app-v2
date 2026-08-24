"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useAppConfig } from "@/components/app-config-provider";
import { ONA_BUILD_ID, ONA_BUILD_LABEL } from "@/lib/build-id";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsAboutPage() {
  const { theme } = useApp();
  const { config } = useAppConfig();
  const isLight = theme === "light";
  const version =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_VERSION) ||
    "0.1.0";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <PageHeader title="About Ona" backHref="/settings" />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <div
          className={cn("rounded-md px-3 py-4 text-center", "bg-transparent")}
        >
          <p
            className={cn(
              "text-[18px] font-black",
              isLight ? "text-slate-900" : "text-white",
            )}
          >
            {config.app.name || "Ona"}
          </p>
          <p
            className={cn(
              "mt-1 text-[12px] font-medium",
              isLight ? "text-slate-600" : "text-white/65",
            )}
          >
            {config.app.tagline}
          </p>
          <p className="mt-3 text-[11px] font-bold text-[#FF6B35]">
            Version {version}
          </p>
          <p
            className={cn(
              "mt-1 text-[10px] font-semibold tabular-nums",
              isLight ? "text-slate-500" : "text-white/45",
            )}
          >
            {ONA_BUILD_LABEL}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[9px] font-mono",
              isLight ? "text-slate-400" : "text-white/30",
            )}
          >
            {ONA_BUILD_ID}
          </p>
        </div>
        <p
          className={cn(
            "px-1 text-center text-[11px] font-medium leading-snug",
            isLight ? "text-slate-600" : "text-white/55",
          )}
        >
          Two-sided repair marketplace · Customers & Repair Pros · Care:{" "}
          {config.app.supportEmail || "witcowavers@gmail.com"}
        </p>
      </div>
    </div>
  );
}
