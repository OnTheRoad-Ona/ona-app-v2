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
  ready: false,
  refresh: async () => {},
});

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
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
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
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
