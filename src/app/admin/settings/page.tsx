"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
import { SensitivePageGate } from "@/components/admin/sensitive-page-gate";
import { withSensitivePassword } from "@/components/admin/sensitive-unlock";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import type { AppConfig } from "@/lib/app-config";

export default function AdminSettingsPage() {
  const { adminName, ready, api } = useAdminGate();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = await api<{ config: AppConfig }>("/api/admin/settings");
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setConfig(res.data.config);
    })();
  }, [ready, api]);

  async function save() {
    if (!config) return;
    setMsg(null);
    setError(null);
    await withSensitivePassword(
      {
        title: "Password required",
        detail: "Enter password to save system settings.",
      },
      async () => {
        setBusy(true);
        try {
          const res = await api<{ config: AppConfig }>("/api/admin/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "app", value: config.app }),
          });
          if (!res.ok) {
            setError(res.message);
            return;
          }
          setConfig(res.data.config);
          setMsg("App settings saved — frontend will pick them up.");
        } finally {
          setBusy(false);
        }
      }
    );
  }

  const app = config?.app;

  return (
    <AdminShell adminName={adminName}>
      <SensitivePageGate pageName="Settings">
      <h1 className="om-admin-h1">App settings</h1>
      <p className="om-admin-sub">
        Global app settings stored in Supabase. Changes here control the live Ona app (fees, features, copy).
      </p>

      <AdminGuideBanner pageId="settings" />

      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}

      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <strong>General</strong>
          <button
            type="button"
            className="om-admin-btn"
            disabled={busy || !app}
            onClick={save}
            style={{ marginLeft: "auto" }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        <div style={{ padding: "1rem" }}>
          {!app ? (
            <p className="om-admin-muted">Loading…</p>
          ) : (
            <div className="om-admin-form" style={{ maxWidth: "none", border: 0, boxShadow: "none", padding: 0, background: "transparent" }}>
              <label>
                App name
                <input
                  value={app.name}
                  onChange={(e) =>
                    setConfig({
                      ...config!,
                      app: { ...app, name: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                Tagline
                <input
                  value={app.tagline}
                  onChange={(e) =>
                    setConfig({
                      ...config!,
                      app: { ...app, tagline: e.target.value },
                    })
                  }
                />
              </label>
              <div className="om-admin-grid-2">
                <label>
                  Support email
                  <input
                    type="email"
                    value={app.supportEmail}
                    onChange={(e) =>
                      setConfig({
                        ...config!,
                        app: { ...app, supportEmail: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  Support phone
                  <input
                    value={app.supportPhone}
                    onChange={(e) =>
                      setConfig({
                        ...config!,
                        app: { ...app, supportPhone: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Default theme
                <select
                  value={app.defaultTheme}
                  onChange={(e) =>
                    setConfig({
                      ...config!,
                      app: {
                        ...app,
                        defaultTheme: e.target.value as "light" | "dark",
                      },
                    })
                  }
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label>
                Force theme (optional)
                <select
                  value={app.forceTheme ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config!,
                      app: {
                        ...app,
                        forceTheme: (e.target.value || null) as
                          | "light"
                          | "dark"
                          | null,
                      },
                    })
                  }
                >
                  <option value="">User choice</option>
                  <option value="light">Force light</option>
                  <option value="dark">Force dark</option>
                </select>
              </label>
              <label className="om-admin-switch">
                <input
                  type="checkbox"
                  checked={app.maintenanceMode}
                  onChange={(e) =>
                    setConfig({
                      ...config!,
                      app: { ...app, maintenanceMode: e.target.checked },
                    })
                  }
                />
                Maintenance mode (blocks public app usage)
              </label>
              <label>
                Maintenance message
                <textarea
                  value={app.maintenanceMessage}
                  onChange={(e) =>
                    setConfig({
                      ...config!,
                      app: { ...app, maintenanceMessage: e.target.value },
                    })
                  }
                />
              </label>
            </div>
          )}
        </div>
      </div>
      </SensitivePageGate>
    </AdminShell>
  );
}
