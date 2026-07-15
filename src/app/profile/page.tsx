"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  LogOut,
  MapPin,
  Shield,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { useApp } from "@/lib/store";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { publicSkillRows } from "@/lib/skill-questions";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  getServiceActionCount,
  isIdentityVerified,
  remainingFreeActions,
  VERIFY_BLOCK_AT,
  VERIFY_WARN_FROM,
  verificationStatusLabel,
} from "@/lib/verification-gate";

const SERVICE_LABELS = PRO_SERVICE_LABELS;

const AREA_CHIPS = [
  { label: "Ikeja, Lagos", coords: { lat: 6.6018, lng: 3.3515 } },
  { label: "Lekki, Lagos", coords: { lat: 6.4474, lng: 3.4721 } },
  { label: "Yaba, Lagos", coords: { lat: 6.5095, lng: 3.3711 } },
  { label: "VI, Lagos", coords: { lat: 6.4281, lng: 3.4219 } },
] as const;

export default function ProfilePage() {
  const router = useRouter();
  const {
    location,
    setManualLocation,
    theme,
    registeredAs,
    userMode,
    proServices,
    displayName: authName,
    accountType,
    userProfile,
  } = useApp();
  const isLight = theme === "light";
  const isProRegistered = registeredAs !== "client";

  const displayName =
    (userProfile?.fullName || authName || "").trim() ||
    (registeredAs === "client"
      ? "Vehicle Owner"
      : `${SERVICE_LABELS[registeredAs as ProService] ?? "Pro"}`);

  const accountLabel =
    accountType === "professional" ? "Repair Professional" : "Motorist";

  // Solid sheets only — no glass / transparent panels
  const sheet = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const card = isLight
    ? "rounded-2xl bg-[#d4d5d9]"
    : "rounded-2xl bg-[#141414]";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/55";
  const chip = isLight
    ? "rounded-xl bg-[#bebfc4] text-slate-900"
    : "rounded-xl bg-[#1f1f1f] text-white";
  const chipActive = "rounded-xl bg-[#323231] text-white";

  const status = verificationStatusLabel(userProfile);
  const freeLeft = remainingFreeActions(userProfile);
  const actionsUsed = getServiceActionCount(userProfile);

  const quickLinks = [
    ...(userMode === "professional" || isProRegistered
      ? [
          {
            href: "/dashboard",
            label: "Professional Dashboard",
            icon: Wrench,
          },
          {
            href: "/technician/pro-self",
            label: "My public Repair Pro profile",
            icon: UserRound,
          },
        ]
      : []),
    { href: "/requests", label: "My Requests", icon: Shield },
  ];

  const go = (href: string) => {
    router.push(href);
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", sheet)}>
      <PageHeader title="Profile" subtitle="Account & settings" />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-5 scrollbar-hide">
        {/* Identity hero */}
        <section className={cn(card, "flex items-center gap-3.5 p-4")}>
          <Avatar className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-0 ring-0">
            <AvatarImage
              src={DEFAULT_VENDOR_PHOTO}
              alt={displayName}
              className="h-full w-full object-cover object-center"
            />
            <AvatarFallback className="bg-[#323231] text-sm font-bold text-white">
              {avatarInitials(
                displayName,
                accountType === "professional" ? "PR" : "MO"
              )}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-[16px] font-bold leading-tight", ink)}>
              {displayName}
            </p>
            <p className={cn("mt-0.5 text-[12px] font-semibold", muted)}>
              {accountLabel}
            </p>
            <p
              className={cn(
                "mt-1.5 flex items-center gap-1 text-[11px] font-medium",
                muted
              )}
            >
              <MapPin className="h-3 w-3 shrink-0 text-brand" />
              <span className="truncate">{location.label}</span>
            </p>
          </div>
        </section>

        {/* Identity verification */}
        <section className={cn(card, "p-4")}>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                isLight ? "bg-[#c8c9cd]" : "bg-[#1f1f1f]"
              )}
            >
              <ShieldCheck
                className={cn(
                  "h-4.5 w-4.5",
                  isIdentityVerified(userProfile)
                    ? "text-emerald-500"
                    : "text-brand"
                )}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[14px] font-bold", ink)}>
                Identity verification
              </p>
              <p className={cn("mt-1 text-[11px] leading-snug", muted)}>
                {isIdentityVerified(userProfile)
                  ? "NIN and BVN verified. You can book and accept without limit."
                  : `Try the app first. We'll remind you from job ${VERIFY_WARN_FROM}. Verify before job ${VERIFY_BLOCK_AT} to keep booking or accepting.`}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
                    status === "verified"
                      ? "bg-emerald-500/20 text-emerald-500"
                      : status === "partial"
                        ? "bg-amber-500/20 text-amber-500"
                        : isLight
                          ? "bg-[#c8c9cd] text-slate-700"
                          : "bg-[#2a2a2a] text-white/80"
                  )}
                >
                  {status}
                </span>
                <span className={cn("text-[11px] font-medium", muted)}>
                  Actions used: {actionsUsed}
                  {!isIdentityVerified(userProfile) &&
                    Number.isFinite(freeLeft) &&
                    ` · ${freeLeft} free left`}
                </span>
              </div>

              {!isIdentityVerified(userProfile) && (
                <button
                  type="button"
                  onClick={() => go("/verify")}
                  className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border-0 bg-[#323231] px-4 text-[12px] font-semibold text-white"
                >
                  Verify NIN & BVN
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Account type */}
        <section className={cn(card, "p-4")}>
          <p className={cn("text-[14px] font-bold", ink)}>Your account type</p>
          <p className={cn("mt-1 text-[11px] leading-snug", muted)}>
            You can be a car owner and a Repair Pro. Each needs its own signup.
            Switch from the menu (☰).
          </p>
          <div
            className={cn(
              "mt-3 rounded-xl px-3.5 py-3",
              isLight ? "bg-[#c8c9cd]" : "bg-[#1f1f1f]"
            )}
          >
            <p className={cn("text-[13px] font-bold", ink)}>
              Using now: {accountLabel}
              {accountType === "professional" && registeredAs !== "client"
                ? ` (${SERVICE_LABELS[registeredAs as ProService] ?? registeredAs})`
                : ""}
            </p>
            <p className={cn("mt-1 text-[11px] leading-snug", muted)}>
              Open the menu to switch account or sign up for the other role.
            </p>
          </div>
        </section>

        {/* Pro-only blocks */}
        {accountType === "professional" && userProfile && (
          <>
            {userProfile.services?.[0] &&
              publicSkillRows(
                userProfile.services[0],
                userProfile.skillAnswers
              ).length > 0 && (
                <section className={cn(card, "p-4")}>
                  <p className={cn("text-[14px] font-bold", ink)}>
                    Skill profile
                  </p>
                  <p className={cn("mt-0.5 text-[11px]", muted)}>
                    From{" "}
                    {PRO_SERVICE_LABELS[userProfile.services[0]] ?? "skill"}{" "}
                    signup · visible to motorists
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {publicSkillRows(
                      userProfile.services[0],
                      userProfile.skillAnswers
                    ).map((row) => (
                      <div
                        key={row.label}
                        className="flex items-start justify-between gap-3"
                      >
                        <span className={cn("text-[12px]", muted)}>
                          {row.label}
                        </span>
                        <span
                          className={cn(
                            "max-w-[58%] text-right text-[12px] font-semibold",
                            ink
                          )}
                        >
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

            <section className={cn(card, "p-4")}>
              <p className={cn("text-[14px] font-bold", ink)}>
                Vehicles you serve
              </p>
              <p className={cn("mt-0.5 text-[11px]", muted)}>
                Visible on your public profile
              </p>
              <div className="mt-3 space-y-2.5">
                {(
                  [
                    ["Vehicle type", userProfile.servedVehicleType],
                    [
                      "Brand",
                      userProfile.servedBrand || userProfile.servedMake,
                    ],
                    ["Model", userProfile.servedModel],
                    ["Country", userProfile.servedCountry],
                    ["State / Region", userProfile.servedLocation],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className={cn("text-[12px]", muted)}>{label}</span>
                    <span
                      className={cn(
                        "max-w-[60%] text-right text-[12px] font-semibold",
                        ink
                      )}
                    >
                      {value || "Not set"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {isProRegistered && proServices[0] && (
          <section className={cn(card, "p-4")}>
            <p className={cn("text-[14px] font-bold", ink)}>Your skill</p>
            <p className={cn("mt-0.5 text-[11px]", muted)}>
              One skill per Repair Pro account.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-block rounded-xl bg-[#323231] px-3 py-1.5 text-[11px] font-bold text-white">
                {SERVICE_LABELS[proServices[0]] ?? proServices[0]}
              </span>
              <button
                type="button"
                onClick={() => go("/technician/pro-self")}
                className="border-0 bg-transparent text-[11px] font-bold text-brand"
              >
                See public profile
              </button>
            </div>
          </section>
        )}

        {/* Quick links — solid rows */}
        <section className={cn(card, "overflow-hidden")}>
          {quickLinks.map(({ href, label, icon: Icon }, i) => (
            <button
              key={label}
              type="button"
              onClick={() => go(href)}
              className={cn(
                "flex w-full items-center gap-3 border-0 px-4 py-3.5 text-left",
                isLight ? "bg-[#d4d5d9]" : "bg-[#141414]",
                i > 0 &&
                  (isLight
                    ? "border-t border-[#c8c9cd]"
                    : "border-t border-[#1f1f1f]")
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl",
                  isLight ? "bg-[#c8c9cd]" : "bg-[#1f1f1f]"
                )}
              >
                <Icon className="h-4 w-4 text-brand" />
              </span>
              <span className={cn("flex-1 text-[14px] font-semibold", ink)}>
                {label}
              </span>
              <ChevronRight
                className={cn(
                  "h-4 w-4",
                  isLight ? "text-slate-400" : "text-white/35"
                )}
              />
            </button>
          ))}
        </section>

        {/* Manual location */}
        <section className={cn(card, "p-4")}>
          <p className={cn("text-[14px] font-bold", ink)}>Manual location</p>
          <p className={cn("mt-0.5 text-[11px]", muted)}>
            If GPS fails, set your area.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {AREA_CHIPS.map(({ label, coords }) => {
              const active = location.label === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setManualLocation(label, coords)}
                  className={cn(
                    "border-0 px-3 py-2 text-[12px] font-semibold transition-colors",
                    active ? chipActive : chip
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        <button
          type="button"
          onClick={() => go("/logout")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-0 bg-red-500/15 px-3 py-3.5 text-sm font-bold text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </div>
  );
}
