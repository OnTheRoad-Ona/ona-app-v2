/**
 * Best-effort pay-flow telemetry.
 *
 * "Pay now to book not clicking" is a silent failure: the button renders but
 * `startPay` bounces to the "expired" screen, or the Pay button is disabled by
 * a gate the user never sees. Each gate below logs which one tripped so we can
 * pin the exact branch (see src/app/payments/checkout/page.tsx).
 *
 * Fire-and-forget: never throws, never blocks the UI.
 */

export type PayGate =
  | "job-missing"
  | "already-paid"
  | "not-payable"
  | "no-email"
  | "no-payer-id"
  | "wrong-motorist"
  | "pay-start-failed"
  | "pay-disabled-render"
  | "pay-cta-tapped"
  | "pay-cancel-tapped"
  | "busy-stuck";

export async function logPayGate(
  gate: PayGate,
  detail?: Record<string, unknown>
): Promise<void> {
  const metadata: Record<string, unknown> = {
    gate,
    pathname:
      typeof window !== "undefined" ? window.location.pathname : undefined,
    ...detail,
  };
  try {
    console.warn("[pay-gate]", gate, metadata);
  } catch {
    /* noop */
  }
  try {
    await fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "API Error",
        severity: "warning",
        message: `pay-gate:${gate}`,
        source: "frontend",
        metadata,
      }),
    }).catch(() => null);
  } catch {
    /* noop */
  }
}