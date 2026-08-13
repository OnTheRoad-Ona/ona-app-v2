"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  getLocaleMeta,
  isLocaleCode,
  LOCALE_STORAGE_KEY,
  type LocaleCode,
} from "@/lib/i18n/locales";
import { translate, loadCatalog, type MessageKey } from "@/lib/i18n/catalog";

type I18nContextValue = {
  locale: LocaleCode;
  setLocale: (code: LocaleCode) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): LocaleCode {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw && isLocaleCode(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);
  /** Bumped when a non-EN catalog chunk lands so children re-render fresh copy */
  const [catalogTick, setCatalogTick] = useState(false);

  useEffect(() => {
    setLocaleState(readStoredLocale());
    setReady(true);
    if (process.env.NODE_ENV === "development") {
      void import("@/lib/i18n/catalog").then(({ assertCatalogParity }) => {
        void assertCatalogParity().then((issues: string[]) => {
          if (issues.length) {
            console.warn(
              `[i18n] ${issues.length} catalog parity issue(s)`,
              issues.slice(0, 8)
            );
          }
        });
      });
    }
  }, []);

  // Lazy-load the active locale's dictionary once, off the critical chunk.
  useEffect(() => {
    if (locale === DEFAULT_LOCALE) return;
    let cancelled = false;
    void loadCatalog(locale).then(() => {
      if (!cancelled) setCatalogTick((v) => !v);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    // Persist to profiles.preferred_locale when signed in
    void (async () => {
      try {
        const { getAppSupabase } = await import("@/lib/supabase/app-client");
        const { backendUpdateProfile } = await import(
          "@/lib/supabase/app-api"
        );
        const sb = getAppSupabase();
        if (!sb) return;
        const session = (await sb.auth.getSession()).data.session;
        if (!session?.access_token) return;
        await backendUpdateProfile(session.access_token, {
          preferredLocale: code,
        });
      } catch {
        /* offline / not configured — localStorage still holds choice */
      }
    })();
  }, []);

  // Hydrate from server preferred_locale when session is available
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const { getAppSupabase } = await import("@/lib/supabase/app-client");
        const sb = getAppSupabase();
        if (!sb) return;
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!session?.user?.id || cancelled) return;
        const { data } = await sb
          .from("profiles")
          .select("preferred_locale")
          .eq("id", session.user.id)
          .maybeSingle();
        const remote = data?.preferred_locale;
        if (
          remote &&
          isLocaleCode(remote) &&
          !cancelled &&
          remote !== readStoredLocale()
        ) {
          // Server wins when set (cross-device continuity)
          setLocaleState(remote);
          try {
            localStorage.setItem(LOCALE_STORAGE_KEY, remote);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const meta = getLocaleMeta(locale);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = meta.htmlLang;
    document.documentElement.dir = meta.dir;
  }, [meta.htmlLang, meta.dir]);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    // catalogTick re-arms t once a lazily-loaded locale chunk lands
    [locale, catalogTick]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      dir: meta.dir,
    }),
    [locale, setLocale, t, meta.dir]
  );

  // Avoid flash of wrong language after hydrate
  if (!ready) {
    return (
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback if used outside provider (SSR edge)
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
      dir: "ltr",
    };
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}
