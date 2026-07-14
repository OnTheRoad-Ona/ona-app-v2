"use client";

import Link from "next/link";
import {
  ChevronRight,
  LogOut,
  MapPin,
  Settings,
  Shield,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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

export default function ProfilePage() {
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
    authName && authName !== "Guest"
      ? authName
      : registeredAs === "client"
        ? "Vehicle Owner"
        : `${SERVICE_LABELS[registeredAs]} Pro`;

  const accountLabel =
    accountType === "professional" ? "Repair Professional" : "Motorist";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-[#120a08]"
      )}
    >
      <PageHeader title="Profile" subtitle="Account & settings" />

      <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
        <div className="card-surface flex items-center gap-3 rounded-lg p-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-brand text-sm font-bold text-white">
              {registeredAs === "client" ? "YO" : "PR"}
            </AvatarFallback>
          </Avatar>
          <div>
            <p
              className={cn(
                "text-base font-bold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              {displayName}
            </p>
            <p className="text-xs text-muted">{accountLabel}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
              <MapPin className="h-3 w-3 text-brand" />
              {location.label}
            </p>
          </div>
        </div>

        {/* Post-signup identity verification funnel */}
        <div className="card-surface mt-3 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0",
                isIdentityVerified(userProfile) ? "text-emerald-500" : "text-brand"
              )}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  isLight ? "text-slate-900" : "text-white"
                )}
              >
                Identity verification
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {isIdentityVerified(userProfile)
                  ? "NIN and BVN verified. You can book and accept without limit."
                  : `You can try the app first. We will remind you from job ${VERIFY_WARN_FROM}. Verify before job ${VERIFY_BLOCK_AT} so you can keep booking or accepting.`}
              </p>
              <div
                className={cn(
                  "mt-2 flex flex-wrap items-center gap-2 rounded-md px-2.5 py-2 text-[11px]",
                  isLight ? "bg-slate-100" : "bg-white/10"
                )}
              >
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                    verificationStatusLabel(userProfile) === "verified"
                      ? "bg-emerald-100 text-emerald-800"
                      : verificationStatusLabel(userProfile) === "partial"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-slate-200 text-slate-700"
                  )}
                >
                  {verificationStatusLabel(userProfile)}
                </span>
                <span className="text-muted">
                  Actions used: {getServiceActionCount(userProfile)}
                  {!isIdentityVerified(userProfile) &&
                    Number.isFinite(remainingFreeActions(userProfile)) &&
                    `, ${remainingFreeActions(userProfile)} free left`}
                </span>
              </div>
              {!isIdentityVerified(userProfile) && (
                <Link
                  href="/verify"
                  className="mt-2.5 inline-flex h-9 items-center justify-center rounded-lg bg-[#323231] px-3 text-[12px] font-semibold text-white"
                >
                  Verify NIN & BVN
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Account type locked at signup */}
        <div className="card-surface mt-3 rounded-lg p-3">
          <p
            className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Your account type
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            You can be a car owner and a Repair Pro. Each one needs its own
            signup. Switch from the menu (☰).
          </p>
          <div
            className={cn(
              "mt-2 rounded-md px-3 py-2.5",
              isLight ? "bg-slate-100" : "bg-white/10"
            )}
          >
            <p
              className={cn(
                "text-[13px] font-bold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              Using now: {accountLabel}
              {accountType === "professional" && registeredAs !== "client"
                ? ` (${SERVICE_LABELS[registeredAs as ProService] ?? registeredAs})`
                : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              Open the three line menu to switch account or sign up for the
              other one.
            </p>
          </div>
        </div>

        {/* Skill answers + vehicles you serve (motorist-visible) */}
        {accountType === "professional" && userProfile && (
          <>
            {userProfile.services?.[0] &&
              publicSkillRows(
                userProfile.services[0],
                userProfile.skillAnswers
              ).length > 0 && (
                <div className="card-surface mt-3 rounded-lg p-3">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isLight ? "text-slate-900" : "text-white"
                    )}
                  >
                    Skill profile
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    From your{" "}
                    {PRO_SERVICE_LABELS[userProfile.services[0]] ?? "skill"}{" "}
                    signup · visible to motorists
                  </p>
                  <div className="mt-2 divide-y divide-black/5">
                    {publicSkillRows(
                      userProfile.services[0],
                      userProfile.skillAnswers
                    ).map((row) => (
                      <div
                        key={row.label}
                        className="flex items-start justify-between gap-2 py-2 first:pt-0 last:pb-0"
                      >
                        <span className="text-[12px] text-muted">
                          {row.label}
                        </span>
                        <span
                          className={cn(
                            "max-w-[58%] text-right text-[12px] font-semibold",
                            isLight ? "text-slate-900" : "text-white"
                          )}
                        >
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            <div className="card-surface mt-3 rounded-lg p-3">
              <p
                className={cn(
                  "text-sm font-semibold",
                  isLight ? "text-slate-900" : "text-white"
                )}
              >
                Vehicles you serve
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                Visible to motorists on your public profile
              </p>
              <div className="mt-2 divide-y divide-black/5">
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
                    className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="text-[12px] text-muted">{label}</span>
                    <span
                      className={cn(
                        "max-w-[60%] text-right text-[12px] font-semibold",
                        isLight ? "text-slate-900" : "text-white"
                      )}
                    >
                      {value || "Not set"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* One professional skill only */}
        {isProRegistered && proServices[0] && (
          <div className="card-surface mt-3 rounded-lg p-3">
            <p
              className={cn(
                "text-sm font-semibold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              Your skill
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              This account has one skill only. You cannot add another trade here.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="metallic-orange inline-block rounded-md px-2.5 py-1.5 text-[11px] font-bold text-white">
                {SERVICE_LABELS[proServices[0]] ?? proServices[0]} (main)
              </span>
              <Link
                href="/technician/pro-self"
                className="text-[11px] font-bold text-brand underline-offset-2 hover:underline"
              >
                See how customers see you
              </Link>
            </div>
          </div>
        )}

        <div className="card-surface mt-3 overflow-hidden rounded-lg">
          {[
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
            { href: "/settings", label: "Settings", icon: Settings },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-3",
                isLight ? "hover:bg-slate-50" : "hover:bg-white/5"
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft">
                <Icon className="h-4 w-4 text-brand" />
              </span>
              <span
                className={cn(
                  "flex-1 text-sm font-medium",
                  isLight ? "text-slate-800" : "text-white"
                )}
              >
                {label}
              </span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </Link>
          ))}
        </div>

        <div className="card-surface mt-3 rounded-lg p-3">
          <p
            className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Manual location
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            If GPS fails, set your area.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Ikeja, Lagos", "Lekki, Lagos", "Yaba, Lagos", "VI, Lagos"].map(
              (loc) => (
                <Button
                  key={loc}
                  size="sm"
                  variant={location.label === loc ? "default" : "secondary"}
                  onClick={() => setManualLocation(loc)}
                >
                  {loc}
                </Button>
              )
            )}
          </div>
        </div>

        <Link
          href="/logout"
          className={cn(
            "mt-3 flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-bold",
            isLight
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : "bg-red-500/15 text-red-400 hover:bg-red-500/25"
          )}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Link>
      </div>
    </div>
  );
}
