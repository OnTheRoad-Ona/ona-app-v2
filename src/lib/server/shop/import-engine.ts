/**
 * ONA Shop import engine (Phase 2).
 *
 * Pipeline: connector → staging records → validation → dedup → canonical
 * upsert. Records that fail validation are rejected and never touch the
 * canonical catalog. Duplicates (same deterministic dedup_key) are merged, not
 * duplicated — five sources carrying the same part produce ONE Ona product.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogConnector, ConnectorRunReport, StagedRecord } from "@/lib/server/shop/connectors/types";
import { validateCatalogRecord, type ValidationIssue } from "@/lib/server/shop/data-validate";
import { checksum, dedupKeyForVariant, deterministicId, mapExternalCategory, slugify } from "@/lib/server/shop/normalize";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGES = 2000;

export type ImportJobResult = {
  jobId: string;
  report: ConnectorRunReport;
  validationIssues: ValidationIssue[];
};

async function findOrCreateBrand(
  sb: SupabaseClient,
  brand: StagedRecord["brand"]
): Promise<string | null> {
  if (!brand) return null;
  const name = typeof brand === "string" ? brand : brand.name;
  const slug = typeof brand === "string" ? undefined : brand.slug;
  if (!name?.trim()) return null;

  const brandSlug =
    slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

  const { data: existing } = await sb
    .from("shop_brands")
    .select("id")
    .eq("slug", brandSlug)
    .maybeSingle();
  if (existing) return String(existing.id);

  const { data: created, error } = await sb
    .from("shop_brands")
    .insert({ slug: brandSlug, name: name.trim() })
    .select("id")
    .maybeSingle();
  if (error || !created) return null;
  return String(created.id);
}

async function findOrCreateCategory(
  sb: SupabaseClient,
  tradeKey: string,
  categorySlug: string | undefined
): Promise<string | null> {
  const slug = categorySlug || tradeKey;
  const { data: root } = await sb
    .from("shop_trade_categories")
    .select("id")
    .eq("trade_key", tradeKey)
    .eq("slug", tradeKey)
    .eq("depth", 0)
    .maybeSingle();
  if (!root) return null;

  if (slug === tradeKey) return String(root.id);

  const { data: cat } = await sb
    .from("shop_trade_categories")
    .select("id")
    .eq("trade_key", tradeKey)
    .eq("slug", slug)
    .maybeSingle();
  if (cat) return String(cat.id);

  // Demo categories may not exist in the tree yet — create under the root.
  const { data: created, error } = await sb
    .from("shop_trade_categories")
    .insert({
      parent_id: root.id,
      trade_key: tradeKey,
      slug,
      name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      sort_order: 1,
      depth: 1,
      path: `${tradeKey}/${slug}`,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) return null;
  return String(created.id);
}

async function findExistingVariantByDedup(
  sb: SupabaseClient,
  dedupKey: string
): Promise<{ id: string; product_id: string } | null> {
  const { data } = await sb
    .from("shop_product_variants")
    .select("id, product_id")
    .eq("dedup_key", dedupKey)
    .maybeSingle();
  return data ? { id: String(data.id), product_id: String(data.product_id) } : null;
}

async function insertCanonical(
  sb: SupabaseClient,
  record: StagedRecord,
  tradeKey: string,
  categoryId: string,
  brandId: string | null,
  dedupKey: string | null,
  sourceCode: string
): Promise<{ productId: string; variantId: string }> {
  const name = (record.name || "Unnamed product").trim();
  const productId =
    deterministicId("p", sourceCode, record.externalId || dedupKey || name) || crypto.randomUUID();
  const variantId = deterministicId("v", sourceCode, record.externalId || dedupKey || name, "v");

  const keywords = record.keywords ?? [];
  const attributes = record.attributes ?? {};

  const { error: pe } = await sb.from("shop_products").insert({
    id: productId,
    category_id: categoryId,
    brand_id: brandId,
    trade_key: tradeKey,
    slug: slugify(name) + "-" + productId.slice(0, 6),
    name,
    subtitle: record.subtitle ?? null,
    description: record.description ?? null,
    condition_type: "aftermarket",
    status: record.status ?? "active",
    is_professional_only: false,
    attributes,
    keywords,
    is_demo: sourceCode === "ona_demo",
    source_key: sourceCode,
    external_item_id: record.externalId ?? null,
    search_document: `${name} ${record.subtitle || ""} ${keywords.join(" ")} ${record.sku || ""} ${record.oemNumber || ""} ${record.mpn || ""}`,
  });
  if (pe) throw new Error(`product insert: ${pe.message}`);

  const { error: ve } = await sb.from("shop_product_variants").insert({
    id: variantId,
    product_id: productId,
    sku: record.sku || `${sourceCode.toUpperCase()}-${variantId.slice(0, 8)}`,
    mpn: record.mpn ?? null,
    oem_number: record.oemNumber ?? null,
    title: name,
    option_label: "Standard",
    unit: "each",
    status: "active",
    dedup_key: dedupKey,
    normalized_mpn: record.mpn ? record.mpn.trim().toUpperCase() : null,
    normalized_oem: record.oemNumber ? record.oemNumber.trim().toUpperCase() : null,
  });
  if (ve) throw new Error(`variant insert: ${ve.message}`);

  if (record.priceMinor != null && Number.isFinite(record.priceMinor)) {
    const { error: priceErr } = await sb.from("shop_prices").insert({
      variant_id: variantId,
      currency: "NGN",
      amount_minor: record.priceMinor,
      is_active: true,
    });
    if (priceErr) throw new Error(`price insert: ${priceErr.message}`);
  }

  return { productId, variantId };
}

/**
 * Run one connector through the full import pipeline. Writes job/batch/staging/
 * validation/dedup/change-log rows and upserts canonical products.
 */
export async function runImport({
  sb,
  connector,
  sourceId,
  connectorId,
  actorId,
  jobType = "full",
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  sb: SupabaseClient;
  connector: CatalogConnector;
  sourceId: string | null;
  connectorId: string | null;
  actorId?: string | null;
  jobType?: "full" | "incremental" | "demo" | "verify";
  pageSize?: number;
}): Promise<ImportJobResult> {
  const report: ConnectorRunReport = { discovered: 0, imported: 0, updated: 0, rejected: 0, errors: [] };
  const validationIssues: ValidationIssue[] = [];

  const { data: job, error: jobErr } = await sb
    .from("shop_import_jobs")
    .insert({
      data_source_id: sourceId,
      connector_id: connectorId,
      job_type: jobType,
      status: "running",
      started_at: new Date().toISOString(),
      created_by: actorId ?? null,
    })
    .select("id")
    .single();
  if (jobErr || !job) throw new Error(`job create: ${jobErr?.message ?? "no job"}`);

  const jobId = String(job.id);
  const batchNo = 1;

  try {
    let page = 1;
    let hasMore = true;
    let batchImported = 0;
    let batchRejected = 0;
    let batchUpdated = 0;
    let batchTotal = 0;

    const { data: batch, error: batchErr } = await sb
      .from("shop_import_batches")
      .insert({
        job_id: jobId,
        batch_no: batchNo,
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (batchErr || !batch) throw new Error(`batch create: ${batchErr?.message ?? "no batch"}`);
    const batchId = String(batch.id);

    while (hasMore && page <= MAX_PAGES) {
      const { records, hasMore: more } = await connector.fetchRecords({ page, pageSize });
      hasMore = more;

      for (const record of records) {
        report.discovered++;
        batchTotal++;

        const isErrorRecord = String(record.externalCategory ?? "") === "__connector_error__";
        const raw = record.raw ?? {};

        const { data: staging, error: stageErr } = await sb
          .from("shop_staging_records")
          .insert({
            job_id: jobId,
            batch_id: batchId,
            data_source_id: sourceId,
            external_id: record.externalId ?? null,
            external_category: record.externalCategory ?? null,
            trade_key: record.tradeKey ?? null,
            raw_data: raw,
            checksum: checksum(raw),
            status: isErrorRecord ? "error" : "staged",
            errors: isErrorRecord ? [String(record.name)] : [],
          })
          .select("id")
          .single();
        if (stageErr || !staging) {
          report.errors.push(`staging: ${stageErr?.message ?? "no id"}`);
          continue;
        }
        const stagingId = String(staging.id);

        if (isErrorRecord) {
          report.rejected++;
          batchRejected++;
          continue;
        }

        const tradeKey = record.tradeKey || "mechanic";
        const validation = validateCatalogRecord({
          ...record,
          raw,
          tradeKey,
          brand: typeof record.brand === "string" ? record.brand : record.brand?.name ?? null,
        });

        for (const issue of validation.issues) {
          await sb.from("shop_validation_results").insert({
            staging_record_id: stagingId,
            job_id: jobId,
            rule_key: issue.ruleKey,
            rule_level: issue.level,
            field: issue.field ?? null,
            message: issue.message,
            passed: issue.level !== "error",
          });
          if (issue.level === "error") validationIssues.push(issue);
        }

        if (!validation.valid) {
          report.rejected++;
          batchRejected++;
          await sb
            .from("shop_staging_records")
            .update({ status: "rejected", errors: validation.issues, processed_at: new Date().toISOString() })
            .eq("id", stagingId);
          await sb.from("shop_source_change_log").insert({
            data_source_id: sourceId,
            job_id: jobId,
            staging_record_id: stagingId,
            action: "reject",
            field: "validation",
            new_value: { issues: validation.issues.map((i) => i.message) },
          });
          continue;
        }

        const brandId = await findOrCreateBrand(sb, record.brand);
        const categoryId = await findOrCreateCategory(sb, tradeKey, record.externalCategory?.split(" > ")[1]?.toLowerCase() || tradeKey);
        if (!categoryId) {
          report.rejected++;
          batchRejected++;
          await sb
            .from("shop_staging_records")
            .update({ status: "rejected", errors: [{ message: "no matching Ona category for this trade" }], processed_at: new Date().toISOString() })
            .eq("id", stagingId);
          continue;
        }

        const dedupKey = dedupKeyForVariant({
          tradeKey,
          brand: typeof record.brand === "string" ? record.brand : record.brand?.name,
          sku: record.sku,
          oemNumber: record.oemNumber,
          mpn: record.mpn,
          attributes: record.attributes,
        });

        const existing = dedupKey ? await findExistingVariantByDedup(sb, dedupKey) : null;
        const mapped = mapExternalCategory({ externalCategory: record.externalCategory, tradeKey });

        if (existing) {
          report.updated++;
          batchUpdated++;
          await sb
            .from("shop_staging_records")
            .update({ status: "duplicate", normalized_data: mapped, dedup_key: dedupKey, processed_at: new Date().toISOString() })
            .eq("id", stagingId);
          await sb.from("shop_dedup_results").insert({
            staging_record_id: stagingId,
            job_id: jobId,
            candidate_product_id: existing.product_id,
            candidate_variant_id: existing.id,
            match_type: "exact",
            score: 1,
            decided: true,
          });
          await sb.from("shop_source_change_log").insert({
            data_source_id: sourceId,
            job_id: jobId,
            staging_record_id: stagingId,
            action: "noop",
            product_id: existing.product_id,
            variant_id: existing.id,
            field: "dedup",
            new_value: { message: "identical part already in catalog — merged, not duplicated" },
          });
          continue;
        }

        try {
          const { productId, variantId } = await insertCanonical(
            sb,
            record,
            tradeKey,
            categoryId,
            brandId,
            dedupKey,
            connector.sourceCode
          );
          report.imported++;
          batchImported++;
          await sb
            .from("shop_staging_records")
            .update({ status: "imported", normalized_data: { ...mapped, product_id: productId, variant_id: variantId }, dedup_key: dedupKey, processed_at: new Date().toISOString() })
            .eq("id", stagingId);
          await sb.from("shop_source_change_log").insert({
            data_source_id: sourceId,
            job_id: jobId,
            staging_record_id: stagingId,
            action: "insert",
            product_id: productId,
            variant_id: variantId,
            field: "product",
            new_value: { sku: record.sku, name: record.name },
          });
        } catch (e) {
          report.rejected++;
          batchRejected++;
          const msg = e instanceof Error ? e.message : "insert failed";
          report.errors.push(msg);
          await sb
            .from("shop_staging_records")
            .update({ status: "error", errors: [{ message: msg }], processed_at: new Date().toISOString() })
            .eq("id", stagingId);
        }
      }

      page++;
      if (!hasMore) {
        await sb
          .from("shop_import_batches")
          .update({
            status: "succeeded",
            records_total: batchTotal,
            records_imported: batchImported,
            records_updated: batchUpdated,
            records_rejected: batchRejected,
            finished_at: new Date().toISOString(),
          })
          .eq("id", batchId);
      }
    }

    const finalStatus = report.rejected === 0 ? "succeeded" : report.errors.length ? "failed" : "partial";
    await sb
      .from("shop_import_jobs")
      .update({
        status: report.errors.length ? "failed" : finalStatus,
        records_discovered: report.discovered,
        records_imported: report.imported,
        records_updated: report.updated,
        records_rejected: report.rejected,
        error_summary: report.errors.slice(0, 100),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (sourceId) {
      await sb
        .from("shop_data_sources")
        .update({
          records_discovered: report.discovered,
          records_imported: report.imported,
          records_rejected: report.rejected,
          records_updated: report.updated,
          last_sync_at: new Date().toISOString(),
          next_sync_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          status: report.errors.length ? "error" : "ok",
          last_error: report.errors[0] ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sourceId);
    }

    if (connectorId) {
      await sb
        .from("shop_source_connectors")
        .update({
          status: report.errors.length ? "error" : "ok",
          records_discovered: report.discovered,
          records_imported: report.imported,
          records_rejected: report.rejected,
          records_updated: report.updated,
          last_sync_at: new Date().toISOString(),
          next_sync_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          last_error: report.errors[0] ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectorId);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "import failed";
    await sb
      .from("shop_import_jobs")
      .update({ status: "failed", error_summary: [msg], finished_at: new Date().toISOString() })
      .eq("id", jobId);
    report.errors.push(msg);
  }

  return { jobId, report, validationIssues };
}
