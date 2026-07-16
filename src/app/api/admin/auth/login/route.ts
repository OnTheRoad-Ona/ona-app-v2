import { cookies } from "next/headers";
import { z } from "zod";
import {
  ADMIN_SESSION_COOKIE,
  encodeAdminSession,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured yet. Add project URL + service role key to .env.local",
      503,
      "supabase_not_configured"
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON body", 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiFail("Email and password are required", 400, "validation");
  }

  const { email, password } = parsed.data;
  const supabase = createServiceSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user || !data.session) {
    return apiFail("Invalid email or password", 401, "invalid_credentials");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    const missing =
      profileError.code === "PGRST205" ||
      /Could not find the table/i.test(profileError.message || "");
    return apiFail(
      missing
        ? "Database tables are missing. Run supabase/migrations/20260714_002_bootstrap_idempotent.sql in the Supabase SQL editor, then try again."
        : profileError.message || "Failed to load admin profile",
      503,
      missing ? "schema_missing" : "profile_error"
    );
  }

  if (!profile || profile.role !== "admin" || !profile.is_active) {
    return apiFail(
      "This account is not an active admin. Run npm run db:seed-admin after the SQL migration.",
      403,
      "not_admin"
    );
  }

  const sessionPayload = {
    userId: data.user.id,
    email: data.user.email || email,
    fullName: profile.full_name || "Admin",
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? 0,
  };

  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, encodeAdminSession({
    ...sessionPayload,
    lastActivityAt: Date.now(),
    adminRole:
      (profile as { admin_role?: string }).admin_role === "customer_care"
        ? "customer_care"
        : (profile as { admin_role?: string }).admin_role === "support"
          ? "support"
          : "super_admin",
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8h hard cap; idle timeout still enforced server-side
  });

  return apiOk({
    user: {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      adminRole: (profile as { admin_role?: string }).admin_role || "super_admin",
    },
  });
}
