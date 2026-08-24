import { createServiceSupabase } from "@/lib/supabase/server";
import { listProducts } from "@/lib/server/shop/catalog";
import type { ShopProductCard } from "@/lib/server/shop/types";

export type JobRecommendation = {
  id: string;
  jobId: string;
  productId: string;
  variantId: string | null;
  note: string | null;
  createdAt: string;
  product: ShopProductCard | null;
};

export async function searchShopForJob(q: string): Promise<ShopProductCard[]> {
  return listProducts({
    tradeKey: "mechanic",
    q: q.trim() || undefined,
    limit: 40,
    status: "active",
    accountContext: "professional",
  });
}

export async function listJobRecommendations(
  jobId: string,
): Promise<JobRecommendation[]> {
  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("shop_job_recommendations")
    .select("id, job_id, product_id, variant_id, note, created_at")
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const products = await listProducts({
    tradeKey: "mechanic",
    limit: 250,
    status: "active",
    accountContext: "professional",
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return rows.map((r) => ({
    id: String(r.id),
    jobId: String(r.job_id),
    productId: String(r.product_id),
    variantId: r.variant_id ? String(r.variant_id) : null,
    note: r.note ? String(r.note) : null,
    createdAt: String(r.created_at),
    product: byId.get(String(r.product_id)) ?? null,
  }));
}

export async function addJobRecommendation(opts: {
  jobId: string;
  productId: string;
  recommendedBy: string;
  note?: string | null;
}): Promise<JobRecommendation> {
  const sb = createServiceSupabase();
  const { data: product } = await sb
    .from("shop_products")
    .select("id")
    .eq("id", opts.productId)
    .eq("status", "active")
    .maybeSingle();
  if (!product) throw new Error("Product not found");

  const { data: variant } = await sb
    .from("shop_product_variants")
    .select("id")
    .eq("product_id", opts.productId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const { data, error } = await sb
    .from("shop_job_recommendations")
    .insert({
      job_id: opts.jobId,
      product_id: opts.productId,
      variant_id: variant?.id ?? null,
      recommended_by: opts.recommendedBy,
      note: opts.note?.trim() || null,
    })
    .select("id, job_id, product_id, variant_id, note, created_at")
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const existing = await listJobRecommendations(opts.jobId);
      const hit = existing.find((r) => r.productId === opts.productId);
      if (hit) return hit;
    }
    throw new Error(error.message);
  }

  await sb.from("shop_audit_logs").insert({
    actor_id: opts.recommendedBy,
    action: "job_part_recommend",
    entity_type: "service_request",
    entity_id: opts.jobId,
    payload: { productId: opts.productId },
  });

  const listed = await listJobRecommendations(opts.jobId);
  return (
    listed.find((r) => r.id === String(data.id)) ?? {
      id: String(data.id),
      jobId: String(data.job_id),
      productId: String(data.product_id),
      variantId: data.variant_id ? String(data.variant_id) : null,
      note: data.note ? String(data.note) : null,
      createdAt: String(data.created_at),
      product: null,
    }
  );
}

export async function removeJobRecommendation(opts: {
  id: string;
  jobId: string;
  actorId: string;
}) {
  const sb = createServiceSupabase();
  const { error } = await sb
    .from("shop_job_recommendations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", opts.id)
    .eq("job_id", opts.jobId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  await sb.from("shop_audit_logs").insert({
    actor_id: opts.actorId,
    action: "job_part_recommend_remove",
    entity_type: "service_request",
    entity_id: opts.jobId,
    payload: { recommendationId: opts.id },
  });
}
