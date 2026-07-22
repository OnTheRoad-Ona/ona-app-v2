/**
 * Legacy phone OTP verify — forwards to unified /api/auth/otp/verify
 */
import { apiFail, apiOk } from "@/lib/server/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: {
    phone?: string;
    code?: string;
    preferType?: "motorist" | "professional";
  };
  try {
    body = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }
  const origin = new URL(req.url).origin;
  const res = await fetch(`${origin}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channel: "phone",
      target: body.phone || "",
      code: body.code || "",
      preferType: body.preferType,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!json?.ok) {
    return apiFail(
      json?.error?.message || "Could not verify code",
      res.status || 400,
      json?.error?.code || "error"
    );
  }
  return apiOk(json.data);
}
