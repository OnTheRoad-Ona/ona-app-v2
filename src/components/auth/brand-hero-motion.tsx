"use client";

import { cn } from "@/lib/utils";

/** Fallback plate color only if the photo has not painted yet */
export const BRAND_COPPER = "#c4784a";

/**
 * Full metallic brand poster (attached asset) — photo only, no color fills.
 * 720×1280 source → 2880×5120 (4×) high-quality encode for sharp retina display.
 */
const BRAND_SRC = "/brand/oga-mecho-hero.jpg?v=27";
const BRAND_W = 2816;
const BRAND_H = 5888;

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
          className="om-brand-img absolute inset-0 h-full w-full object-cover object-[center_42%]"
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
        src={BRAND_SRC}
        alt=""
        width={BRAND_W}
        height={BRAND_H}
        decoding="sync"
        fetchPriority="high"
        loading="eager"
        draggable={false}
        sizes="100vw"
        className={cn(
          "om-brand-img absolute inset-0 h-full w-full",
          size === "splash" || size === "full"
            ? "object-cover object-center"
            : "object-contain object-center"
        )}
      />

      {bottomFade && size === "full" && (
        <div className="absolute inset-x-0 bottom-0 h-[22%] bg-black/25" />
      )}
    </div>
  );
}
