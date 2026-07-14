"use client";

import { BrandHeroMotion } from "@/components/auth/brand-hero-motion";
import { WHEEL_GRAY } from "@/components/auth/auth-plate";
import { cn } from "@/lib/utils";

/**
 * After intro video:
 * - Full metallic brand photograph as background (no copper fills / gradients)
 * - Top: WELCOME TO · OgaMecho · tagline
 * - Bottom: Log In / Sign Up
 * - Apple motion when arriving from intro (crossfade under video)
 */
const TAGLINE_COLOR = "#000000";
const LOGIN_BTN_BG = "#C8C9CD";

export function BrandEntryScreen({
  onLogIn,
  onSignUp,
  animateIn = false,
}: {
  onLogIn: () => void;
  onSignUp: () => void;
  /** Play Apple enter motion (after intro handoff) */
  animateIn?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 z-[300] overflow-hidden bg-black"
      role="dialog"
      aria-label="OgaMecho welcome"
    >
      {/* Brand art with Apple motion — black underlay until pixels paint */}
      <BrandHeroMotion size="splash" bottomFade={false} motion={animateIn} />

      {/* Top cluster */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-10 px-6 pt-[max(2.75rem,env(safe-area-inset-top))]",
          animateIn && "om-apple-motion-delay"
        )}
      >
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
            Get help for your car, or earn money fixing cars
          </p>
        </div>
      </div>

      {/* Bottom actions */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          animateIn && "om-apple-motion-panel"
        )}
      >
        <div className="mx-auto flex w-full max-w-[340px] flex-col gap-2.5">
          <button
            type="button"
            onClick={onLogIn}
            className="h-11 w-full rounded-md border-0 text-[14px] font-semibold transition-colors active:brightness-95"
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
            className="h-11 w-full rounded-md border-0 text-[14px] font-semibold text-white transition-colors active:brightness-95"
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
