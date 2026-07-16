"use client";

import { useCallback, useState } from "react";

/**
 * Temporary password gate for sensitive Customer Care actions.
 * Default password: 336699 (or ADMIN_SENSITIVE_PASSWORD on server).
 */
export function SensitiveUnlockBar({
  unlocked,
  expiresAt,
  onChange,
}: {
  unlocked: boolean;
  expiresAt: number | null;
  onChange: (state: { unlocked: boolean; expiresAt: number | null }) => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unlock = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/care/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.error?.message || "Unlock failed");
        return;
      }
      setPassword("");
      onChange({
        unlocked: true,
        expiresAt: json.data.expiresAt ?? null,
      });
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }, [password, onChange]);

  const lock = useCallback(async () => {
    await fetch("/api/admin/care/unlock", { method: "DELETE" });
    onChange({ unlocked: false, expiresAt: null });
  }, [onChange]);

  const minsLeft =
    unlocked && expiresAt
      ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000))
      : 0;

  return (
    <div
      className="om-admin-panel"
      style={{
        marginBottom: "1rem",
        borderColor: unlocked ? "var(--om-success)" : "var(--om-warn)",
        background: unlocked ? "var(--om-success-bg)" : "var(--om-warn-bg)",
      }}
    >
      <div className="om-admin-toolbar" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <strong>
            {unlocked
              ? `Sensitive mode ON · ~${minsLeft} min left`
              : "Sensitive actions locked"}
          </strong>
          <p className="om-admin-muted" style={{ margin: "0.25rem 0 0" }}>
            Escrow release/refund · freeze user · dispute decision · NIN/BVN ·
            settings require temporary password{" "}
            <code style={{ fontWeight: 700 }}>336699</code>
          </p>
        </div>
        {unlocked ? (
          <button type="button" className="om-admin-btn ghost" onClick={lock}>
            Lock now
          </button>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="password"
              className="om-admin-input"
              placeholder="Temp password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void unlock();
              }}
              style={{ width: 140 }}
              autoComplete="off"
            />
            <button
              type="button"
              className="om-admin-btn primary"
              disabled={busy || !password}
              onClick={() => void unlock()}
            >
              {busy ? "…" : "Unlock"}
            </button>
          </div>
        )}
      </div>
      {err ? <div className="om-admin-error" style={{ marginTop: "0.5rem" }}>{err}</div> : null}
    </div>
  );
}

/** Prompt for password if locked, then run action */
export async function withSensitiveAction(
  unlocked: boolean,
  run: () => Promise<void>,
  requestUnlock: () => void
): Promise<void> {
  if (!unlocked) {
    requestUnlock();
    return;
  }
  await run();
}
