import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  callId: z.string().min(4).max(80),
  toUserId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  kind: z.enum(["offer", "answer", "ice", "hangup", "reject"]),
  payload: z.record(z.string(), z.unknown()),
});

/**
 * Durable WebRTC signaling.
 * Broadcast-only signaling was dropping offers on mobile; this stores rows
 * the callee polls every ~1s while idle / in a call.
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase not configured", 503);
  }
  try {
    const parsed = postSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid signal", 400);
    const b = parsed.data;
    const sb = createServiceSupabase();

    const { error } = await sb.from("call_signals").insert({
      call_id: b.callId,
      to_user_id: b.toUserId,
      from_user_id: b.fromUserId,
      kind: b.kind,
      payload: b.payload,
      consumed: false,
    });

    if (error) {
      // Table may not exist yet — return clear error
      if (
        error.message.includes("call_signals") ||
        error.code === "42P01"
      ) {
        return apiFail(
          "Call signaling table missing. Run migration 017_call_signals.",
          503
        );
      }
      return apiFail(error.message, 500);
    }
    return apiOk({ ok: true });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Signal failed", 500);
  }
}

const getSchema = z.object({
  userId: z.string().uuid(),
  after: z.string().optional(),
});

/** Poll inbox for unconsumed signals */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase not configured", 503);
  }
  try {
    const url = new URL(req.url);
    const parsed = getSchema.safeParse({
      userId: url.searchParams.get("userId"),
      after: url.searchParams.get("after") || undefined,
    });
    if (!parsed.success) return apiFail("userId required", 400);

    const sb = createServiceSupabase();
    let q = sb
      .from("call_signals")
      .select("id, call_id, from_user_id, kind, payload, created_at")
      .eq("to_user_id", parsed.data.userId)
      .eq("consumed", false)
      .order("created_at", { ascending: true })
      .limit(40);

    if (parsed.data.after) {
      q = q.gt("created_at", parsed.data.after);
    }

    const { data, error } = await q;
    if (error) {
      if (error.code === "42P01") {
        return apiOk({ signals: [], missingTable: true });
      }
      return apiFail(error.message, 500);
    }

    const rows = data || [];
    // Mark consumed so we don't re-process
    if (rows.length) {
      const ids = rows.map((r) => r.id as string);
      await sb
        .from("call_signals")
        .update({ consumed: true })
        .in("id", ids);
    }

    return apiOk({
      signals: rows.map((r) => ({
        id: r.id,
        callId: r.call_id,
        from: r.from_user_id,
        kind: r.kind,
        payload: r.payload,
        createdAt: r.created_at,
      })),
    });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Poll failed", 500);
  }
}
