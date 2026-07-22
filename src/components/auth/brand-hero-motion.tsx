"use client";

import { cn } from "@/lib/utils";

/** Fallback plate color only if the photo has not painted yet */
export const BRAND_COPPER = "#c97d47";

/**
 * Intro / auth full-bleed art — clean copper + tire-ring portrait.
 * Always clipped to parent (phone shell); never full browser window.
 */
const BRAND_SRC = "/brand/auth-bg-v31.jpg";
const BRAND_W = 720;
const BRAND_H = 1280;

/** Cover phone frame; face stays centered in the ring */
const BRAND_FOCUS = "object-cover object-center";

type BrandHeroProps = {
  className?: string;
  size?: "full" | "card" | "splash";
  bottomFade?: boolean;
  motion?: boolean;
  /** Soft fade + slight scale on first paint (intro) */
  introMotion?: boolean;
};

/**
 * Brand background — full-bleed metallic photograph.
 * Confined by overflow:hidden parent (#ona-phone).
 * Image loads once (lazy when not intro); copper plate shows first to cut data.
 */
export function BrandHeroMotion({
  className,
  size = "full",
  bottomFade = false,
  motion = true,
  introMotion = false,
}: BrandHeroProps) {
  if (size === "card") {
    return (
      <div
        className={cn(
          "relative mx-auto h-36 w-36 overflow-hidden rounded-full shadow-2xl",
          motion && "om-apple-motion-sharp",
          className
        )}
        style={{ backgroundColor: BRAND_COPPER }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BRAND_SRC}
          alt="Ona"
          width={BRAND_W}
          height={BRAND_H}
          className={cn(
            "om-brand-img absolute inset-0 h-full w-full",
            BRAND_FOCUS
          )}
          style={{ filter: "none" }}
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        /* Absolute fill of phone shell only — never fixed/viewport */
        "pointer-events-none absolute inset-0 overflow-hidden",
        motion && !introMotion && "om-apple-motion-sharp",
        className
      )}
      aria-hidden
      style={{ backgroundColor: BRAND_COPPER }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND_SRC}
        alt=""
        width={BRAND_W}
        height={BRAND_H}
        decoding="async"
        // Welcome only: one high-priority load. Never re-key the img (avoids re-fetch loops).
        // Splash + intro: eager brand photo so reload never stays copper-only
        fetchPriority={introMotion || size === "splash" ? "high" : "low"}
        loading={introMotion || size === "splash" ? "eager" : "lazy"}
        draggable={false}
        sizes="390px"
        className={cn(
          "om-brand-img absolute inset-0 h-full w-full max-h-full max-w-full",
          BRAND_FOCUS,
          introMotion && "om-intro-hero-img"
        )}
        style={{
          filter: "none",
          objectFit: "cover",
          objectPosition: "center center",
        }}
      />

      {bottomFade && size === "full" && (
        <div className="absolute inset-x-0 bottom-0 h-[22%] bg-black/25" />
      )}
    </div>
  );
}
