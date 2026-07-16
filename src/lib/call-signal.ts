/**
 * Durable call signaling client — POST/GET /api/call/signal
 * More reliable than Realtime broadcast alone on mobile networks.
 */

export type CallSignalKind =
  | "offer"
  | "answer"
  | "ice"
  | "hangup"
  | "reject";

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
    const res = await fetch("/api/call/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string };
    } | null;
    if (!json?.ok) return json?.error?.message || "Signal failed";
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
    const res = await fetch(`/api/call/signal?${qs}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: { signals?: CallSignalRow[]; missingTable?: boolean };
    } | null;
    if (!json?.ok || !json.data?.signals) return [];
    return json.data.signals;
  } catch {
    return [];
  }
}
