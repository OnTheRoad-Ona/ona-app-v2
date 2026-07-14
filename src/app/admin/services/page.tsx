"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import type { AppConfig, ServicesSection } from "@/lib/app-config";
import { PRO_TRADE_OPTIONS } from "@/lib/services";

export default function AdminServicesPage() {
  const { adminName, ready, api } = useAdminGate();
  const [services, setServices] = useState<ServicesSection | null>(null);
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
      setServices(res.data.config.services);
    })();
  }, [ready, api]);

  function toggle(id: string) {
    if (!services) return;
    const on = services.enabled.includes(id);
    setServices({
      ...services,
      enabled: on
        ? services.enabled.filter((x) => x !== id)
        : [...services.enabled, id],
    });
  }

  async function save() {
    if (!services) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    const res = await api<{ config: AppConfig }>("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "services", value: services }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setServices(res.data.config.services);
    setMsg("Service catalog saved.");
  }

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Services catalog</h1>
      <p className="om-admin-sub">
        Enable or disable trades shown on home and Repair Pro signup.
      </p>
      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}

      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <strong>Trades</strong>
          <button
            type="button"
            className="om-admin-btn"
            disabled={busy || !services}
            onClick={save}
            style={{ marginLeft: "auto" }}
          >
            {busy ? "Saving…" : "Save catalog"}
          </button>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Hint</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {!services ? (
              <tr>
                <td colSpan={3} className="om-admin-muted">
                  Loading…
                </td>
              </tr>
            ) : (
              PRO_TRADE_OPTIONS.map((t) => {
                const on = services.enabled.includes(t.id);
                return (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.label}</strong>
                      <div className="om-admin-muted">{t.id}</div>
                    </td>
                    <td className="om-admin-muted">{t.hint}</td>
                    <td>
                      <label className="om-admin-switch">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(t.id)}
                        />
                        {on ? "On" : "Off"}
                      </label>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
