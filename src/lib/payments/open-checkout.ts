/**
 * Payment checkout open helpers.
 *
 * HARD RULE: never iframe Flutterwave/Paystack hosted pages.
 * They set X-Frame-Options / CSP frame-ancestors → blank white panel, no bank details.
 * Use Inline modal (same page overlay) or full-page hosted link only.
 */

export function isLocalDevHost(hostname?: string): boolean {
  const h =
    hostname ||
    (typeof window !== "undefined" ? window.location.hostname : "");
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h === "[::1]" ||
    h.endsWith(".local")
  );
}

/** Hosted pay pages that refuse to render inside iframes. */
export function isExternalHostedPayUrl(authorizationUrl: string): boolean {
  const url = (authorizationUrl || "").trim();
  if (!url) return false;
  try {
    const u = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "https://local"
    );
    const host = u.hostname.toLowerCase();
    if (typeof window !== "undefined" && u.origin === window.location.origin) {
      return false; // mock / same-origin — iframe OK
    }
    return (
      host.includes("flutterwave") ||
      host.includes("paystack") ||
      host.includes("checkout") ||
      host.endsWith(".com") ||
      host.endsWith(".app")
    );
  } catch {
    return !url.startsWith("/");
  }
}

/**
 * Same-origin mock checkout only — safe to embed.
 * Never returns true for Flutterwave (would blank).
 */
export function canEmbedCheckoutInApp(authorizationUrl: string): boolean {
  const url = (authorizationUrl || "").trim();
  if (!url) return false;
  if (isExternalHostedPayUrl(url)) return false;
  try {
    const u = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    );
    if (typeof window === "undefined") return url.startsWith("/");
    return u.origin === window.location.origin;
  } catch {
    return url.startsWith("/");
  }
}

/**
 * Full-page hosted checkout (bank transfer details always visible).
 * Used when Inline modal cannot open.
 */
export function openHostedCheckout(authorizationUrl: string): void {
  const url = (authorizationUrl || "").trim();
  if (!url || typeof window === "undefined") return;

  try {
    if (window.top && window.top !== window.self) {
      window.top.location.assign(url);
      return;
    }
  } catch {
    /* cross-origin top — fall through */
  }

  try {
    window.location.assign(url);
    return;
  } catch {
    /* */
  }

  window.location.href = url;
}

/** Origin for Flutterwave redirect_url (local + prod). */
export function checkoutReturnOrigin(): string {
  if (typeof window === "undefined") {
    return (
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "http://localhost:3000"
    );
  }
  return window.location.origin;
}
