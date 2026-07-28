"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
import type { AppConfig, MatchingSection, VerificationSection } from "@/lib/app-config";

export default function AdminMatchingPage() {
  const { adminName, ready, api } = useAdminGate();
  const [matching, setMatching] = useState<MatchingSection | null>(null);
  const [verification, setVerification] = useState<VerificationSection | null>(
    null
  );
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
      setMatching(res.data.config.matching);
      setVerification(res.data.config.verification);
    })();
  }, [ready, api]);

  async function save() {
    if (!matching || !verification) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    const a = await api<{ config: AppConfig }>("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "matching", value: matching }),
    });
    if (!a.ok) {
      setBusy(false);
      setError(a.message);
      return;
    }
    const b = await api<{ config: AppConfig }>("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "verification", value: verification }),
    });
    setBusy(false);
    if (!b.ok) {
      setError(b.message);
      return;
    }
    setMatching(b.data.config.matching);
    setVerification(b.data.config.verification);
    setMsg("Matching & verification rules saved.");
  }

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Map & matching</h1>
      <p className="om-admin-sub">
        Map radius and matching rules that decide which pros customers see on the live map.
      </p>

      <AdminGuideBanner pageId="matching" />

      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}

      <div className="om-admin-grid-2">
        <div className="om-admin-panel">
          <div className="om-admin-toolbar">
            <strong>Matching</strong>
          </div>
          <div style={{ padding: "1rem" }}>
            {!matching ? (
              <p className="om-admin-muted">Loading…</p>
            ) : (
              <div
                className="om-admin-form"
                style={{
                  maxWidth: "none",
                  border: 0,
                  boxShadow: "none",
                  padding: 0,
                  background: "transparent",
                }}
              >
                <label>
                  Max search radius (km)
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={matching.maxRadiusKm}
                    onChange={(e) =>
                      setMatching({
                        ...matching,
                        maxRadiusKm: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Default radius (km)
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={matching.defaultRadiusKm}
                    onChange={(e) =>
                      setMatching({
                        ...matching,
                        defaultRadiusKm: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Max technicians shown
                  <input
                    type="number"
                    min={5}
                    max={200}
                    value={matching.maxTechnicians}
                    onChange={(e) =>
                      setMatching({
                        ...matching,
                        maxTechnicians: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Min rating filter (0 = off)
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={matching.minRatingFilter}
                    onChange={(e) =>
                      setMatching({
                        ...matching,
                        minRatingFilter: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="om-admin-panel">
          <div className="om-admin-toolbar">
            <strong>Verification gate</strong>
          </div>
          <div style={{ padding: "1rem" }}>
            {!verification ? (
              <p className="om-admin-muted">Loading…</p>
            ) : (
              <div
                className="om-admin-form"
                style={{
                  maxWidth: "none",
                  border: 0,
                  boxShadow: "none",
                  padding: 0,
                  background: "transparent",
                }}
              >
                <label>
                  Warn from action #
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={verification.warnFrom}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        warnFrom: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Block at action #
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={verification.blockAt}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        blockAt: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="om-admin-switch">
                  <input
                    type="checkbox"
                    checked={verification.requireNin}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        requireNin: e.target.checked,
                      })
                    }
                  />
                  Require NIN
                </label>
                <label className="om-admin-switch">
                  <input
                    type="checkbox"
                    checked={verification.requireBvn}
                    onChange={(e) =>
                      setVerification({
                        ...verification,
                        requireBvn: e.target.checked,
                      })
                    }
                  />
                  Require BVN
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="om-admin-btn"
        disabled={busy || !matching}
        onClick={save}
      >
        {busy ? "Saving…" : "Save matching & verification"}
      </button>
    </AdminShell>
  );
}
