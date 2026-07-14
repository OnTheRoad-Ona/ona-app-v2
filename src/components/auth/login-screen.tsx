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
  /** No default — user must pick Motorist or Repair Pro */
  const [accountType, setAccountType] = useState<AccountType | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountType) return;
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
        {/* Top bar — no step counter; keep Back only */}
        <div className="flex items-center px-4 pb-0 pt-3">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 items-center gap-0.5 rounded-md border-0 bg-transparent px-1 text-[13px] font-semibold text-[#1e293b] transition-opacity active:opacity-70"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
            Back
          </button>
        </div>

        {/* Brand + intro — pulled up closer to top */}
        <div className="px-5 pt-1 text-center">
          <h1 className="text-[26px] font-bold leading-none tracking-tight">
            <span style={{ color: WHEEL_GRAY }}>Oga</span>
            <span style={{ color: ACCENT }}>Mecho</span>
          </h1>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-[#475569]">
            Choose how you&apos;ll use the app
          </p>
        </div>

        {/* Role cards */}
        <form
          onSubmit={onSubmit}
          className="mt-5 flex min-h-0 flex-1 flex-col px-4 pb-5"
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
              subtitle="I have a car and need help on the road"
              onClick={() => setAccountType("motorist")}
            />
            <RoleCard
              active={accountType === "professional"}
              icon={Wrench}
              title="Repair Pro"
              subtitle="I fix cars and want customers"
              onClick={() => setAccountType("professional")}
            />
          </div>

          <p className="mt-4 px-0.5 text-center text-[11px] leading-relaxed text-[#64748b]">
            {!accountType
              ? "Tap Motorist or Repair Pro to continue"
              : accountType === "professional"
                ? "About 2 minutes to finish"
                : "About 1 minute to finish"}
          </p>

          <div className="mt-auto pt-5">
            <button
              type="submit"
              disabled={!accountType}
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
                cursor: accountType ? "pointer" : "not-allowed",
                opacity: accountType ? 1 : 0.45,
              }}
              data-cta="continue-signup"
            >
              Continue
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
        "flex w-full gap-3 rounded-md px-3.5 py-3.5 text-left transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85a12]/45",
        /* Unselected: flat sheet tone — no white “highlight” until user taps */
        active
          ? "border border-transparent bg-white shadow-[0_4px_18px_rgba(15,23,42,0.10)]"
          : "border border-[#9A9EA6]/70 bg-transparent shadow-none active:bg-black/[0.04]"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-[18px] w-[18px] shrink-0",
          active ? "text-[#e85a12]" : "text-[#64748b]"
        )}
        strokeWidth={2.1}
      />

      <div className="min-w-0 flex-1 pr-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-[15px] font-bold leading-tight tracking-tight"
            style={{ color: active ? WHEEL_GRAY : "#334155" }}
          >
            {title}
          </span>
          {active ? (
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Selected
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            "mt-0.5 text-[12.5px] font-medium leading-snug",
            active ? "text-[#334155]" : "text-[#64748b]"
          )}
        >
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
        {active ? (
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        ) : null}
      </div>
    </button>
  );
}
