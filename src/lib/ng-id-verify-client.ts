/**
 * Client helpers for Nigeria NIN / BVN verification API routes.
 */

export type NgIdVerifyResponse = {
  ok: boolean;
  provider?: "prembly" | "local";
  mode?: "live" | "sandbox_format";
  message?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  reference?: string;
  code?: string;
};

async function postJson(
  url: string,
  body: Record<string, string>
): Promise<NgIdVerifyResponse> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as NgIdVerifyResponse;
    if (!res.ok && !data.message) {
      return {
        ok: false,
        message: `Verification failed (${res.status}).`,
      };
    }
    return data;
  } catch {
    return { ok: false, message: "Network error during verification." };
  }
}

export function verifyNinApi(nin: string): Promise<NgIdVerifyResponse> {
  return postJson("/api/verify/nin", { nin });
}

export function verifyBvnApi(bvn: string): Promise<NgIdVerifyResponse> {
  return postJson("/api/verify/bvn", { bvn });
}

/**
 * Run optional NIN + BVN API checks before completing signup.
 * Empty fields are skipped (motorist optional).
 */
export async function verifySignupIds(input: {
  nin?: string;
  bvn?: string;
  requireBoth?: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const nin = input.nin?.replace(/\D/g, "") ?? "";
  const bvn = input.bvn?.replace(/\D/g, "") ?? "";

  if (input.requireBoth) {
    if (nin.length !== 11) {
      return { ok: false, message: "NIN must be exactly 11 digits and verified." };
    }
    if (bvn.length !== 11) {
      return { ok: false, message: "BVN must be exactly 11 digits and verified." };
    }
  }

  if (nin) {
    if (nin.length !== 11) {
      return { ok: false, message: "NIN must be exactly 11 digits." };
    }
    const r = await verifyNinApi(nin);
    if (!r.ok) {
      return {
        ok: false,
        message: r.message || "NIN verification failed. Check the number and try again.",
      };
    }
  }

  if (bvn) {
    if (bvn.length !== 11) {
      return { ok: false, message: "BVN must be exactly 11 digits." };
    }
    const r = await verifyBvnApi(bvn);
    if (!r.ok) {
      return {
        ok: false,
        message: r.message || "BVN verification failed. Check the number and try again.",
      };
    }
  }

  return { ok: true };
}
