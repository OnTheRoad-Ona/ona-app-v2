/**
 * Ona i18n catalog — English master + full-parity locales.
 * English is loaded eagerly (default + fallback); every other locale is a
 * small chunk fetched only when actually used (data saver — keeps ~170KB of
 * translations out of the critical first-load bundle).
 * Rule: every MessageKey exists in every locale (EN fallback inside translate).
 */

import type { LocaleCode } from "@/lib/i18n/locales";
import { EN, type MessageDict, type MessageKey } from "./en";

export type { MessageDict, MessageKey };
export { EN };

/** Runtime registry of loaded locale dictionaries (EN is always present). */
const registry: Partial<Record<LocaleCode, MessageDict>> = {
  en: EN as MessageDict,
};

/** Register a fully-loaded locale dictionary (used by loadCatalog). */
export function registerCatalog(code: LocaleCode, dict: MessageDict): void {
  registry[code] = dict;
}

const importers: Record<LocaleCode, () => Promise<MessageDict>> = {
  en: async () => EN as MessageDict,
  pcm: () => import("./pcm").then((m) => m.PCM),
  yo: () => import("./yo").then((m) => m.YO),
  ig: () => import("./ig").then((m) => m.IG),
  ha: () => import("./ha").then((m) => m.HA),
  fr: () => import("./fr").then((m) => m.FR),
  pt: () => import("./pt").then((m) => m.PT),
  ar: () => import("./ar").then((m) => m.AR),
  es: () => import("./es").then((m) => m.ES),
  sw: () => import("./sw").then((m) => m.SW),
  zh: () => import("./zh").then((m) => m.ZH),
};

/** Load (and cache) a locale dictionary. Idempotent, safe to call in parallel. */
export async function loadCatalog(code: LocaleCode): Promise<void> {
  if (registry[code]) return;
  const dict = await importers[code]();
  registry[code] = dict;
}

export function translate(
  locale: LocaleCode,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const raw = registry[locale]?.[key] ?? EN[key] ?? String(key);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`
  );
}

/** Dev helper: ensure no locale is missing keys (loads every locale first). */
export async function assertCatalogParity(): Promise<string[]> {
  await Promise.all((Object.keys(importers) as LocaleCode[]).map(loadCatalog));
  const keys = Object.keys(EN) as MessageKey[];
  const issues: string[] = [];
  for (const [code, dict] of Object.entries(registry)) {
    if (code === "en") continue;
    for (const k of keys) {
      if (dict?.[k] == null || dict[k] === "") {
        issues.push(`${code} missing ${String(k)}`);
      }
    }
  }
  return issues;
}