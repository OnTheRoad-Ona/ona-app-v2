/**
 * Brand assets for OgaMecho.
 * Default avatar: gear ring sits edge-to-edge in a square (no orange padding).
 * Use object-cover in a circular frame so the ring fills the profile hole.
 * Cache-bust query forces CDN/clients to load the latest crop.
 */
export const DEFAULT_VENDOR_PHOTO = "/brand/default-pro-avatar.png?v=7";

/** No fill behind default — image already fills the circle (transparent not needed). */
export const DEFAULT_VENDOR_PHOTO_BG = "transparent";

/** Full-bleed intro / auth hero art (not for small circular avatars). */
export const BRAND_HERO_PHOTO = "/brand/auth-bg-v31.jpg";
/** Same asset — boot / intro still */
export const ONA_INTRO_IMAGE = "/brand/ona-intro-v1.jpg";

/** Initials for avatar fallback rings (e.g. "Oluwatosin Olanrewaju" → "OO"). */
export function avatarInitials(
  name: string | null | undefined,
  fallback = "OM"
): string {
  const parts = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/** Short list label from a full name (first word, max 12 chars). */
export function shortDisplayName(
  name: string | null | undefined,
  fallback = "Pro"
): string {
  const n = (name || "").trim();
  if (!n) return fallback;
  const first = n.split(/\s+/)[0] || n;
  return first.slice(0, 12);
}
