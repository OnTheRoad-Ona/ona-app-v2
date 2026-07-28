/**
 * Flutterwave Inline v3 — payment modal on the Ona page.
 *
 * HARD RULES:
 *  - Never navigate the browser to Flutterwave hosted pay (separate page / 503 nginx).
 *  - Do not set redirect_url (that forces a full leave after bank transfer).
 *  - Use callback + onclose only so the customer stays in Ona.
 */

export type FlutterwaveInlineInput = {
  publicKey: string;
  txRef: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  paymentOptions?: string;
  meta?: Record<string, unknown>;
  onComplete?: (data: {
    status?: string;
    transaction_id?: string | number;
    tx_ref?: string;
  }) => void;
  onClose?: () => void;
};

type FwCheckoutFn = (opts: Record<string, unknown>) => void;

declare global {
  interface Window {
    FlutterwaveCheckout?: FwCheckoutFn;
  }
}

const SCRIPT_SRC = "https://checkout.flutterwave.com/v3.js";
const SCRIPT_TIMEOUT_MS = 12_000;

let scriptPromise: Promise<boolean> | null = null;

export function loadFlutterwaveInlineScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (typeof window.FlutterwaveCheckout === "function") {
    return Promise.resolve(true);
  }
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const done = (ok: boolean) => {
      if (!ok) scriptPromise = null; // allow retry after failure
      resolve(ok);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-ona-flw="1"]'
    );
    if (existing) {
      if (typeof window.FlutterwaveCheckout === "function") {
        done(true);
        return;
      }
      const t = window.setTimeout(() => done(false), SCRIPT_TIMEOUT_MS);
      existing.addEventListener("load", () => {
        window.clearTimeout(t);
        done(typeof window.FlutterwaveCheckout === "function");
      });
      existing.addEventListener("error", () => {
        window.clearTimeout(t);
        existing.remove();
        done(false);
      });
      return;
    }

    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.dataset.onaFlw = "1";
    const t = window.setTimeout(() => {
      s.remove();
      done(false);
    }, SCRIPT_TIMEOUT_MS);
    s.onload = () => {
      window.clearTimeout(t);
      done(typeof window.FlutterwaveCheckout === "function");
    };
    s.onerror = () => {
      window.clearTimeout(t);
      s.remove();
      done(false);
    };
    document.body.appendChild(s);
  });

  return scriptPromise;
}

/**
 * Open Flutterwave modal on top of the current Ona page.
 * Never leaves the Ona origin.
 */
export async function openFlutterwaveInline(
  input: FlutterwaveInlineInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = (input.publicKey || "").trim();
  if (!key) {
    return {
      ok: false,
      error:
        "Flutterwave public key missing. Set NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY on the server.",
    };
  }
  if (!key.startsWith("FLWPUBK")) {
    return {
      ok: false,
      error: "Invalid Flutterwave public key (must start with FLWPUBK).",
    };
  }

  const loaded = await loadFlutterwaveInlineScript();
  if (!loaded || typeof window.FlutterwaveCheckout !== "function") {
    return {
      ok: false,
      error:
        "Could not load Flutterwave (network or 503). Stay on Ona and tap Pay again — we will not leave this page.",
    };
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Invalid payment amount" };
  }

  const phone = (input.customerPhone || "")
    .replace(/\s+/g, "")
    .replace(/^\+/, "");
  // Flutterwave NG prefers local format; fall back if empty
  const phoneNumber =
    phone.length >= 10 ? phone : "08000000000";

  try {
    // Intentionally NO redirect_url — keeps bank transfer UI in the modal
    // and prevents full-page hop to checkout.flutterwave.com (nginx 503s).
    window.FlutterwaveCheckout({
      public_key: key,
      tx_ref: input.txRef,
      amount,
      currency: (input.currency || "NGN").toUpperCase(),
      payment_options: input.paymentOptions || "banktransfer",
      customer: {
        email: input.customerEmail,
        name:
          (input.customerName || "").trim() ||
          input.customerEmail.split("@")[0] ||
          "Customer",
        phone_number: phoneNumber,
      },
      customizations: {
        title: "Ona",
        description: "Labour / service fee escrow",
        logo: undefined,
      },
      meta: {
        ...(input.meta || {}),
        labourOnly: true,
        source: "ona_inline",
      },
      callback: (data: {
        status?: string;
        transaction_id?: string | number;
        tx_ref?: string;
      }) => {
        // Keep user on Ona; parent verifies + routes to job
        try {
          input.onComplete?.(data);
        } catch {
          /* */
        }
      },
      onclose: () => {
        try {
          input.onClose?.();
        } catch {
          /* */
        }
      },
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Flutterwave open failed",
    };
  }
}

/** Client-side public key from build env (may be empty if not set at build). */
export function flutterwavePublicKey(): string {
  return (process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY || "").trim();
}

/** Preload script early (call on checkout mount). */
export function preloadFlutterwaveInline(): void {
  if (typeof window === "undefined") return;
  void loadFlutterwaveInlineScript();
}
