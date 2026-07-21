"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

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

export default function AdminMessagesPage() {
  const { adminName, ready, api } = useAdminGate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = await api<{
        conversations: Conversation[];
        messages: Message[];
      }>("/api/admin/messages");
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setConversations(res.data.conversations);
      setMessages(res.data.messages);
    })();
  }, [ready, api]);

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Messages</h1>
      <p className="om-admin-sub">
        Conversations and latest messages across the app.
      </p>
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
      </div>
    </AdminShell>
  );
}
