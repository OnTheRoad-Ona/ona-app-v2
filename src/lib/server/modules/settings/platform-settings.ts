/**
 * Platform settings + feature flags (Postgres).
 */

import { createServiceSupabase } from "@/lib/supabase/server";

export async function getAppSetting<T = Record<string, unknown>>(
  key: string,
): Promise<T | null> {
  try {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return data.value as T;
  } catch {
    return null;
  }
}

export async function isFeatureEnabled(key: string): Promise<boolean> {
  try {
    const supabase = createServiceSupabase();
    const { data } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();
    return Boolean(data?.enabled);
  } catch {
    return false;
  }
}

/** Flutterwave is platform default when settings missing */
export async function getDefaultPaymentProvider(): Promise<string> {
  const payments = await getAppSetting<{ defaultProvider?: string }>(
    "payments",
  );
  return (
    payments?.defaultProvider ||
    process.env.PAYMENT_PROVIDER ||
    "flutterwave"
  ).toLowerCase();
}
