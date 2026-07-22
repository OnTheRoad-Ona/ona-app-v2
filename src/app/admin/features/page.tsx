"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SensitivePageGate } from "@/components/admin/sensitive-page-gate";
import { withSensitivePassword } from "@/components/admin/sensitive-unlock";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import type { AppConfig, FeaturesSection } from "@/lib/app-config";

const FLAGS: { key: keyof FeaturesSection; label: string; help: string }[] = [
  {
    key: "signupMotorist",
    label: "Customer signup",
    help: "Allow new vehicle-owner accounts",
  },
  {
    key: "signupPro",
    label: "Repair Pro signup",
    help: "Allow new professional accounts",
  },
  {
    key: "mapsLive",
    label: "Live Google Maps",
    help: "Use live map tiles when API key is set",
  },
  {
    key: "paymentsEnabled",
    label: "Payments",
    help: "Show payment flows in the app",
  },
  {
    key: "chatEnabled",
    label: "Messages / chat",
    help: "Enable motorist ↔ pro messaging",
  },
  {
    key: "reviewsEnabled",
    label: "Reviews",
    help: "Allow ratings after completed jobs",
  },
  {
    key: "bookingsEnabled",
    label: "Bookings",
    help: "Show bookings history screens",
  },
  {
    key: "proOnlineToggle",
    label: "Pro online toggle",
    help: "Pros can go online/offline on dashboard",
  },
  {
    key: "identityVerifyEnabled",
    label: "Identity verification",
    help: "NIN/BVN gate after free trial actions",
  },
];

export default function AdminFeaturesPage() {
  const { adminName, ready, api } = useAdminGate();
  const [features, setFeatures] = useState<FeaturesSection | null>(null);
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
      setFeatures(res.data.config.features);
    })();
  }, [ready, api]);

  async function save() {
    if (!features) return;
    setMsg(null);
    setError(null);
    await withSensitivePassword(
      {
        title: "Password required",
        detail: "Enter password to save feature flags.",
      },
      async () => {
        setBusy(true);
        try {
          const res = await api<{ config: AppConfig }>("/api/admin/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "features", value: features }),
          });
          if (!res.ok) {
            setError(res.message);
            return;
          }
          setFeatures(res.data.config.features);
          setMsg("Feature flags saved.");
        } finally {
          setBusy(false);
        }
      }
    );
  }

  return (
    <AdminShell adminName={adminName}>
      <SensitivePageGate pageName="Features">
      <h1 className="om-admin-h1">Feature flags</h1>
      <p className="om-admin-sub">
        Feature flags for the live app. Turn modules on/off without a redeploy (Super Admin).
      </p>
      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}

      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <strong>Switches</strong>
          <button
            type="button"
            className="om-admin-btn"
            disabled={busy || !features}
            onClick={save}
            style={{ marginLeft: "auto" }}
          >
            {busy ? "Saving…" : "Save flags"}
          </button>
        </div>
        <div style={{ padding: "0.5rem 1rem 1rem" }}>
          {!features ? (
            <p className="om-admin-muted">Loading…</p>
          ) : (
            FLAGS.map((f) => (
              <label
                key={f.key}
                className="om-admin-switch"
                style={{
                  display: "flex",
                  padding: "0.75rem 0",
                  borderBottom: "1px solid var(--om-border-soft)",
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(features[f.key])}
                  onChange={(e) =>
                    setFeatures({ ...features, [f.key]: e.target.checked })
                  }
                />
                <span>
                  {f.label}
                  <small
                    className="om-admin-muted"
                    style={{ display: "block", fontWeight: 500 }}
                  >
                    {f.help}
                  </small>
                </span>
              </label>
            ))
          )}
        </div>
      </div>
      </SensitivePageGate>
    </AdminShell>
  );
}
