/**
 * App languages English default.
 * Phone-country is separate; this is UI language preference.
 */

export type LocaleCode =
  "en" | "yo" | "ig" | "ha" | "fr" | "pt" | "ar" | "es" | "sw" | "pcm" | "zh";

export type LocaleMeta = {
  code: LocaleCode;
  /** English label */
  name: string;
  /** Name in that language */
  nativeName: string;
  /** BCP 47 for html lang */
  htmlLang: string;
  dir: "ltr" | "rtl";
};

export const LOCALES: LocaleMeta[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    htmlLang: "en",
    dir: "ltr",
  },
  {
    code: "pcm",
    name: "Nigerian Pidgin",
    nativeName: "Naija Pidgin",
    htmlLang: "pcm",
    dir: "ltr",
  },
  {
    code: "yo",
    name: "Yoruba",
    nativeName: "Yorùbá",
    htmlLang: "yo",
    dir: "ltr",
  },
  { code: "ig", name: "Igbo", nativeName: "Igbo", htmlLang: "ig", dir: "ltr" },
  {
    code: "ha",
    name: "Hausa",
    nativeName: "Hausa",
    htmlLang: "ha",
    dir: "ltr",
  },
  {
    code: "fr",
    name: "French",
    nativeName: "Français",
    htmlLang: "fr",
    dir: "ltr",
  },
  {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    htmlLang: "pt",
    dir: "ltr",
  },
  {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    htmlLang: "ar",
    dir: "rtl",
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    htmlLang: "es",
    dir: "ltr",
  },
  {
    code: "sw",
    name: "Swahili",
    nativeName: "Kiswahili",
    htmlLang: "sw",
    dir: "ltr",
  },
  {
    code: "zh",
    name: "Chinese",
    nativeName: "中文",
    htmlLang: "zh-Hans",
    dir: "ltr",
  },
];

export const DEFAULT_LOCALE: LocaleCode = "en";
export const LOCALE_STORAGE_KEY = "ona-app-locale";

export function isLocaleCode(v: string): v is LocaleCode {
  return LOCALES.some((l) => l.code === v);
}

export function getLocaleMeta(code: LocaleCode): LocaleMeta {
  return LOCALES.find((l) => l.code === code) || LOCALES[0]!;
}
