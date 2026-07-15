"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  Navigation,
  Star,
} from "lucide-react";
import {
  VerificationBlockedPanel,
  VerificationWarningBanner,
} from "@/components/auth/verification-gate-banner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { reviewsForPro } from "@/lib/demo-reviews";
import { NegotiatePanel } from "@/components/pricing/negotiate-panel";
import { defaultBackHref, navigateBack } from "@/lib/navigation";
import {
  applyDiscount,
  detectCurrency,
  formatMoney,
  getBaseLabourPrice,
  LABOUR_FEE_DISCLAIMER,
  PLATFORM_COMMISSION_PERCENT,
  type AppCurrency,
} from "@/lib/pricing";
import { problemsForService } from "@/lib/request-problems";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { publicSkillRows } from "@/lib/skill-questions";
import { useApp } from "@/lib/store";
import { cn, formatDistance, formatEta } from "@/lib/utils";

function RequestFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const techId = params.get("tech");
  const {
    technicians,
    visibleTechnicians,
    bookRequest,
    setSelectedTechId,
    theme,
    ensureChatForRequest,
    helpingSomeoneElse,
    helpingSomeoneLabel,
    location,
    userProfile,
  } = useApp();
  const isLight = theme === "light";

  const tech = useMemo(() => {
    if (techId) return technicians.find((t) => t.id === techId);
    return (
      visibleTechnicians.find((t) => t.status === "available") ??
      visibleTechnicians[0]
    );
  }, [techId, technicians, visibleTechnicians]);

  const problems = useMemo(
    () => problemsForService(tech?.serviceType),
    [tech?.serviceType]
  );

  const [problem, setProblem] = useState(problems[0] ?? "Other roadside help");
  const [step, setStep] = useState<"confirm" | "done">("confirm");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [payBusy, setPayBusy] = useState(false);
  const [payNote, setPayNote] = useState<string | null>(null);

  useEffect(() => {
    setProblem(problems[0] ?? "Other roadside help");
  }, [problems]);

  const allReviews = useMemo(
    () => (tech ? reviewsForPro(tech.id, 12) : []),
    [tech]
  );
  const visibleReviews = showAllReviews
    ? allReviews
    : allReviews.slice(0, 5);

  const skillRows = tech
    ? publicSkillRows(tech.serviceType, tech.skillAnswers)
    : [];

  const sheet = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";

  if (!tech) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-3 p-6",
          sheet
        )}
      >
        <p className={cn("font-semibold", ink)}>No technician available</p>
        <p className={cn("text-center text-sm", muted)}>
          Expand search radius or try another category.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-2 rounded-lg border-0 bg-[#323231] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const skillLabel =
    PRO_SERVICE_LABELS[tech.serviceType] ?? tech.roleLabel ?? "Repair Pro";
  const photo =
    tech.photo && tech.photo.trim() ? tech.photo.trim() : DEFAULT_VENDOR_PHOTO;

  const currency: AppCurrency =
    tech.pricingCurrency ||
    detectCurrency({
      countryName: tech.servedCountry || userProfile?.servedCountry,
    });
  const baseLabour = getBaseLabourPrice(
    tech.servicePrices,
    tech.serviceType
  );
  const hasPrice = baseLabour != null && baseLabour > 0;
  const agreedLabour = hasPrice
    ? applyDiscount(baseLabour, discountPercent)
    : null;

  const submit = async () => {
    setSelectedTechId(tech.id);
    setBlocked(null);
    setPayNote(null);

    if (!hasPrice || baseLabour == null) {
      setBlocked(
        "This Repair Pro has no labour price set. Quote on request — they must set a price on their profile before you can pay and connect."
      );
      return;
    }

    const negotiationStatus =
      discountPercent > 0 ? ("pending_pro" as const) : ("accepted" as const);

    const result = bookRequest(tech, problem, {
      labourBaseMajor: baseLabour,
      labourAgreedMajor: agreedLabour ?? baseLabour,
      discountPercent,
      pricingCurrency: currency,
      negotiationStatus,
    });
    if (!result.ok) {
      setBlocked(result.message);
      return;
    }
    if (result.warning) setWarning(result.warning);
    const rid = result.request?.id ?? null;
    setRequestId(rid);
    if (result.request) ensureChatForRequest(result.request);

    // Full price → initiate escrow immediately. Discount → wait for pro accept first.
    if (discountPercent === 0 && rid) {
      setPayBusy(true);
      try {
        const motoristId = userProfile?.identityId || "motorist-local";
        const res = await fetch("/api/payments/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: rid,
            motoristId,
            repairProId: tech.id,
            serviceType: tech.serviceType,
            email: userProfile?.email || "motorist@ogamecho.app",
            baseAmountMajor: baseLabour,
            discountPercent: 0,
            currency,
            countryName: tech.servedCountry || userProfile?.servedCountry,
          }),
        });
        const json = await res.json();
        if (json?.ok && json.data?.authorizationUrl) {
          window.location.href = json.data.authorizationUrl as string;
          return;
        }
        setPayNote(
          json?.error?.message ||
            "Payment link unavailable — request saved; complete payment from Track."
        );
      } catch {
        setPayNote("Could not start payment. Request saved — retry from Track.");
      } finally {
        setPayBusy(false);
      }
    } else if (discountPercent > 0) {
      setPayNote(
        `Discount offer −${discountPercent}% sent. After the Repair Pro accepts, you’ll pay the agreed labour fee into escrow.`
      );
    }

    setStep("done");
  };

  if (step === "done") {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center px-6 text-center",
          sheet
        )}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </div>
        <h1 className={cn("mt-4 text-xl font-bold", ink)}>Request sent</h1>
        <p className={cn("mt-2 max-w-xs text-sm leading-snug", muted)}>
          Waiting for <strong className={ink}>{tech.name}</strong> to accept.
          You&apos;ll get a popup, chat, and live trip tracking once they do.
        </p>
        {agreedLabour != null && (
          <p className="mt-2 text-[13px] font-bold text-brand">
            Labour fee {formatMoney(agreedLabour, currency)}
            {discountPercent > 0 ? ` (−${discountPercent}%)` : ""} · escrow
          </p>
        )}
        {payNote && (
          <p className={cn("mt-2 max-w-sm text-[12px] font-medium", muted)}>
            {payNote}
          </p>
        )}
        {helpingSomeoneElse && (
          <p className="mt-2 text-[12px] font-semibold text-brand">
            Booking for someone else · {helpingSomeoneLabel || location.label}
          </p>
        )}
        {warning && (
          <div className="mt-4 w-full max-w-sm text-left">
            <VerificationWarningBanner message={warning} isLight={isLight} />
          </div>
        )}
        <div className="mt-6 flex w-full max-w-sm flex-col gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(
                requestId ? `/requests/track?id=${requestId}` : "/requests"
              )
            }
            className="w-full rounded-lg border-0 bg-[#323231] py-3 text-sm font-semibold text-white"
          >
            Track request
          </button>
          <button
            type="button"
            onClick={() => router.push("/messages")}
            className={cn(
              "w-full rounded-lg border-0 py-3 text-sm font-semibold",
              isLight
                ? "bg-transparent text-slate-700"
                : "bg-transparent text-white/80"
            )}
          >
            Open messages
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", sheet)}>
      <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigateBack(router, defaultBackHref())}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent",
            isLight ? "text-black" : "text-white"
          )}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className={cn("truncate text-base font-bold", ink)}>
            Request Help
          </h1>
          <p className={cn("truncate text-[11px]", muted)}>
            Review this Repair Pro, then confirm
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-3 scrollbar-hide">
        {/* 1. What do you need help with? — top */}
        <section className="space-y-2">
          <p className={cn("text-[14px] font-bold", ink)}>
            What do you need help with?
          </p>
          <div className="space-y-0.5">
            {problems.map((p) => {
              const active = problem === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProblem(p)}
                  className={cn(
                    "flex w-full items-center gap-2.5 border-0 bg-transparent px-0 py-2.5 text-left text-[13px] transition-colors",
                    active ? "font-bold text-brand" : cn("font-medium", ink)
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-2 w-2 shrink-0 rounded-full",
                      active
                        ? "bg-brand"
                        : isLight
                          ? "bg-slate-400"
                          : "bg-white/30"
                    )}
                  />
                  {p}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Matched pro — professional layout */}
        <section className="space-y-3">
          <p
            className={cn(
              "text-[10px] font-bold uppercase tracking-wide",
              muted
            )}
          >
            Matched technician
          </p>
          <div className="flex items-start gap-3">
            <Avatar className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-0 ring-0">
              <AvatarImage
                src={photo}
                alt={tech.name}
                className="h-full w-full object-cover object-center"
              />
              <AvatarFallback className="bg-[#323231] text-sm font-bold text-white">
                {avatarInitials(tech.name, "PR")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-1">
              <p className={cn("text-[16px] font-bold leading-tight", ink)}>
                {tech.name}
              </p>
              <p className={cn("text-[12px] font-semibold", muted)}>
                {skillLabel}
              </p>
              <div className="flex items-center gap-1 pt-0.5">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className={cn("text-[13px] font-bold", ink)}>
                  {tech.rating.toFixed(1)}
                </span>
                <span className={cn("text-[11px]", muted)}>
                  ({tech.reviewCount || allReviews.length} reviews)
                </span>
              </div>
              <div
                className={cn(
                  "flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[12px] font-medium",
                  muted
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 text-brand" />
                  ETA {formatEta(tech.etaMinutes)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Navigation className="h-3.5 w-3.5 text-brand" />
                  {formatDistance(tech.distanceKm)}
                </span>
              </div>
              {tech.verified && (
                <p className="pt-0.5 text-[11px] font-semibold text-emerald-600">
                  Verified Repair Pro
                </p>
              )}
            </div>
          </div>

          {helpingSomeoneElse && (
            <p className="text-[11px] font-semibold leading-snug text-brand">
              Booking for someone else · meet at{" "}
              {helpingSomeoneLabel || location.label}
            </p>
          )}

          {skillRows.length > 0 && (
            <div className="space-y-1.5 border-t border-black/5 pt-2 dark:border-white/10">
              {skillRows.slice(0, 4).map((row) => (
                <div
                  key={row.label}
                  className="flex items-start justify-between gap-3 text-[11px]"
                >
                  <span className={muted}>{row.label}</span>
                  <span className={cn("max-w-[55%] text-right font-semibold", ink)}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Reviews below */}
        <section className="space-y-2">
          <p className={cn("text-[13px] font-bold", ink)}>Reviews</p>
          <div className="space-y-3">
            {visibleReviews.map((rev) => (
              <div key={rev.id} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-[12px] font-semibold", ink)}>
                    {rev.author}
                  </p>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-500">
                    <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                    {rev.rating}
                  </span>
                </div>
                <p className={cn("text-[11px] leading-snug", muted)}>
                  {rev.comment}
                </p>
                <p
                  className={cn(
                    "text-[10px]",
                    isLight ? "text-slate-400" : "text-white/40"
                  )}
                >
                  {rev.ago}
                </p>
              </div>
            ))}
          </div>
          {allReviews.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllReviews((v) => !v)}
              className="inline-flex items-center gap-0.5 border-0 bg-transparent p-0 text-[12px] font-bold text-brand"
            >
              {showAllReviews ? "Show less" : "See more"}
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  showAllReviews && "rotate-90"
                )}
              />
            </button>
          )}
        </section>
      </div>

      <div className={cn("shrink-0 space-y-2 px-3 pb-4 pt-1", sheet)}>
        {hasPrice && baseLabour != null ? (
          <NegotiatePanel
            baseAmountMajor={baseLabour}
            currency={currency}
            discountPercent={discountPercent}
            onChangeDiscount={setDiscountPercent}
            isLight={isLight}
            disabled={payBusy}
          />
        ) : (
          <div
            className={cn(
              "rounded-2xl px-3 py-3 text-[12px] font-semibold",
              isLight ? "bg-amber-500/15 text-amber-800" : "bg-amber-500/15 text-amber-300"
            )}
          >
            Quote on request — this pro has not set a labour price for{" "}
            {skillLabel}. They must add it on their profile before you can pay
            into escrow.
          </div>
        )}
        <p className={cn("text-center text-[10px] leading-snug", muted)}>
          {LABOUR_FEE_DISCLAIMER} Platform keeps {PLATFORM_COMMISSION_PERCENT}%
          after both parties mark complete; pro receives 95%.
        </p>
        {blocked && (
          <VerificationBlockedPanel
            message={blocked}
            isLight={isLight}
            onClose={() => setBlocked(null)}
          />
        )}
        <button
          type="button"
          disabled={payBusy || !hasPrice}
          onClick={() => void submit()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-0 bg-[#323231] py-3.5 text-[15px] font-semibold text-white active:opacity-90 disabled:opacity-50"
        >
          {payBusy
            ? "Starting secure payment…"
            : !hasPrice
              ? "Price required"
              : discountPercent > 0
                ? "Send offer & request"
                : "Pay labour fee & connect"}
        </button>
        <p className={cn("text-center text-[10px]", muted)}>
          <MapPin className="mr-0.5 inline h-3 w-3 text-brand" />
          Card · Bank transfer · USSD via Paystack / Flutterwave · funds held in
          escrow
        </p>
      </div>
    </div>
  );
}

export default function RequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#c8c9cd] text-sm text-slate-500">
          Loading request…
        </div>
      }
    >
      <RequestFlow />
    </Suspense>
  );
}
