/**
 * Ona i18n catalog — English master + full-parity locales.
 * Rule: every MessageKey exists in every locale (EN fallback only inside generators).
 */

import type { LocaleCode } from "@/lib/i18n/locales";
import { EN, type MessageDict, type MessageKey } from "./en";
import { AR } from "./ar";
import { ES } from "./es";
import { FR } from "./fr";
import { HA } from "./ha";
import { IG } from "./ig";
import { PCM } from "./pcm";
import { PT } from "./pt";
import { SW } from "./sw";
import { YO } from "./yo";
import { ZH } from "./zh";

export type { MessageDict, MessageKey };
export { EN };

const TABLE: Record<LocaleCode, MessageDict> = {
  en: EN as MessageDict,
  pcm: PCM,
  yo: YO,
  ig: IG,
  ha: HA,
  fr: FR,
  pt: PT,
  ar: AR,
  es: ES,
  sw: SW,
  zh: ZH,
};

/** Dev helper: ensure no locale is missing keys */
export function assertCatalogParity(): string[] {
  const keys = Object.keys(EN) as MessageKey[];
  const issues: string[] = [];
  for (const [code, dict] of Object.entries(TABLE)) {
    for (const k of keys) {
      if (dict[k] == null || dict[k] === "") {
        issues.push(`${code} missing ${String(k)}`);
      }
    }
  }
  return issues;
}

export function translate(
  locale: LocaleCode,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const raw = TABLE[locale]?.[key] ?? EN[key] ?? String(key);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`
  );
}
