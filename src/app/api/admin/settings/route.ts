import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from "@/lib/server/admin-auth";
import {
  loadAppConfig,
  saveAppConfigSection,
} from "@/lib/server/app-config-server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { APP_SETTING_KEYS } from "@/lib/app-config";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const config = await loadAppConfig();
    return apiOk({ config });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load settings", 500);
  }
}

const patchSchema = z.object({
  key: z.enum(APP_SETTING_KEYS),
  value: z.record(z.string(), z.unknown()),
});

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const { session } = await requireAdmin();
    const body = patchSchema.safeParse(await req.json());
    if (!body.success) {
      return apiFail("Invalid settings payload", 400, "validation");
    }
    const result = await saveAppConfigSection(
      body.data.key,
      body.data.value,
      session.userId
    );
    if (!result.ok) return apiFail(result.message, 500);
    await logAdminAction(session.userId, "settings.update", null, {
      key: body.data.key,
      value: body.data.value,
    });
    const config = await loadAppConfig();
    return apiOk({ config });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to save settings", 500);
  }
}
