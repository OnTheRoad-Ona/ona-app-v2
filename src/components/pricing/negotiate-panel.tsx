"use client";

import {
  applyDiscount,
  clampDiscountPercent,
  formatMoney,
  LABOUR_FEE_DISCLAIMER,
  MAX_DISCOUNT_PERCENT,
  type AppCurrency,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Motorist can negotiate up to 50% off the pro’s base labour price.
 */
export function NegotiatePanel({
  baseAmountMajor,
  currency,
  discountPercent,
  onChangeDiscount,
  isLight,
  disabled,
}: {
  baseAmountMajor: number;
  currency: AppCurrency;
  discountPercent: number;
  onChangeDiscount: (pct: number) => void;
  isLight: boolean;
  disabled?: boolean;
}) {
  const d = clampDiscountPercent(discountPercent);
  const agreed = applyDiscount(baseAmountMajor, d);

  return (
    <div
      className={cn(
        "space-y-2 rounded-2xl px-3 py-3",
        isLight ? "bg-black/[0.04]" : "bg-[#1c1c1e]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p
            className={cn(
              "text-[13px] font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Labour fee
          </p>
          <p
            className={cn(
              "mt-0.5 text-[10px] leading-snug",
              isLight ? "text-slate-600" : "text-[#a1a1a6]"
            )}
          >
            {LABOUR_FEE_DISCLAIMER}
          </p>
        </div>
        <p className="text-[15px] font-black tabular-nums text-brand">
          {formatMoney(agreed, currency)}
        </p>
      </div>

      <div className="flex justify-between text-[11px]">
        <span className={isLight ? "text-slate-600" : "text-white/55"}>
          Base {formatMoney(baseAmountMajor, currency)}
        </span>
        <span className={isLight ? "text-slate-600" : "text-white/55"}>
          Your discount {d}% (max {MAX_DISCOUNT_PERCENT}%)
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={MAX_DISCOUNT_PERCENT}
        step={1}
        disabled={disabled}
        value={d}
        onChange={(e) => onChangeDiscount(Number(e.target.value))}
        className="w-full accent-[var(--brand,#e85a12)]"
        aria-label="Negotiate discount percent"
      />

      <div className="flex flex-wrap gap-1.5">
        {[0, 10, 20, 30, 40, 50].map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onChangeDiscount(p)}
            className={cn(
              "rounded-full border-0 px-2.5 py-1 text-[10px] font-bold",
              d === p
                ? "bg-brand text-white"
                : isLight
                  ? "bg-black/8 text-slate-700"
                  : "bg-[#2c2c2e] text-white/75"
            )}
          >
            {p === 0 ? "Full price" : `−${p}%`}
          </button>
        ))}
      </div>
    </div>
  );
}
