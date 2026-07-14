import { createServiceSupabase } from "@/lib/supabase/server";
import {
  APP_SETTING_KEYS,
  DEFAULT_APP_CONFIG,
  mergeConfig,
  type AppConfig,
  type AppSettingKey,
} from "@/lib/app-config";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export async function loadAppConfig(): Promise<AppConfig> {
  if (!isSupabaseAdminConfigured()) {
    return structuredClone(DEFAULT_APP_CONFIG);
  }
  try {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [...APP_SETTING_KEYS]);
    if (error || !data) return structuredClone(DEFAULT_APP_CONFIG);
    return mergeConfig(data);
  } catch {
    return structuredClone(DEFAULT_APP_CONFIG);
  }
}

export async function saveAppConfigSection(
  key: AppSettingKey,
  value: Record<string, unknown>,
  adminId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createServiceSupabase();
  const current = await loadAppConfig();
  const merged = { ...current[key], ...value };

  const { error } = await supabase.from("app_settings").upsert(
    {
      key,
      value: merged,
      updated_at: new Date().toISOString(),
      updated_by: adminId,
    },
    { onConflict: "key" }
  );
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
