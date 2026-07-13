"use client";

import { cn } from "@/lib/utils";

/** Plate copper under letterboxing */
export const BRAND_COPPER = "#c4784a";

/** Logo-only poster (native 720×1280) */
const BRAND_SRC = "/brand/oga-mecho-hero.jpg?v=12";
const BRAND_W = 720;
const BRAND_H = 1280;

type BrandHeroProps = {
  className?: string;
  size?: "full" | "card" | "splash";
  bottomFade?: boolean;
  motion?: boolean;
};

/**
 * Brand background — full-frame logo-only art
 * (state from two steps before logo-only crop / 70% scale).
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
        style={{ backgroundColor: BRAND_COPPER }}
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
        className
      )}
      style={{ backgroundColor: BRAND_COPPER }}
      aria-hidden
    >
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          motion && "om-apple-motion-sharp"
        )}
      >
        <div
          className="relative h-full max-h-full"
          style={{
            aspectRatio: `${BRAND_W} / ${BRAND_H}`,
            width: "auto",
            maxWidth: "100%",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BRAND_SRC}
            alt=""
            width={BRAND_W}
            height={BRAND_H}
            decoding="async"
            fetchPriority="high"
            draggable={false}
            sizes="(max-width: 430px) 100vw, 430px"
            className="om-brand-img absolute inset-0 h-full w-full object-contain object-center"
          />
        </div>
      </div>

      {bottomFade && size === "full" && (
        <div className="absolute inset-x-0 bottom-0 h-[22%] bg-black/25" />
      )}
    </div>
  );
}
