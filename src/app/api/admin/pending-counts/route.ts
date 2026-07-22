import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pending care items for nav badges:
 * - Customer: ID submitted, account pending action, or re-submit requested
 * - Pro: ID submitted, skill docs under review, account status pending, re-submit
 */
export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const sb = createServiceSupabase();

    const [
      custSubmitted,
      custNoneWithAccount,
      proIdSubmitted,
      proDocs,
      proPendingStatus,
    ] = await Promise.all([
      sb
        .from("motorist_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("identity_review_status", "submitted"),
      sb
        .from("motorist_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("identity_review_status", "none"),
      sb
        .from("repair_pro_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("gov_id_review_status", "submitted"),
      sb
        .from("repair_pro_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("docs_status", "under_review"),
      sb
        .from("repair_pro_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    // Unattended = open care work (B3)
    const customersPending = custSubmitted.count ?? 0;
    // Pros: union is hard with head counts — use max of queues as badge signal
    // Better: count distinct users needing action
    const { data: proRows } = await sb
      .from("repair_pro_profiles")
      .select(
        "user_id, status, gov_id_review_status, docs_status, rejection_reason, pipeline_status, pipeline_notes, gov_id_submitted_at, docs_submitted_at, submitted_at, created_at"
      )
      .or(
        "status.eq.pending,gov_id_review_status.eq.submitted,docs_status.eq.under_review,pipeline_status.eq.needs_resubmit"
      )
      .limit(500);

    // Also pull re-submit flags that may sit on rejected status
    const { data: resubmitRows } = await sb
      .from("repair_pro_profiles")
      .select(
        "user_id, status, gov_id_review_status, docs_status, rejection_reason, pipeline_status, pipeline_notes, gov_id_submitted_at, docs_submitted_at, submitted_at, created_at"
      )
      .ilike("rejection_reason", "%re-submit%")
      .limit(100);

    const proMap = new Map<string, Record<string, unknown>>();
    for (const p of proRows ?? []) {
      proMap.set(String(p.user_id), p as Record<string, unknown>);
    }
    for (const p of resubmitRows ?? []) {
      proMap.set(String(p.user_id), p as Record<string, unknown>);
    }
    const proNeeds = [...proMap.values()];
    // Sequence by earliest open submission
    const proSeq = [...proNeeds]
      .map((p) => {
        const ts = [
          p.gov_id_submitted_at,
          p.docs_submitted_at,
          p.submitted_at,
          p.created_at,
        ]
          .filter(Boolean)
          .map((x) => new Date(String(x)).getTime())
          .filter((n) => Number.isFinite(n));
        const earliest = ts.length ? Math.min(...ts) : 0;
        return { user_id: String(p.user_id), earliest };
      })
      .sort((a, b) => a.earliest - b.earliest);

    const proSequence: Record<string, number> = {};
    proSeq.forEach((p, i) => {
      proSequence[p.user_id] = i + 1;
    });

    const { data: custRows } = await sb
      .from("motorist_profiles")
      .select(
        "user_id, identity_review_status, identity_submitted_at, created_at, gov_id_meta"
      )
      .eq("identity_review_status", "submitted")
      .limit(500);

    // Unattended only: submitted AND care has not opened this submission yet
    const unattendedCustomers = (custRows ?? []).filter((c) => {
      const meta =
        c.gov_id_meta &&
        typeof c.gov_id_meta === "object" &&
        !Array.isArray(c.gov_id_meta)
          ? (c.gov_id_meta as Record<string, unknown>)
          : {};
      const submitKey = String(c.identity_submitted_at || "");
      const attendedKey = String(meta.care_attended_submit_at || "");
      return !(attendedKey && submitKey && attendedKey === submitKey);
    });
    const custSeq = [...unattendedCustomers]
      .map((c) => {
        const ts = c.identity_submitted_at || c.created_at;
        return {
          user_id: c.user_id as string,
          earliest: ts ? new Date(String(ts)).getTime() : 0,
        };
      })
      .sort((a, b) => a.earliest - b.earliest);

    const customerSequence: Record<string, number> = {};
    custSeq.forEach((c, i) => {
      customerSequence[c.user_id] = i + 1;
    });
    const unattendedCount = unattendedCustomers.length;

    return apiOk({
      customers: {
        pending: unattendedCount,
        noId: custNoneWithAccount.count ?? 0,
        totalOpen: unattendedCount + (custNoneWithAccount.count ?? 0),
        sequence: customerSequence,
      },
      pros: {
        idPending: proIdSubmitted.count ?? 0,
        docsPending: proDocs.count ?? 0,
        accountPending: proPendingStatus.count ?? 0,
        totalOpen: proNeeds.length,
        sequence: proSequence,
      },
      // Nav total badges — only unattended (not yet opened by care)
      nav: {
        customers: unattendedCount,
        pros: proNeeds.length,
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load pending counts", 500);
  }
}
