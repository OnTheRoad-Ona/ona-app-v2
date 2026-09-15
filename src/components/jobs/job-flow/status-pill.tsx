"use client";

import { cn } from "@/lib/utils";

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "copper" | "neutral";
}) {
  const cls =
    tone === "amber"
      ? "bg-[#FF6B35]/150/20 text-[#FF6B35] dark:text-[#FF6B35]"
      : tone === "copper"
        ? "bg-[#FF6B35]/20 text-[#FF6B35]"
        : "bg-black/10 text-slate-700 dark:bg-white/10 dark:text-white/70";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide",
        cls,
      )}
    >
      {label}
    </span>
  );
}
