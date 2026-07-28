"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import type { AppConfig, ContentSection } from "@/lib/app-config";

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
    setMsg("Content saved — request flow & home copy update.");
  }

  return (
    <AdminShell adminName={adminName} adminRole={adminRole}>
      <h1 className="om-admin-h1">Content, menus & copy</h1>
      <p className="om-admin-sub">
        Backend-controlled app text, menus, titles, and arrangement (L4 Manager+).
        Customers and pros see updates after save — design shell stays the same.
      </p>
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
                Request help — problem list (one per line)
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
                      const parsed = JSON.parse(e.target.value || "{}") as Record<
                        string,
                        string
                      >;
                      setContent({ ...content, strings: parsed });
                      setError(null);
                    } catch {
                      setError("Strings must be valid JSON object");
                    }
                  }}
                  style={{ minHeight: 120, fontFamily: "monospace" }}
                />
              </label>
              <label>
                Main menu (JSON array — id, label, href, icon, order, enabled)
                <textarea
                  value={JSON.stringify(content.mainMenu || [], null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value || "[]") as ContentSection["mainMenu"];
                      setContent({ ...content, mainMenu: parsed });
                      setError(null);
                    } catch {
                      setError("Main menu must be valid JSON array");
                    }
                  }}
                  style={{ minHeight: 160, fontFamily: "monospace" }}
                />
              </label>
              <label>
                Pro menu (JSON array)
                <textarea
                  value={JSON.stringify(content.proMenu || [], null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value || "[]") as ContentSection["proMenu"];
                      setContent({ ...content, proMenu: parsed });
                      setError(null);
                    } catch {
                      setError("Pro menu must be valid JSON array");
                    }
                  }}
                  style={{ minHeight: 140, fontFamily: "monospace" }}
                />
              </label>
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
