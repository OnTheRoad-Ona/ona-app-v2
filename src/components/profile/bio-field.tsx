"use client";

import { BIO_MAX } from "@/lib/profile-system";
import { cn } from "@/lib/utils";

export function BioField({
  value,
  onChange,
  isLight,
  disabled,
  placeholder = "Tell motorists about your work…",
}: {
  value: string;
  onChange?: (v: string) => void;
  isLight: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const len = value.length;
  const over = len > BIO_MAX;
  return (
    <div>
      <textarea
        value={value}
        disabled={disabled}
        maxLength={BIO_MAX}
        rows={3}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value.slice(0, BIO_MAX))}
        className={cn(
          "w-full resize-none border-0 px-3 py-2.5 text-[13px] font-medium outline-none",
          isLight
            ? "rounded-none border-b border-black/15 bg-transparent text-slate-900 placeholder:text-slate-400"
            : "rounded-xl bg-[#2c2c2e] text-white placeholder:text-white/35"
        )}
      />
      <p
        className={cn(
          "mt-1 text-right text-[10px] font-semibold tabular-nums",
          over
            ? "text-red-500"
            : isLight
              ? "text-slate-500"
              : "text-[#a1a1a6]"
        )}
      >
        {Math.min(len, BIO_MAX)}/{BIO_MAX}
      </p>
    </div>
  );
}
