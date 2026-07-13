"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Check, ChevronLeft, ChevronRight, Wrench } from "lucide-react";
import {
  AuthPlate,
  WHEEL_GRAY,
} from "@/components/auth/auth-plate";
import type { AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACCENT = "#e85a12";

/**
 * Role selection — professional account-type step before signup.
 * Sheet #C8C9CD · wheel gray #323231 · brand orange accents.
 */
export function LoginScreen() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>("motorist");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(
      accountType === "professional" ? "/signup/pro" : "/signup/motorist"
    );
  };

  const goBack = () => {
    try {
      sessionStorage.removeItem("oga-mecho-entry-done");
    } catch {
      /* ignore */
    }
    router.push("/login");
  };

  return (
    <AuthPlate>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pb-1 pt-4">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 items-center gap-0.5 rounded-md border-0 bg-transparent px-1 text-[13px] font-semibold text-[#1e293b] transition-opacity active:opacity-70"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
            Back
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
            Sign up · 1 of 2
          </span>
          <span className="w-14" aria-hidden />
        </div>

        {/* Brand + intro */}
        <div className="px-5 pt-3 text-center">
          <h1 className="text-[26px] font-bold leading-none tracking-tight">
            <span style={{ color: WHEEL_GRAY }}>Oga</span>
            <span style={{ color: ACCENT }}>Mecho</span>
          </h1>
          <p className="mx-auto mt-2 max-w-[280px] text-[13px] leading-relaxed text-[#475569]">
            Choose how you&apos;ll use the app
          </p>
        </div>

        {/* Role cards */}
        <form
          onSubmit={onSubmit}
          className="mt-7 flex min-h-0 flex-1 flex-col px-4 pb-5"
        >
          <div
            className="flex flex-col gap-2.5"
            role="radiogroup"
            aria-label="Account type"
          >
            <RoleCard
              active={accountType === "motorist"}
              icon={Car}
              title="Motorist"
              subtitle="Request roadside help nearby"
              onClick={() => setAccountType("motorist")}
            />
            <RoleCard
              active={accountType === "professional"}
              icon={Wrench}
              title="Repair Pro"
              subtitle="Offer services and win jobs"
              onClick={() => setAccountType("professional")}
            />
          </div>

          <p className="mt-4 px-0.5 text-center text-[11px] leading-relaxed text-[#64748b]">
            {accountType === "professional"
              ? "Takes about 2 minutes to complete"
              : "Takes about 1 minute to complete"}
          </p>

          <div className="mt-auto pt-5">
            <button
              type="submit"
              className="om-cta-dark-gray"
              style={{
                WebkitAppearance: "none",
                appearance: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                height: 44,
                margin: 0,
                padding: "0 16px",
                border: "none",
                borderRadius: 6,
                background: "#323231",
                backgroundColor: "#323231",
                backgroundImage: "none",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1,
                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                cursor: "pointer",
                opacity: 1,
              }}
              data-cta="continue-signup"
            >
              Continue to sign up
              <ChevronRight
                className="h-4 w-4 shrink-0"
                color="#ffffff"
                strokeWidth={2.4}
              />
            </button>
            <p className="mt-2.5 text-center text-[12px] text-[#64748b]">
              Already have an account?{" "}
              <button
                type="button"
                className="border-0 bg-transparent p-0 font-semibold"
                style={{ color: ACCENT }}
                onClick={() => router.push("/login/signin")}
              >
                Log In
              </button>
            </p>
          </div>
        </form>
      </div>
    </AuthPlate>
  );
}

function RoleCard({
  active,
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: typeof Car;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex w-full gap-3 rounded-md border-0 px-3.5 py-3.5 text-left transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85a12]/45",
        active
          ? "bg-white shadow-[0_4px_18px_rgba(15,23,42,0.10)]"
          : "bg-white/55 shadow-[0_1px_4px_rgba(15,23,42,0.05)] active:bg-white/80"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-[18px] w-[18px] shrink-0",
          active ? "text-[#e85a12]" : "text-[#475569]"
        )}
        strokeWidth={2.1}
      />

      <div className="min-w-0 flex-1 pr-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-[15px] font-bold leading-tight tracking-tight"
            style={{ color: active ? WHEEL_GRAY : "#0f172a" }}
          >
            {title}
          </span>
          {active && (
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Selected
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-[#334155]">
          {subtitle}
        </p>
      </div>

      <div
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          active
            ? "border-[#e85a12] bg-[#e85a12]"
            : "border-[#94a3b8] bg-transparent"
        )}
        aria-hidden
      >
        {active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </div>
    </button>
  );
}
