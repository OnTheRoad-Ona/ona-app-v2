"use client";

import { BrandHeroMotion } from "@/components/auth/brand-hero-motion";
import { WHEEL_GRAY } from "@/components/auth/auth-plate";

/**
 * After intro video:
 * - Full metallic brand photograph as background (no copper fills / gradients)
 * - Top: WELCOME TO · OgaMecho · tagline
 * - Bottom: Log In / Sign Up
 */
/** Tagline under OgaMecho — black */
const TAGLINE_COLOR = "#000000";
/** Sheet gray for Log In button */
const LOGIN_BTN_BG = "#C8C9CD";

export function BrandEntryScreen({
  onLogIn,
  onSignUp,
}: {
  onLogIn: () => void;
  onSignUp: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-[300] overflow-hidden"
      role="dialog"
      aria-label="OgaMecho welcome"
    >
      {/* True photographic metallic background — no overlay fills */}
      <BrandHeroMotion size="splash" bottomFade={false} motion={false} />

      {/* Top cluster: Welcome → OgaMecho → tagline */}
      <div className="absolute inset-x-0 top-0 z-10 px-6 pt-[max(2.75rem,env(safe-area-inset-top))]">
        <div className="text-center">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.38em]"
            style={{ color: "#ffffff" }}
          >
            Welcome to
          </p>
          <h1 className="mt-2 text-[32px] font-black tracking-tight">
            <span style={{ color: "#ffffff" }}>Oga</span>
            <span style={{ color: "#1c1c1e" }}>Mecho</span>
          </h1>
          <p
            className="mx-auto mt-2.5 max-w-[300px] text-[12px] font-medium leading-relaxed tracking-[0.04em]"
            style={{ color: TAGLINE_COLOR }}
          >
            Request help or offer roadside services
          </p>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-[340px] flex-col gap-2.5">
          <button
            type="button"
            onClick={onLogIn}
            className="h-11 w-full rounded-md text-[14px] font-semibold transition-colors active:brightness-95"
            style={{
              backgroundColor: LOGIN_BTN_BG,
              color: WHEEL_GRAY,
              boxShadow: "0 1px 3px rgba(0,0,0,0.14)",
            }}
          >
            Log In
          </button>

          <button
            type="button"
            onClick={onSignUp}
            className="h-11 w-full rounded-md text-[14px] font-semibold text-white transition-colors active:brightness-95"
            style={{
              backgroundColor: WHEEL_GRAY,
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
          >
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}

