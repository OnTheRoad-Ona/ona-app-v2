/**
 * Durable call signaling — POST/GET /api/call/signal
 * Also supports client-side Supabase Realtime when available.
 */

import { authFetch } from "@/lib/api-auth-headers";

export type CallSignalKind =
  | "offer"
  | "answer"
  | "ice"
  | "hangup"
  | "reject"
  /** Callee tapped Accept — caller UI moves to Connecting before answer SDP arrives */
  | "accepting";

export type CallSignalRow = {
  id: string;
  callId: string;
  from: string;
  kind: CallSignalKind;
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function postCallSignal(input: {
  callId: string;
  toUserId: string;
  fromUserId: string;
  kind: CallSignalKind;
  payload: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const res = await authFetch("/api/call/signal", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string };
    } | null;
    if (!json?.ok) {
      return json?.error?.message || `Signal failed (${res.status})`;
    }
    return null;
  } catch {
    return "Network error sending call signal";
  }
}

export async function pollCallSignals(
  userId: string
): Promise<CallSignalRow[]> {
  try {
    const qs = new URLSearchParams({ userId });
    const res = await authFetch(`/api/call/signal?${qs}`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: { signals?: CallSignalRow[]; missingTable?: boolean };
      error?: { message?: string };
    } | null;
    if (!json?.ok) {
      console.warn("pollCallSignals", json?.error?.message || res.status);
      return [];
    }
    return json.data?.signals || [];
  } catch (e) {
    console.warn("pollCallSignals network", e);
    return [];
  }
}

export async function ackCallSignals(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try {
    await authFetch("/api/call/signal", {
      method: "PATCH",
      body: JSON.stringify({ ids }),
    });
  } catch {
    /* best-effort */
  }
}
