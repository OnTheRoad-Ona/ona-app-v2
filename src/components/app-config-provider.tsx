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
  DEFAULT_APP_CONFIG,
  setRuntimeAppConfig,
  type AppConfig,
} from "@/lib/app-config";

type Ctx = {
  config: AppConfig;
  ready: boolean;
  refresh: () => Promise<void>;
};

const AppConfigContext = createContext<Ctx>({
  config: DEFAULT_APP_CONFIG,
  ready: true,
  refresh: async () => {},
});

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  // Defaults paint immediately — remote config is deferred (data saver)
  const [ready, setReady] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // Allow browser cache — config rarely changes mid-session
      const res = await fetch("/api/config", { cache: "default" });
      const json = await res.json();
      if (json.ok && json.data?.config) {
        const next: AppConfig = {
          ...DEFAULT_APP_CONFIG,
          ...json.data.config,
          app: { ...DEFAULT_APP_CONFIG.app, ...json.data.config.app },
          features: {
            ...DEFAULT_APP_CONFIG.features,
            ...json.data.config.features,
          },
          matching: {
            ...DEFAULT_APP_CONFIG.matching,
            ...json.data.config.matching,
          },
          verification: {
            ...DEFAULT_APP_CONFIG.verification,
            ...json.data.config.verification,
          },
          content: {
            ...DEFAULT_APP_CONFIG.content,
            ...json.data.config.content,
          },
          services: {
            ...DEFAULT_APP_CONFIG.services,
            ...json.data.config.services,
            // Union defaults + remote so new trades (plumber, solar, …)
            // never disappear when DB still has the old enabled list
            enabled: Array.from(
              new Set([
                ...DEFAULT_APP_CONFIG.services.enabled,
                ...((json.data.config.services?.enabled as string[]) ?? []),
              ])
            ),
          },
        };
        setRuntimeAppConfig(next);
        setConfig(next);
      }
    } catch {
      /* keep defaults offline */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // Defer network until after first paint / idle (splash + login stay light)
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void refresh();
    };
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 4000 });
    } else {
      timeoutId = setTimeout(run, 2500);
    }
    // Config almost never changes — refresh at most every 30 minutes
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    }, 1_800_000);
    return () => {
      cancelled = true;
      if (idleId != null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
      clearInterval(t);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ config, ready, refresh }),
    [config, ready, refresh]
  );

  return (
    <AppConfigContext.Provider value={value}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
