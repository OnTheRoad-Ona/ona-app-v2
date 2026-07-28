"use client";

import { PRO_SERVICE_LABELS } from "@/lib/services";
import {
  currencySymbol,
  detectCurrency,
  formatMoney,
  labourFeeDisclaimerForTrade,
  parsePriceInput,
  type AppCurrency,
} from "@/lib/pricing";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Repair Pro labour price book — only for selected skills.
 * Spare parts never included.
 */
export function ServicePriceEditor({
  skills,
  prices,
  currency,
  countryName,
  isLight,
  editing,
  onChangePrice,
  onChangeCurrency,
}: {
  skills: ProService[];
  prices: Partial<Record<ProService, number | string>>;
  currency: AppCurrency;
  countryName?: string | null;
  isLight: boolean;
  editing: boolean;
  onChangePrice: (service: ProService, major: number | null) => void;
  onChangeCurrency?: (c: AppCurrency) => void;
}) {
  const auto = detectCurrency({ countryName });
  const cur = currency || auto;
  const sym = currencySymbol(cur);

  const field = isLight
    ? "h-10 w-full max-w-[140px] border-0 border-b border-black/15 bg-transparent px-0 text-right text-[13px] font-semibold text-slate-900 outline-none"
    : "h-10 w-full max-w-[140px] rounded-xl border-0 bg-[#2c2c2e] px-3 text-right text-[13px] font-semibold text-white outline-none";

  if (skills.length === 0) {
    return (
      <p
        className={cn(
          "text-[12px]",
          isLight ? "text-slate-600" : "text-[#a1a1a6]"
        )}
      >
        Select skills first, then set labour prices.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <p
        className={cn(
          "text-[11px] leading-snug",
          isLight ? "text-slate-600" : "text-[#a1a1a6]"
        )}
      >
        {labourFeeDisclaimerForTrade(skills[0])}
      </p>

      {editing && onChangeCurrency && (
        <div className="flex gap-1.5">
          {(["NGN", "USD"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChangeCurrency(c)}
              className={cn(
                "rounded-full border-0 px-3 py-1 text-[11px] font-bold",
                cur === c
                  ? "bg-brand text-white"
                  : isLight
                    ? "bg-black/8 text-slate-700"
                    : "bg-[#2c2c2e] text-white/75"
              )}
            >
              {c === "NGN" ? "₦ NGN" : "$ USD"}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {skills.map((s) => {
          const raw = prices[s];
          const major = parsePriceInput(raw ?? null);
          return (
            <li
              key={s}
              className="flex items-center justify-between gap-2 text-[12px]"
            >
              <span
                className={cn(
                  "min-w-0 flex-1 font-semibold",
                  isLight ? "text-slate-900" : "text-white"
                )}
              >
                {PRO_SERVICE_LABELS[s] ?? s}
              </span>
              {editing ? (
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      "text-[12px] font-bold",
                      isLight ? "text-slate-600" : "text-white/60"
                    )}
                  >
                    {sym}
                  </span>
                  <input
                    inputMode="decimal"
                    className={field}
                    placeholder="0"
                    value={raw === undefined || raw === null ? "" : String(raw)}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      if (!v) {
                        onChangePrice(s, null);
                        return;
                      }
                      const n = parsePriceInput(v);
                      onChangePrice(s, n);
                    }}
                  />
                </div>
              ) : (
                <span
                  className={cn(
                    "font-bold",
                    major != null
                      ? isLight
                        ? "text-slate-900"
                        : "text-white"
                      : isLight
                        ? "text-slate-500"
                        : "text-white/50"
                  )}
                >
                  {formatMoney(major, cur)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
