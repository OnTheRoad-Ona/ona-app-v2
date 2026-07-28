/**
 * Africa's Talking SMS helper
 * Docs: https://developers.africastalking.com/docs/sms/sending/bulk
 *
 * Env:
 *   AT_USERNAME   — sandbox: "sandbox" | production app username
 *   AT_API_KEY    — from Africa's Talking dashboard
 *   AT_SENDER_ID  — optional shortcode / alphanumeric (production)
 *   AT_BASE_URL   — optional override (default production API)
 */

export function isAfricaTalkingConfigured(): boolean {
  return Boolean(
    process.env.AT_API_KEY?.trim() && process.env.AT_USERNAME?.trim()
  );
}

/** Normalize to E.164-ish for AT: +234… */
export function normalizeNgPhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "").trim();
  if (!d) return null;
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (d.startsWith("0") && d.length === 11) d = `+234${d.slice(1)}`;
  if (d.startsWith("234") && !d.startsWith("+")) d = `+${d}`;
  if (!d.startsWith("+") && d.length >= 10) d = `+${d}`;
  // basic length check
  const digits = d.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return d;
}

export async function sendAfricaTalkingSms(input: {
  to: string;
  message: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const apiKey = process.env.AT_API_KEY?.trim();
  const username = process.env.AT_USERNAME?.trim();
  if (!apiKey || !username) {
    return { ok: false, error: "Africa's Talking is not configured" };
  }

  const to = normalizeNgPhone(input.to);
  if (!to) return { ok: false, error: "Invalid phone number" };

  const base =
    process.env.AT_BASE_URL?.trim() ||
    (username === "sandbox"
      ? "https://api.sandbox.africastalking.com"
      : "https://api.africastalking.com");

  const body = new URLSearchParams();
  body.set("username", username);
  body.set("to", to);
  body.set("message", input.message);
  const from = process.env.AT_SENDER_ID?.trim();
  if (from) body.set("from", from);

  try {
    const res = await fetch(`${base}/version1/messaging`, {
      method: "POST",
      headers: {
        ApiKey: apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const text = await res.text();
    let json: {
      SMSMessageData?: {
        Message?: string;
        Recipients?: Array<{ status?: string; messageId?: string; statusCode?: number }>;
      };
      // error shapes
      errorMessage?: string;
      message?: string;
    } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* non-json */
    }

    if (!res.ok) {
      return {
        ok: false,
        error:
          json.errorMessage ||
          json.message ||
          json.SMSMessageData?.Message ||
          `SMS HTTP ${res.status}`,
      };
    }

    const recipients = json.SMSMessageData?.Recipients || [];
    const first = recipients[0];
    // AT statusCode 101 = Success
    if (
      first &&
      first.statusCode != null &&
      first.statusCode !== 101 &&
      first.statusCode !== 100
    ) {
      return {
        ok: false,
        error: first.status || `SMS status ${first.statusCode}`,
      };
    }

    return { ok: true, messageId: first?.messageId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "SMS network error",
    };
  }
}

export async function sendLoginOtpSms(input: {
  to: string;
  code: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const message = `Ona login code: ${input.code}. Valid for 10 minutes. Do not share this code.`;
  return sendAfricaTalkingSms({ to: input.to, message });
}
