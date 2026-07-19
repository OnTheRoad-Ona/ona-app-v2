"use client";

import { useEffect } from "react";
import { BrandHeroMotion } from "@/components/auth/brand-hero-motion";

const SPLASH_MS = 1800;

/**
 * High-res brand still shown during boot / splash,
 * then hands off to home (if signed in) or login.
 */
export function BrandSplashScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onComplete, SPLASH_MS);
    return () => window.clearTimeout(t);
  }, [onComplete]);

  return (
    <div
      className="absolute inset-0 z-[300] overflow-hidden"
      role="dialog"
      aria-label="Ona"
      aria-live="polite"
    >
      <BrandHeroMotion size="splash" bottomFade={false} motion />
    </div>
  );
}
