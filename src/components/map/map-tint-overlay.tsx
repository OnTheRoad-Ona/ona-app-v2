"use client";

/**
 * DISABLED for visibility — home map uses real Google styles only.
 *
 * Previous multiply/color layers made the map dim / unreadable.
 * Component kept as a no-op so imports in track/search maps don't break;
 * they also get full-visibility styled maps via map-theme.ts.
 */

export function MapTintOverlay(_props: { isLight: boolean }) {
  return null;
}
