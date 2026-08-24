import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Verify-then-report: after a lost response, the client can ask what
 * actually happened with its idempotency op. "done" -> report success,
 * "error" -> report the recorded failure, anything else -> not proven
 * (client shows a neutral outcome instead of a false failure).
 *
 * The op_key is client-minted randomness (a UUID), acting as a bearer
 * token; callers also echo the actor they stamped on create, so reading
 * someone else's op result is refused.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const opKey = url.searchParams.get("opKey") || "";
    const actorKind = url.searchParams.get("actorKind") || "";
    const actorId = url.searchParams.get("actorId") || "";
    if (!opKey) return apiFail("opKey required", 400);

    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("idempotent_ops")
      .select("op_key, actor_kind, actor_id, op_type, status, result, error")
      .eq("op_key", opKey)
      .maybeSingle();
    if (error) return apiFail(error.message, 500);
    if (!data) return apiFail("Unknown op", 404, "op_not_found");

    // Actor gate: the client must echo what it stamped on create unless it
    // created the op with the anonymous default.
    const storedActorId = data.actor_id ? String(data.actor_id) : "";
    const storedActorKind = data.actor_kind ? String(data.actor_kind) : "";
    if (
      (storedActorId && storedActorId !== actorId) ||
      (storedActorKind && storedActorKind !== actorKind)
    ) {
      return apiFail("Forbidden", 403, "forbidden");
    }

    return apiOk({
      status: String(data.status),
      result: data.result ?? null,
      error: data.error ? String(data.error) : null,
      opType: data.op_type ? String(data.op_type) : null,
    });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Verification failed", 500);
  }
}
