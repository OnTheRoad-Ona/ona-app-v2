"use client";

import { cn } from "@/lib/utils";
import { profileTheme } from "@/lib/profile-system";

interface SecurityFieldProps {
  isLight: boolean;
  label: string;
  value: string;
  badge?: string;
  onChangeClick: () => void;
  disabled?: boolean;
}

export function SecurityField({
  isLight,
  label,
  value,
  badge,
  onChangeClick,
  disabled,
}: SecurityFieldProps) {
  const t = profileTheme(isLight);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className={cn("text-[11px] font-semibold", t.muted)}>{label}</p>
        <p className={cn("truncate text-[13px] font-semibold", t.ink)}>{value}</p>
        {badge && <p className={cn("text-[10px]", isLight ? "text-slate-900" : "text-white")}>{badge}</p>}
      </div>
      <button
        type="button"
        onClick={onChangeClick}
        disabled={disabled}
        className={cn(
          "shrink-0 rounded-lg border-0 px-3 py-1.5 text-[11px] font-bold transition-opacity",
          disabled && "opacity-40",
          isLight
            ? "bg-black/8 text-slate-900"
            : "bg-[#2c2c2e] text-white",
        )}
      >
        Change
      </button>
    </div>
  );
}
