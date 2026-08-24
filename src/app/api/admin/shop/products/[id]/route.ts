import { NextRequest } from "next/server";
import { AdminAuthError, requirePermission } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  adminGetProduct,
  adminHardDeleteProduct,
  adminSoftDeleteProduct,
  adminUpdateProduct,
} from "@/lib/server/shop/admin-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    await requirePermission("shop_catalog");
    const { id } = await ctx.params;
    const data = await adminGetProduct(id);
    if (!data) return apiFail("Not found", 404);
    return apiOk(data);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    const msg = e instanceof Error ? e.message : "Failed";
    return apiFail(msg, 500);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    const auth = await requirePermission("shop_catalog");
    const { id } = await ctx.params;
    const body = (await req.json()) as Record<string, unknown>;
    const updated = await adminUpdateProduct(
      id,
      {
        name: body.name as string | undefined,
        subtitle: body.subtitle as string | null | undefined,
        description: body.description as string | null | undefined,
        tradeKey: body.tradeKey as string | undefined,
        categoryId: body.categoryId as string | undefined,
        brandId: body.brandId as string | null | undefined,
        conditionType: body.conditionType as string | null | undefined,
        status: body.status as "draft" | "active" | "archived" | undefined,
        isProfessionalOnly: body.isProfessionalOnly as boolean | undefined,
        primaryImageUrl: body.primaryImageUrl as string | null | undefined,
        listingOverride: (body.listingOverride ?? null) as
          | "available"
          | "low_stock"
          | "out_of_stock"
          | "pre_order"
          | "coming_soon"
          | null
          | undefined,
        attributes: (body.attributes ?? null) as Record<string, unknown> | null | undefined,
      },
      auth.session.userId,
    );
    return apiOk({ product: updated });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    const msg = e instanceof Error ? e.message : "Update failed";
    return apiFail(msg, 500);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    const auth = await requirePermission("shop_catalog");
    const { id } = await ctx.params;
    // ?hard=1 → permanent delete (product + cascaded children). Default stays
    // soft-archive for backward compatibility.
    const hard = new URL(_req.url).searchParams.get("hard") === "1";
    if (hard) {
      const deleted = await adminHardDeleteProduct(id, auth.session.userId);
      return apiOk({ product: deleted, hardDeleted: true });
    }
    const deleted = await adminSoftDeleteProduct(id, auth.session.userId);
    return apiOk({ product: deleted, softDeleted: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    const msg = e instanceof Error ? e.message : "Delete failed";
    return apiFail(msg, 500);
  }
}
