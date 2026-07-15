"use client";

import { PRO_SERVICE_LABELS, PRO_TRADE_OPTIONS } from "@/lib/services";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SkillsChips({
  selected,
  isLight,
  editable,
  onToggle,
}: {
  selected: ProService[];
  isLight: boolean;
  editable?: boolean;
  onToggle?: (s: ProService) => void;
}) {
  const set = new Set(selected);
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRO_TRADE_OPTIONS.map(({ id, label }) => {
        const on = set.has(id);
        if (!editable && !on) return null;
        return (
          <button
            key={id}
            type="button"
            disabled={!editable}
            onClick={() => onToggle?.(id)}
            className={cn(
              "rounded-full border-0 px-2.5 py-1 text-[11px] font-bold transition-colors",
              on
                ? "bg-brand text-white"
                : isLight
                  ? "bg-black/8 text-slate-700"
                  : "bg-[#2c2c2e] text-white/75",
              !editable && "cursor-default"
            )}
          >
            {label}
          </button>
        );
      })}
      {!editable && selected.length === 0 && (
        <span
          className={cn(
            "text-[12px]",
            isLight ? "text-slate-500" : "text-[#a1a1a6]"
          )}
        >
          No skills listed
        </span>
      )}
    </div>
  );
}

export function skillLabels(services: ProService[]): string[] {
  return services.map((s) => PRO_SERVICE_LABELS[s] ?? s);
}
