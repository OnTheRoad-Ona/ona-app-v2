"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  SettingsField,
  SettingsSaveBar,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import { PRO_SERVICE_LABELS, isProService } from "@/lib/pro-service-id";
import { MIN_OFFER_AMOUNT_MAJOR } from "@/lib/jobs/constants";
import { formatMoney } from "@/lib/pricing";
import type { ProService } from "@/lib/types";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsPricingPage() {
  const { theme, accountType, userProfile, updateUserProfile } = useApp();
  const isLight = theme === "light";
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const skills = (userProfile?.services || []).filter(isProService);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const s of skills) {
      const v = userProfile?.servicePrices?.[s];
      next[s] = v != null && v !== "" ? String(v) : "";
    }
    setPrices(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.services, userProfile?.servicePrices]);

  if (accountType !== "professional") {
    return (
      <div className={cn("flex h-full flex-col", isLight ? "bg-[#c8c9cd]" : "bg-black")}>
        <PageHeader title="Pricing" backHref="/settings" />
        <p className="px-4 text-[13px]">Repair Pros only.</p>
      </div>
    );
  }

  const save = () => {
    setErr(null);
    setMsg(null);
    const servicePrices: Partial<Record<ProService, number>> = {
      ...(userProfile?.servicePrices as Partial<Record<ProService, number>>),
    };
    for (const s of skills) {
      const raw = (prices[s] || "").trim();
      if (!raw) {
        delete servicePrices[s];
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < MIN_OFFER_AMOUNT_MAJOR) {
        setErr(
          `${PRO_SERVICE_LABELS[s]}: minimum labour price is ${formatMoney(MIN_OFFER_AMOUNT_MAJOR)} so payouts can complete.`
        );
        return;
      }
      servicePrices[s] = n;
    }
    const e = updateUserProfile({ servicePrices });
    if (e) setErr(e);
    else setMsg("Labour prices saved. Parts are never included.");
  };

  const currency = userProfile?.pricingCurrency || "NGN";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title="Pricing & services"
        subtitle={`Labour only · ${currency}`}
        backHref="/settings"
      />
      <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <p
          className={cn(
            "mb-3 text-[12px] font-medium leading-snug",
            isLight ? "text-slate-600" : "text-white/65"
          )}
        >
          No assumed defaults. Leave blank if you quote on request. Skill list
          comes from your registration (edit via verification / profile flow).
        </p>
        <div
          className={cn(
            "overflow-hidden rounded-md",
            "bg-transparent"
          )}
        >
          {skills.length === 0 ? (
            <p className="px-3 py-4 text-[12px] font-medium text-muted">
              No skills on file yet.
            </p>
          ) : (
            skills.map((s) => (
              <SettingsField
                key={s}
                label={`${PRO_SERVICE_LABELS[s]} labour (${currency})`}
                isLight={isLight}
              >
                <input
                  className={settingsInputClass(isLight)}
                  inputMode="decimal"
                  value={prices[s] ?? ""}
                  onChange={(e) =>
                    setPrices((p) => ({
                      ...p,
                      [s]: e.target.value.replace(/[^\d.]/g, ""),
                    }))
                  }
                  placeholder="Leave empty for quote on request"
                />
              </SettingsField>
            ))
          )}
          <SettingsSaveBar
            isLight={isLight}
            msg={msg}
            err={err}
            onSave={save}
          />
        </div>
      </div>
    </div>
  );
}
