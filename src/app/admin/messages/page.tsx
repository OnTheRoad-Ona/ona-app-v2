"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";

type Conversation = {
  id: string;
  motorist_id: string;
  repair_pro_id: string;
  request_id: string | null;
  last_message_at: string | null;
  created_at: string;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type MessageReport = {
  id: string;
  message_id: string;
  reporter_id: string;
  reason: string;
  details?: string;
  status: string;
  created_at: string;
};

export default function AdminMessagesPage() {
  const { adminName, ready, api } = useAdminGate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reports, setReports] = useState<MessageReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = await api<{
        conversations: Conversation[];
        messages: Message[];
        reports?: MessageReport[];
      }>("/api/admin/messages");
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setConversations(res.data.conversations);
      setMessages(res.data.messages);
      setReports(res.data.reports || []);
    })();
  }, [ready, api]);

  async function moderate(action: string, id: string) {
    const res = await api<{ id: string; status?: string }>(
      "/api/admin/messages",
      { method: "POST", body: JSON.stringify({ action, id }) },
    );
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    // refresh reports
    const fresh = await api<{ reports?: MessageReport[] }>(
      "/api/admin/messages",
    );
    if (fresh.ok) setReports(fresh.data.reports || []);
  }

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Messages</h1>
      <p className="om-admin-sub">
        Job chats between customers and repair pros. Support Care when
        investigating disputes.
      </p>

      <AdminGuideBanner pageId="messages" />

      {error ? <div className="om-admin-error">{error}</div> : null}

      <div className="om-admin-grid-2">
        <div className="om-admin-panel">
          <div className="om-admin-toolbar">
            <strong>Conversations ({conversations.length})</strong>
          </div>
          <table className="om-admin-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Customer</th>
                <th>Pro</th>
              </tr>
            </thead>
            <tbody>
              {conversations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="om-admin-muted">
                    No conversations yet.
                  </td>
                </tr>
              ) : (
                conversations.map((c) => (
                  <tr key={c.id}>
                    <td>{new Date(c.created_at).toLocaleString()}</td>
                    <td className="om-admin-muted">
                      {c.motorist_id.slice(0, 8)}…
                    </td>
                    <td className="om-admin-muted">
                      {c.repair_pro_id.slice(0, 8)}…
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="om-admin-panel">
          <div className="om-admin-toolbar">
            <strong>Recent messages ({messages.length})</strong>
          </div>
          <table className="om-admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Body</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 ? (
                <tr>
                  <td colSpan={2} className="om-admin-muted">
                    No messages yet.
                  </td>
                </tr>
              ) : (
                messages.slice(0, 50).map((m) => (
                  <tr key={m.id}>
                    <td className="om-admin-muted">
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td>{m.body.slice(0, 120)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="om-admin-panel">
          <div className="om-admin-toolbar">
            <strong>Reports & moderation ({reports.length})</strong>
          </div>
          <p className="om-admin-muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
            💡 Tips: users report abusive chats from the message screen.
            <b> Review</b> marks it seen, <b>Delete message</b> removes the
            abusive message and auto-closes its reports, <b>Dismiss</b> closes
            it with no action. All actions are permanent.
          </p>
          <table className="om-admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={4} className="om-admin-muted">
                    No reports, all clear.
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.id}>
                    <td className="om-admin-muted">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td>
                      {r.reason}
                      {r.details ? (
                        <div className="om-admin-muted">{r.details}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className="om-admin-badge">{r.status}</span>
                    </td>
                    <td>
                      {r.status === "open" || r.status === "reviewed" ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          {r.status === "open" ? (
                            <button
                              type="button"
                              className="om-admin-btn"
                              onClick={() => void moderate("review-report", r.id)}
                            >
                              Review
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="om-admin-btn"
                            onClick={() => void moderate("delete-message", r.message_id)}
                          >
                            Delete message
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn"
                            onClick={() => void moderate("dismiss-report", r.id)}
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
