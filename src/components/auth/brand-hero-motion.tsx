"use client";

import { cn } from "@/lib/utils";

/** Fallback plate color only if the photo has not painted yet */
export const BRAND_COPPER = "#c4784a";

/**
 * Auth brand background only — photo asset, no solid fills.
 * Unique filename + version so browsers never keep a stale hero.
 */
const BRAND_SRC = "/brand/auth-bg-v30.jpg";
const BRAND_W = 720;
const BRAND_H = 1280;

/** Full-bleed cover; phone-native 9:16 so face stays centered in the ring. */
const BRAND_FOCUS = "object-cover object-center";

type BrandHeroProps = {
  className?: string;
  size?: "full" | "card" | "splash";
  bottomFade?: boolean;
  motion?: boolean;
};

/**
 * Brand background — true full-bleed metallic photograph.
 * No solid fills, glows, or gradient overlays on the art.
 */
export function BrandHeroMotion({
  className,
  size = "full",
  bottomFade = false,
  motion = true,
}: BrandHeroProps) {
  if (size === "card") {
    return (
      <div
        className={cn(
          "relative mx-auto h-36 w-36 overflow-hidden rounded-full shadow-2xl",
          motion && "om-apple-motion-sharp",
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BRAND_SRC}
          alt="Oga Mecho"
          width={BRAND_W}
          height={BRAND_H}
          key={BRAND_SRC}
          className={cn(
            "om-brand-img absolute inset-0 h-full w-full",
            BRAND_FOCUS
          )}
          style={{ filter: "none" }}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        motion && "om-apple-motion-sharp",
        className
      )}
      aria-hidden
    >
      {/* Full-bleed photographic background — cover entire frame */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={BRAND_SRC}
        src={BRAND_SRC}
        alt=""
        width={BRAND_W}
        height={BRAND_H}
        decoding="async"
        fetchPriority="high"
        loading="eager"
        draggable={false}
        sizes="100vw"
        className={cn(
          "om-brand-img absolute inset-0 h-full w-full",
          size === "splash" || size === "full"
            ? BRAND_FOCUS
            : "object-contain object-center"
        )}
        style={{
          /* No filters — show the attached art as-is */
          filter: "none",
        }}
      />

      {bottomFade && size === "full" && (
        <div className="absolute inset-x-0 bottom-0 h-[22%] bg-black/25" />
      )}
    </div>
  );
}
