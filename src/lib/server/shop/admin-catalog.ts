/**
 * Admin catalog writes — products, variants, prices, inventory, images.
 * Gated by shop_catalog permission at the API layer.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { getSupabaseUrl } from "@/lib/supabase/env";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export type AdminProductInput = {
  name: string;
  subtitle?: string | null;
  description?: string | null;
  tradeKey: string;
  categoryId: string;
  brandId?: string | null;
  conditionType?: string | null;
  status?: "draft" | "active" | "archived";
  isProfessionalOnly?: boolean;
  primaryImageUrl?: string | null;
  /** Variant */
  sku: string;
  mpn?: string | null;
  oemNumber?: string | null;
  variantTitle?: string | null;
  /** Price in NGN major units (e.g. 28500) → stored as minor */
  priceMajor: number;
  currency?: string;
  /** Starting stock at default hub */
  stockQty?: number;
  locationCode?: string;
};

export async function adminListProducts(opts?: {
  q?: string;
  tradeKey?: string;
  status?: string;
  limit?: number;
}) {
  const sb = createServiceSupabase();
  const limit = Math.min(opts?.limit ?? 250, 300);
  let q = sb
    .from("shop_products")
    .select(
      "id, slug, name, subtitle, trade_key, category_id, status, condition_type, primary_image_url, is_professional_only, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (opts?.tradeKey) q = q.eq("trade_key", opts.tradeKey);
  if (opts?.status) q = q.eq("status", opts.status);
  else q = q.neq("status", "archived");
  if (opts?.q?.trim()) {
    const term = opts.q.trim().replace(/%/g, "");
    q = q.or(
      `name.ilike.%${term}%,slug.ilike.%${term}%,subtitle.ilike.%${term}%`
    );
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function adminGetProduct(id: string) {
  const sb = createServiceSupabase();
  const { data: product, error } = await sb
    .from("shop_products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) return null;

  const { data: variants } = await sb
    .from("shop_product_variants")
    .select("*")
    .eq("product_id", id);
  const vids = (variants ?? []).map((v) => v.id as string);
  let prices: unknown[] = [];
  let inventory: unknown[] = [];
  if (vids.length) {
    const { data: pr } = await sb
      .from("shop_prices")
      .select("*")
      .in("variant_id", vids)
      .eq("is_active", true);
    prices = pr ?? [];
    const { data: inv } = await sb
      .from("shop_inventory")
      .select("*, shop_inventory_locations(code, name)")
      .in("variant_id", vids);
    inventory = inv ?? [];
  }
  const { data: images } = await sb
    .from("shop_product_images")
    .select("*")
    .eq("product_id", id)
    .order("sort_order", { ascending: true });

  return {
    product,
    variants: variants ?? [],
    prices,
    inventory,
    images: images ?? [],
  };
}

export async function adminCreateProduct(
  input: AdminProductInput,
  actorId: string | null
) {
  const sb = createServiceSupabase();
  let slug = slugify(input.name);
  if (!slug) slug = `product-${Date.now().toString(36)}`;

  // unique slug
  const { data: clash } = await sb
    .from("shop_products")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  // Category must belong to the same trade as the product (DB backs this up).
  const { data: category } = await sb
    .from("shop_trade_categories")
    .select("trade_key")
    .eq("id", input.categoryId)
    .eq("is_active", true)
    .maybeSingle();
  if (!category) throw new Error(`Category ${input.categoryId} not found`);
  if (String(category.trade_key) !== input.tradeKey) {
    throw new Error(
      `Category belongs to "${category.trade_key}" — cannot be used for "${input.tradeKey}".`
    );
  }

  const priceMinor = Math.round(Number(input.priceMajor) * 100);
  if (!Number.isFinite(priceMinor) || priceMinor < 0) {
    throw new Error("Invalid price");
  }

  const { data: product, error: pe } = await sb
    .from("shop_products")
    .insert({
      category_id: input.categoryId,
      brand_id: input.brandId || null,
      trade_key: input.tradeKey,
      slug,
      name: input.name.trim(),
      subtitle: input.subtitle?.trim() || null,
      description: input.description?.trim() || null,
      condition_type: input.conditionType || null,
      primary_image_url: input.primaryImageUrl || null,
      status: input.status || "active",
      is_professional_only: Boolean(input.isProfessionalOnly),
      search_document:
        `${input.name} ${input.subtitle || ""} ${input.sku} ${input.oemNumber || ""}`.toLowerCase(),
    })
    .select("*")
    .single();
  if (pe || !product) throw new Error(pe?.message || "Product insert failed");

  const { data: variant, error: ve } = await sb
    .from("shop_product_variants")
    .insert({
      product_id: product.id,
      sku: input.sku.trim(),
      mpn: input.mpn?.trim() || null,
      oem_number: input.oemNumber?.trim() || null,
      title: (input.variantTitle || input.name).trim(),
      option_label: "Standard",
      status: "active",
    })
    .select("*")
    .single();
  if (ve || !variant) throw new Error(ve?.message || "Variant insert failed");

  await sb.from("shop_prices").insert({
    variant_id: variant.id,
    currency: input.currency || "NGN",
    amount_minor: priceMinor,
    is_active: true,
  });

  const locCode = input.locationCode || "LOS-HUB-1";
  const { data: loc } = await sb
    .from("shop_inventory_locations")
    .select("id")
    .eq("code", locCode)
    .maybeSingle();
  if (loc && (input.stockQty ?? 0) >= 0) {
    await sb.from("shop_inventory").upsert(
      {
        variant_id: variant.id,
        location_id: loc.id,
        qty_on_hand: Math.max(0, Math.floor(input.stockQty ?? 0)),
        qty_reserved: 0,
      },
      { onConflict: "variant_id,location_id" }
    );
  }

  if (input.primaryImageUrl) {
    await sb.from("shop_product_images").insert({
      product_id: product.id,
      url: input.primaryImageUrl,
      sort_order: 0,
      is_primary: true,
      alt_text: input.name,
    });
  }

  await sb.from("shop_audit_logs").insert({
    actor_id: actorId,
    action: "product_create",
    entity_type: "shop_product",
    entity_id: product.id,
    payload: { sku: input.sku, name: input.name },
  });

  return { product, variant };
}

export async function adminUpdateProduct(
  id: string,
  patch: Partial<{
    name: string;
    subtitle: string | null;
    description: string | null;
    tradeKey: string;
    categoryId: string;
    brandId: string | null;
    conditionType: string | null;
    status: "draft" | "active" | "archived";
    isProfessionalOnly: boolean;
    primaryImageUrl: string | null;
  }>,
  actorId: string | null
) {
  const sb = createServiceSupabase();
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.subtitle !== undefined) row.subtitle = patch.subtitle;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.tradeKey !== undefined) row.trade_key = patch.tradeKey;
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
  if (patch.brandId !== undefined) row.brand_id = patch.brandId;
  if (patch.conditionType !== undefined) row.condition_type = patch.conditionType;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.isProfessionalOnly !== undefined)
    row.is_professional_only = patch.isProfessionalOnly;
  if (patch.primaryImageUrl !== undefined)
    row.primary_image_url = patch.primaryImageUrl;

  // Trade/category must stay consistent (same friendly errors as create).
  if (
    row.category_id !== undefined ||
    row.trade_key !== undefined ||
    patch.categoryId !== undefined
  ) {
    const { data: current } = await sb
      .from("shop_products")
      .select("trade_key, category_id")
      .eq("id", id)
      .maybeSingle();
    if (current) {
      const finalTrade = String(row.trade_key ?? current.trade_key);
      const finalCategory = String(
        row.category_id ?? current.category_id
      );
      const { data: category } = await sb
        .from("shop_trade_categories")
        .select("trade_key")
        .eq("id", finalCategory)
        .eq("is_active", true)
        .maybeSingle();
      if (!category) throw new Error(`Category ${finalCategory} not found`);
      if (String(category.trade_key) !== finalTrade) {
        throw new Error(
          `Category belongs to "${category.trade_key}" — cannot be used for "${finalTrade}".`
        );
      }
    }
  }

  if (typeof row.name === "string") {
    row.search_document = String(row.name).toLowerCase();
  }

  const { data, error } = await sb
    .from("shop_products")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await sb.from("shop_audit_logs").insert({
    actor_id: actorId,
    action: "product_update",
    entity_type: "shop_product",
    entity_id: id,
    payload: patch,
  });
  return data;
}

export async function adminSetPrice(opts: {
  variantId: string;
  priceMajor: number;
  currency?: string;
  actorId: string | null;
}) {
  const sb = createServiceSupabase();
  const amountMinor = Math.round(Number(opts.priceMajor) * 100);
  if (!Number.isFinite(amountMinor) || amountMinor < 0) {
    throw new Error("Invalid price");
  }

  // Deactivate previous active prices
  await sb
    .from("shop_prices")
    .update({ is_active: false, effective_to: new Date().toISOString() })
    .eq("variant_id", opts.variantId)
    .eq("is_active", true);

  const { data, error } = await sb
    .from("shop_prices")
    .insert({
      variant_id: opts.variantId,
      currency: opts.currency || "NGN",
      amount_minor: amountMinor,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await sb.from("shop_audit_logs").insert({
    actor_id: opts.actorId,
    action: "price_set",
    entity_type: "shop_product_variant",
    entity_id: opts.variantId,
    payload: { amountMinor, currency: opts.currency || "NGN" },
  });
  return data;
}

export async function adminSetStock(opts: {
  variantId: string;
  qtyOnHand: number;
  locationCode?: string;
  actorId: string | null;
}) {
  const sb = createServiceSupabase();
  const code = opts.locationCode || "LOS-HUB-1";
  const { data: loc } = await sb
    .from("shop_inventory_locations")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (!loc) throw new Error(`Location ${code} not found`);

  const qty = Math.max(0, Math.floor(opts.qtyOnHand));
  const { data: existing } = await sb
    .from("shop_inventory")
    .select("*")
    .eq("variant_id", opts.variantId)
    .eq("location_id", loc.id)
    .maybeSingle();

  const prev = existing ? Number(existing.qty_on_hand) : 0;
  const reserved = existing ? Number(existing.qty_reserved) : 0;
  if (qty < reserved) {
    throw new Error(`Cannot set stock below reserved (${reserved})`);
  }

  const { data, error } = await sb
    .from("shop_inventory")
    .upsert(
      {
        variant_id: opts.variantId,
        location_id: loc.id,
        qty_on_hand: qty,
        qty_reserved: reserved,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "variant_id,location_id" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await sb.from("shop_inventory_transactions").insert({
    variant_id: opts.variantId,
    location_id: loc.id,
    delta: qty - prev,
    reason: "admin_set_stock",
    ref_type: "admin",
    actor_id: opts.actorId,
  });

  await sb.from("shop_audit_logs").insert({
    actor_id: opts.actorId,
    action: "stock_set",
    entity_type: "shop_product_variant",
    entity_id: opts.variantId,
    payload: { qtyOnHand: qty, locationCode: code },
  });
  return data;
}

export async function adminUploadProductImage(opts: {
  productId: string;
  imageDataUrl: string;
  setPrimary?: boolean;
  altText?: string | null;
  actorId: string | null;
}): Promise<{ url: string; imageId: string }> {
  const match = opts.imageDataUrl.match(
    /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/
  );
  if (!match) throw new Error("Invalid image format (PNG/JPEG/WebP)");
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 3_000_000) throw new Error("Image too large (max 3 MB)");

  const sb = createServiceSupabase();
  const { data: product } = await sb
    .from("shop_products")
    .select("id, name")
    .eq("id", opts.productId)
    .maybeSingle();
  if (!product) throw new Error("Product not found");

  const path = `products/${opts.productId}/${Date.now()}.${ext}`;
  const { error: upErr } = await sb.storage.from("shop-media").upload(path, buffer, {
    contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    cacheControl: "public, max-age=31536000",
    upsert: false,
  });
  if (upErr) throw new Error(upErr.message || "Upload failed");

  const base = getSupabaseUrl().replace(/\/$/, "");
  const url = `${base}/storage/v1/object/public/shop-media/${path}`;

  if (opts.setPrimary !== false) {
    await sb
      .from("shop_product_images")
      .update({ is_primary: false })
      .eq("product_id", opts.productId);
  }

  const { data: img, error: ie } = await sb
    .from("shop_product_images")
    .insert({
      product_id: opts.productId,
      url,
      storage_path: path,
      sort_order: opts.setPrimary === false ? 10 : 0,
      is_primary: opts.setPrimary !== false,
      alt_text: opts.altText || product.name,
    })
    .select("id")
    .single();
  if (ie) throw new Error(ie.message);

  if (opts.setPrimary !== false) {
    await sb
      .from("shop_products")
      .update({
        primary_image_url: url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.productId);
  }

  await sb.from("shop_audit_logs").insert({
    actor_id: opts.actorId,
    action: "product_image_upload",
    entity_type: "shop_product",
    entity_id: opts.productId,
    payload: { path, url },
  });

  return { url, imageId: String(img.id) };
}

export async function adminSoftDeleteProduct(
  id: string,
  actorId: string | null
) {
  const sb = createServiceSupabase();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("shop_products")
    .update({
      status: "archived",
      deleted_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select("id")
    .single();
  if (error) {
    const { data: d2, error: e2 } = await sb
      .from("shop_products")
      .update({ status: "archived", updated_at: now })
      .eq("id", id)
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);
    await sb.from("shop_audit_logs").insert({
      actor_id: actorId,
      action: "product_soft_delete",
      entity_type: "shop_product",
      entity_id: id,
      payload: { fallback: true },
    });
    return d2;
  }
  await sb.from("shop_audit_logs").insert({
    actor_id: actorId,
    action: "product_soft_delete",
    entity_type: "shop_product",
    entity_id: id,
    payload: { deleted_at: now },
  });
  return data;
}

export async function adminCreateCategory(input: {
  name: string;
  slug?: string;
  tradeKey?: string;
  parentId?: string | null;
  actorId: string | null;
}) {
  const sb = createServiceSupabase();
  const tradeKey = input.tradeKey || "mechanic";
  const slug = slugify(input.slug || input.name);
  const { data, error } = await sb
    .from("shop_trade_categories")
    .insert({
      trade_key: tradeKey,
      slug,
      name: input.name.trim(),
      parent_id: input.parentId || null,
      depth: input.parentId ? 1 : 0,
      path: `/${slug}`,
      sort_order: 99,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await sb.from("shop_audit_logs").insert({
    actor_id: input.actorId,
    action: "category_create",
    entity_type: "shop_trade_category",
    entity_id: data.id,
    payload: { slug, name: input.name },
  });
  return data;
}

export async function adminSoftDeleteCategory(
  id: string,
  actorId: string | null
) {
  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("shop_trade_categories")
    .update({ is_active: false })
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await sb.from("shop_audit_logs").insert({
    actor_id: actorId,
    action: "category_soft_delete",
    entity_type: "shop_trade_category",
    entity_id: id,
    payload: {},
  });
  return data;
}

export async function adminListCategories() {
  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("shop_trade_categories")
    .select("id, parent_id, trade_key, slug, name, depth, path, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
