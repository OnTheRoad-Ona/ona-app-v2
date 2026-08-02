import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  callId: z.string().min(4).max(80),
  toUserId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  kind: z.enum(["offer", "answer", "ice", "hangup", "reject", "accepting"]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Durable WebRTC signaling stored in Postgres.
 * Callee polls; signals are NOT marked consumed until PATCH ack
 * (so a failed client parse cannot drop the offer forever).
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase not configured", 503);
  }
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(
        `Invalid signal: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        400
      );
    }
    const b = parsed.data;
    if (b.fromUserId !== auth.userId) {
      return apiFail("fromUserId must match signed-in user", 403);
    }
    if (b.toUserId === b.fromUserId) {
      return apiFail("Cannot signal yourself", 400);
    }

    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("call_signals")
      .insert({
        call_id: b.callId,
        to_user_id: b.toUserId,
        from_user_id: auth.userId,
        kind: b.kind,
        payload: b.payload ?? {},
        consumed: false,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (
        error.message.includes("call_signals") ||
        error.code === "42P01"
      ) {
        return apiFail(
          "Call signaling table missing. Run migration 017_call_signals.",
          503
        );
      }
      console.error("call_signals insert", error);
      return apiFail(error.message, 500);
    }
    return apiOk({ id: data?.id, ok: true });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Signal failed", 500);
  }
}

/** Poll inbox — does NOT consume (use PATCH to ack) */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase not configured", 503);
  }
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") || "";
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        userId
      )
    ) {
      return apiFail("userId required (uuid)", 400);
    }
    if (userId !== auth.userId) {
      return apiFail("Forbidden", 403, "forbidden");
    }

    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("call_signals")
      .select("id, call_id, from_user_id, kind, payload, created_at")
      .eq("to_user_id", auth.userId)
      .eq("consumed", false)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      if (error.code === "42P01") {
        return apiOk({ signals: [], missingTable: true });
      }
      return apiFail(error.message, 500);
    }

    const rows = data || [];
    return apiOk({
      signals: rows.map((r) => ({
        id: r.id,
        callId: r.call_id,
        from: r.from_user_id,
        kind: r.kind,
        payload: r.payload || {},
        createdAt: r.created_at,
      })),
    });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Poll failed", 500);
  }
}

const patchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

/** Mark signals consumed after successful client handling */
export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase not configured", 503);
  }
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("ids required", 400);
    const sb = createServiceSupabase();
    // Only mark signals addressed to this user
    const { error } = await sb
      .from("call_signals")
      .update({ consumed: true })
      .in("id", parsed.data.ids)
      .eq("to_user_id", auth.userId);
    if (error) return apiFail(error.message, 500);
    return apiOk({ ok: true });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Ack failed", 500);
  }
}
