/**
 * Resend email helper (free tier: https://resend.com)
 * Env: RESEND_API_KEY, RESEND_FROM_EMAIL (e.g. Ona <onboarding@resend.dev>)
 */

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function getResendFrom(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Ona <onboarding@resend.dev>"
  );
}

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getResendFrom(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: json.message || json.name || `Resend HTTP ${res.status}`,
      };
    }
    return { ok: true, id: json.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Resend network error",
    };
  }
}

/** Registration confirmation email after successful server signup */
export async function sendSignupConfirmationEmail(input: {
  to: string;
  fullName: string;
  accountType: "motorist" | "professional";
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const roleLabel =
    input.accountType === "professional" ? "Repair Pro" : "Customer";
  const first = input.fullName.trim().split(/\s+/)[0] || "there";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://ona-mi.vercel.app";

  const subject = `Welcome to Ona — your ${roleLabel} account is ready`;
  const text = [
    `Hi ${first},`,
    ``,
    `Your Ona ${roleLabel} account is registered and saved on our servers.`,
    ``,
    `Log in: ${appUrl}/login/signin`,
    ``,
    `If you did not create this account, contact support@ona.com.`,
    ``,
    `— Ona`,
  ].join("\n");

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:22px;font-weight:800;margin:0 0 4px">
      <span style="color:#FF6B35">Oga</span>Mecho
    </p>
    <p style="color:#64748b;margin:0 0 20px;font-size:13px">Roadside help when you need it</p>
    <h1 style="font-size:18px;margin:0 0 12px">Account confirmed</h1>
    <p style="font-size:14px;line-height:1.5;margin:0 0 12px">Hi ${escapeHtml(first)},</p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 12px">
      Your <strong>${roleLabel}</strong> account is registered on Ona and will appear in our admin systems.
    </p>
    <p style="margin:20px 0">
      <a href="${appUrl}/login/signin"
         style="display:inline-block;background:#323231;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:14px">
        Log in to Ona
      </a>
    </p>
    <p style="font-size:12px;color:#64748b;line-height:1.4">
      If you did not create this account, ignore this email or contact support@ona.com.
    </p>
  </div>`;

  return sendResendEmail({ to: input.to, subject, html, text });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
