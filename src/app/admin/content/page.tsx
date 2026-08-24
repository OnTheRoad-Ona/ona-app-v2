"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
import type { AppConfig, ContentSection, MenuItemOverride } from "@/lib/app-config";
import { NAV_SCHEMA } from "@/lib/nav-schema";

export default function AdminContentPage() {
  const { adminName, adminRole, ready, api } = useAdminGate();
  const [content, setContent] = useState<ContentSection | null>(null);
  const [problemsText, setProblemsText] = useState("");
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
      const c = res.data.config.content;
      setContent(c);
      setProblemsText((c.requestProblems ?? []).join("\n"));
    })();
  }, [ready, api]);

  async function save() {
    if (!content) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    const requestProblems = problemsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const value = { ...content, requestProblems };
    const res = await api<{ config: AppConfig }>("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "content", value }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setContent(res.data.config.content);
    setProblemsText(res.data.config.content.requestProblems.join("\n"));
    setMsg("Content saved request flow & home copy update.");
  }

  return (
    <AdminShell adminName={adminName} adminRole={adminRole}>
      <h1 className="om-admin-h1">Content, menus & copy</h1>
      <p className="om-admin-sub">
        Backend-controlled app text, menus, titles, and arrangement (L4
        Manager+). Customers and pros see updates after save design shell stays
        the same.
      </p>

      <AdminGuideBanner pageId="content" />

      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}

      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <strong>Public copy, menus & strings</strong>
          <button
            type="button"
            className="om-admin-btn"
            disabled={busy || !content}
            onClick={save}
            style={{ marginLeft: "auto" }}
          >
            {busy ? "Saving…" : "Save content"}
          </button>
        </div>
        <div style={{ padding: "1rem" }}>
          {!content ? (
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
                App title
                <input
                  value={content.appTitle || "Ona"}
                  onChange={(e) =>
                    setContent({ ...content, appTitle: e.target.value })
                  }
                />
              </label>
              <label>
                Home search placeholder
                <input
                  value={content.homeSearchPlaceholder}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      homeSearchPlaceholder: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                Login subtitle
                <input
                  value={content.loginSubtitle}
                  onChange={(e) =>
                    setContent({ ...content, loginSubtitle: e.target.value })
                  }
                />
              </label>
              <label>
                Home banner (optional)
                <textarea
                  value={content.homeBanner}
                  onChange={(e) =>
                    setContent({ ...content, homeBanner: e.target.value })
                  }
                  placeholder="Shown at top of home when non-empty"
                />
              </label>
              <label>
                Request help problem list (one per line)
                <textarea
                  value={problemsText}
                  onChange={(e) => setProblemsText(e.target.value)}
                  style={{ minHeight: 160 }}
                />
              </label>
              <label>
                Key UI strings (JSON)
                <textarea
                  value={JSON.stringify(content.strings || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(
                        e.target.value || "{}",
                      ) as Record<string, string>;
                      setContent({ ...content, strings: parsed });
                      setError(null);
                    } catch {
                      setError("Strings must be valid JSON object");
                    }
                  }}
                  style={{ minHeight: 120, fontFamily: "monospace" }}
                />
              </label>
              <div
                className="om-admin-muted"
                style={{
                  border: "1px solid var(--om-border, #ccc)",
                  borderRadius: 8,
                  padding: "0.6rem 0.75rem",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                💡 <b>Tips:</b> the app sidebar always keeps every menu row,
                you can only hide, reorder, or rename existing rows here
                (Home/Dashboard and Settings can never be hidden). Leave
                Order blank to keep the default position. Label override
                replaces the app&apos;s translated label for everyone. Changes
                go live after save (the app picks them up within ~2 minutes).
              </div>
              <MenuOverrideEditor
                title="Customer sidebar menu"
                schemaRole="client"
                overrides={content.mainMenuOverrides || {}}
                onChange={(next) =>
                  setContent({ ...content, mainMenuOverrides: next })
                }
                onError={setError}
              />
              <MenuOverrideEditor
                title="Repair Pro sidebar menu"
                schemaRole="pro"
                overrides={content.proMenuOverrides || {}}
                onChange={(next) =>
                  setContent({ ...content, proMenuOverrides: next })
                }
                onError={setError}
              />
              <p className="om-admin-muted" style={{ marginTop: 8 }}>
                L4 Manager+ can edit content. Saving requires temporary access
                code (except Super Admin). App reads these via app_settings /
                public config.
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}


/**
 * Structured menu override editor: lists ONLY rows that exist in the compiled
 * app nav (NAV_SCHEMA). Admin can hide / reorder / relabel, never invent or
 * delete rows, so the app sidebar can never lose a menu by config accident.
 */
function MenuOverrideEditor({
  title,
  schemaRole,
  overrides,
  onChange,
  onError,
}: {
  title: string;
  schemaRole: "client" | "pro";
  overrides: Record<string, MenuItemOverride>;
  onChange: (next: Record<string, MenuItemOverride>) => void;
  onError: (m: string | null) => void;
}) {
  const rows = NAV_SCHEMA.filter((r) => r.role === schemaRole);
  const update = (id: string, patch: MenuItemOverride) => {
    const clean: MenuItemOverride = {};
    if (patch.hidden) clean.hidden = true;
    if (typeof patch.order === "number" && !Number.isNaN(patch.order))
      clean.order = patch.order;
    if (patch.label && patch.label.trim()) clean.label = patch.label.trim();
    onChange({ ...overrides, [id]: clean });
    onError(null);
  };
  return (
    <fieldset
      style={{
        border: "1px solid var(--om-border, #ccc)",
        borderRadius: 8,
        padding: "0.75rem",
        margin: 0,
      }}
    >
      <legend style={{ fontWeight: 600, fontSize: 13 }}>{title}</legend>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 4 }}>Visible</th>
            <th style={{ textAlign: "left", padding: 4 }}>Row</th>
            <th style={{ textAlign: "left", padding: 4 }}>Order</th>
            <th style={{ textAlign: "left", padding: 4 }}>Label override</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ov = overrides[row.id] || {};
            const protectedRow = row.id === "home" || row.id === "dashboard" || row.id === "settings";
            return (
              <tr key={`${schemaRole}-${row.id}`}>
                <td style={{ padding: 4 }}>
                  <input
                    type="checkbox"
                    checked={!ov.hidden}
                    disabled={protectedRow}
                    onChange={(e) =>
                      update(row.id, { ...ov, hidden: !e.target.checked })
                    }
                  />
                </td>
                <td style={{ padding: 4 }}>
                  {row.label}
                  {protectedRow ? " (always visible)" : ""}
                </td>
                <td style={{ padding: 4 }}>
                  <input
                    type="number"
                    value={ov.order ?? ""}
                    placeholder="default"
                    style={{ width: 80 }}
                    onChange={(e) =>
                      update(row.id, {
                        ...ov,
                        order:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </td>
                <td style={{ padding: 4 }}>
                  <input
                    type="text"
                    value={ov.label ?? ""}
                    placeholder={row.label}
                    style={{ width: "100%" }}
                    onChange={(e) => update(row.id, { ...ov, label: e.target.value })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </fieldset>
  );
}
