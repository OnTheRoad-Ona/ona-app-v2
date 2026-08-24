import { NextRequest } from "next/server";
import { AdminAuthError, requirePermission } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  adminCreateProduct,
  adminListCategories,
  adminListProducts,
  type AdminProductInput,
} from "@/lib/server/shop/admin-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List catalog products for admin. */
export async function GET(req: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    await requirePermission("shop_catalog");
    const url = req.nextUrl;
    const q = url.searchParams.get("q") || undefined;
    const tradeKey = url.searchParams.get("trade") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const listing = url.searchParams.get("listing") || undefined;
    const limit = Number(url.searchParams.get("limit") || 100);

    const [products, categories] = await Promise.all([
      adminListProducts({ q, tradeKey, status, listing, limit }),
      adminListCategories(),
    ]);
    return apiOk({ products, categories });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    const msg = e instanceof Error ? e.message : "Failed";
    if (/does not exist|Could not find the table/i.test(msg)) {
      return apiOk({
        products: [],
        categories: [],
        setupRequired: true,
        message: "Apply shop migrations 050 + 051",
      });
    }
    return apiFail(msg, 500);
  }
}

/** Create product + default variant + price + stock. */
export async function POST(req: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    const ctx = await requirePermission("shop_catalog");
    const body = (await req.json()) as Partial<AdminProductInput>;
    if (!body.name?.trim()) return apiFail("name required", 400);
    if (!body.tradeKey?.trim()) return apiFail("tradeKey required", 400);
    if (!body.categoryId?.trim()) return apiFail("categoryId required", 400);
    if (!body.sku?.trim()) return apiFail("sku required", 400);
    if (body.priceMajor == null || Number(body.priceMajor) < 0) {
      return apiFail("priceMajor required", 400);
    }

    const created = await adminCreateProduct(
      {
        name: body.name,
        subtitle: body.subtitle ?? null,
        description: body.description ?? null,
        tradeKey: body.tradeKey,
        categoryId: body.categoryId,
        brandId: body.brandId ?? null,
        conditionType: body.conditionType ?? null,
        status: body.status || "active",
        isProfessionalOnly: Boolean(body.isProfessionalOnly),
        primaryImageUrl: body.primaryImageUrl ?? null,
        sku: body.sku,
        mpn: body.mpn ?? null,
        oemNumber: body.oemNumber ?? null,
        variantTitle: body.variantTitle ?? null,
        priceMajor: Number(body.priceMajor),
        currency: body.currency || "NGN",
        stockQty: body.stockQty ?? 0,
        locationCode: body.locationCode,
      },
      ctx.session.userId,
    );
    return apiOk(created, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    const msg = e instanceof Error ? e.message : "Create failed";
    return apiFail(msg, 500);
  }
}
