/**
 * Prembly (IdentityPass) Nigeria NIN + BVN verification.
 * Keys: PREMBLY_API_KEY (x-api-key), optional PREMBLY_APP_ID, optional PREMBLY_BASE_URL.
 *
 * Docs:
 * - NIN: POST /verification/vnin  body: { number_nin }
 * - BVN: POST /verification/bvn   body: { number }
 */

const DEFAULT_BASE = "https://api.prembly.com";

export type PremblyVerifyOk = {
  ok: true;
  provider: "prembly" | "local";
  mode: "live" | "sandbox_format";
  reference?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  rawStatus?: string;
};

export type PremblyVerifyFail = {
  ok: false;
  provider: "prembly" | "local";
  mode: "live" | "sandbox_format";
  message: string;
  code?: string;
};

export type PremblyVerifyResult = PremblyVerifyOk | PremblyVerifyFail;

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

function premblyConfig() {
  const apiKey =
    process.env.PREMBLY_API_KEY?.trim() ||
    process.env.IDENTITYPASS_API_KEY?.trim() ||
    "";
  const appId =
    process.env.PREMBLY_APP_ID?.trim() ||
    process.env.IDENTITYPASS_APP_ID?.trim() ||
    "";
  const baseUrl = (
    process.env.PREMBLY_BASE_URL?.trim() || DEFAULT_BASE
  ).replace(/\/$/, "");
  return { apiKey, appId, baseUrl, configured: Boolean(apiKey) };
}

function headers(apiKey: string, appId: string): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-key": apiKey,
  };
  if (appId) h["app-id"] = appId;
  return h;
}

function pickName(data: Record<string, unknown> | undefined): {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
} {
  if (!data) return {};
  const first =
    (data.firstname as string) ||
    (data.first_name as string) ||
    (data.firstName as string) ||
    "";
  const last =
    (data.surname as string) ||
    (data.last_name as string) ||
    (data.lastName as string) ||
    "";
  const mid = (data.middlename as string) || (data.middle_name as string) || "";
  const phone =
    (data.telephoneno as string) ||
    (data.phone as string) ||
    (data.phoneNumber as string) ||
    undefined;
  const parts = [first, mid, last].map((s) => s.trim()).filter(Boolean);
  return {
    firstName: first || undefined,
    lastName: last || undefined,
    fullName: parts.length ? parts.join(" ") : undefined,
    phone,
  };
}

function isSuccessBody(json: Record<string, unknown>): boolean {
  if (
    json.status === true ||
    json.status === "success" ||
    json.status === "SUCCESS"
  )
    return true;
  const verification = json.verification as Record<string, unknown> | undefined;
  if (
    verification?.status === "VERIFIED" ||
    verification?.status === "verified"
  )
    return true;
  const code = String(json.response_code ?? json.responseCode ?? "");
  if (code === "00" || code === "0") return true;
  return false;
}

/**
 * Local format-only check used when Prembly keys are not configured.
 * Keeps signup usable in development without live NIMC/NIBSS calls.
 */
function localFormatCheck(
  kind: "nin" | "bvn",
  number: string,
): PremblyVerifyResult {
  const d = digitsOnly(number);
  if (d.length !== 11) {
    return {
      ok: false,
      provider: "local",
      mode: "sandbox_format",
      message: `${kind.toUpperCase()} must be exactly 11 digits.`,
      code: "FORMAT",
    };
  }
  // Reject obviously fake all-same-digit strings in local mode
  if (/^(\d)\1{10}$/.test(d)) {
    return {
      ok: false,
      provider: "local",
      mode: "sandbox_format",
      message: `Enter a valid ${kind.toUpperCase()} (not all identical digits).`,
      code: "FORMAT",
    };
  }
  return {
    ok: true,
    provider: "local",
    mode: "sandbox_format",
    reference: `local-${kind}-${d.slice(-4)}`,
    rawStatus: "FORMAT_OK",
  };
}

export async function verifyNinWithPrembly(
  nin: string,
): Promise<PremblyVerifyResult> {
  const d = digitsOnly(nin);
  if (d.length !== 11) {
    return {
      ok: false,
      provider: "local",
      mode: "sandbox_format",
      message: "NIN must be exactly 11 digits.",
      code: "FORMAT",
    };
  }

  const { apiKey, appId, baseUrl, configured } = premblyConfig();
  if (!configured) return localFormatCheck("nin", d);

  try {
    // Prefer classic NIN endpoint; fall back to vNIN body shape if needed
    const url = `${baseUrl}/verification/nin`;
    const res = await fetch(url, {
      method: "POST",
      headers: headers(apiKey, appId),
      body: JSON.stringify({ number: d }),
      cache: "no-store",
    });

    let json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    // Some tenants use /verification/vnin with number_nin
    if (!res.ok || !isSuccessBody(json)) {
      const res2 = await fetch(`${baseUrl}/verification/vnin`, {
        method: "POST",
        headers: headers(apiKey, appId),
        body: JSON.stringify({ number_nin: d }),
        cache: "no-store",
      });
      json = (await res2.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res2.ok && !isSuccessBody(json)) {
        const msg =
          (json.detail as string) ||
          (json.message as string) ||
          (json.error as string) ||
          `NIN verification failed (${res2.status || res.status}).`;
        return {
          ok: false,
          provider: "prembly",
          mode: "live",
          message: msg,
          code: String(json.response_code ?? res2.status),
        };
      }
    }

    if (!isSuccessBody(json)) {
      return {
        ok: false,
        provider: "prembly",
        mode: "live",
        message:
          (json.detail as string) ||
          (json.message as string) ||
          "NIN could not be verified.",
        code: String(json.response_code ?? ""),
      };
    }

    const data =
      (json.nin_data as Record<string, unknown>) ||
      (json.data as Record<string, unknown>) ||
      undefined;
    const names = pickName(data);
    const verification = json.verification as
      Record<string, unknown> | undefined;

    return {
      ok: true,
      provider: "prembly",
      mode: "live",
      reference: String(verification?.reference ?? json.reference ?? ""),
      ...names,
      rawStatus: String(verification?.status ?? "VERIFIED"),
    };
  } catch (e) {
    return {
      ok: false,
      provider: "prembly",
      mode: "live",
      message:
        e instanceof Error
          ? `NIN verification error: ${e.message}`
          : "NIN verification network error.",
      code: "NETWORK",
    };
  }
}

export async function verifyBvnWithPrembly(
  bvn: string,
): Promise<PremblyVerifyResult> {
  const d = digitsOnly(bvn);
  if (d.length !== 11) {
    return {
      ok: false,
      provider: "local",
      mode: "sandbox_format",
      message: "BVN must be exactly 11 digits.",
      code: "FORMAT",
    };
  }

  const { apiKey, appId, baseUrl, configured } = premblyConfig();
  if (!configured) return localFormatCheck("bvn", d);

  try {
    const attempts: { path: string; body: Record<string, string> }[] = [
      { path: "/verification/bvn", body: { number: d } },
      { path: "/verification/bvn_validation", body: { number: d } },
    ];

    let lastJson: Record<string, unknown> = {};
    let lastStatus = 0;

    for (const attempt of attempts) {
      const res = await fetch(`${baseUrl}${attempt.path}`, {
        method: "POST",
        headers: headers(apiKey, appId),
        body: JSON.stringify(attempt.body),
        cache: "no-store",
      });
      lastStatus = res.status;
      lastJson = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (res.ok && isSuccessBody(lastJson)) break;
    }

    if (!isSuccessBody(lastJson)) {
      return {
        ok: false,
        provider: "prembly",
        mode: "live",
        message:
          (lastJson.detail as string) ||
          (lastJson.message as string) ||
          (lastJson.error as string) ||
          `BVN verification failed (${lastStatus}).`,
        code: String(lastJson.response_code ?? lastStatus),
      };
    }

    const data = (lastJson.data as Record<string, unknown>) || lastJson;
    const names = pickName(data as Record<string, unknown>);
    const verification = lastJson.verification as
      Record<string, unknown> | undefined;

    return {
      ok: true,
      provider: "prembly",
      mode: "live",
      reference: String(verification?.reference ?? lastJson.reference ?? ""),
      ...names,
      rawStatus: String(verification?.status ?? "VERIFIED"),
    };
  } catch (e) {
    return {
      ok: false,
      provider: "prembly",
      mode: "live",
      message:
        e instanceof Error
          ? `BVN verification error: ${e.message}`
          : "BVN verification network error.",
      code: "NETWORK",
    };
  }
}

export function isPremblyConfigured(): boolean {
  return premblyConfig().configured;
}
