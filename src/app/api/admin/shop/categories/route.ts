import { NextRequest } from "next/server";
import { AdminAuthError, requirePermission } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  adminCreateCategory,
  adminListCategories,
  adminSoftDeleteCategory,
} from "@/lib/server/shop/admin-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    await requirePermission("shop_catalog");
    const categories = await adminListCategories();
    return apiOk({ categories });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    const auth = await requirePermission("shop_catalog");
    const body = (await req.json()) as {
      name?: string;
      slug?: string;
      tradeKey?: string;
      parentId?: string | null;
    };
    if (!body.name?.trim()) return apiFail("name required", 400);
    const created = await adminCreateCategory({
      name: body.name,
      slug: body.slug,
      tradeKey: body.tradeKey,
      parentId: body.parentId,
      actorId: auth.session.userId,
    });
    return apiOk({ category: created }, { status: 201 });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    return apiFail(e instanceof Error ? e.message : "Create failed", 500);
  }
}

export async function DELETE(req: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    const auth = await requirePermission("shop_catalog");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return apiFail("id required", 400);
    const deleted = await adminSoftDeleteCategory(id, auth.session.userId);
    return apiOk({ category: deleted, softDeleted: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    return apiFail(e instanceof Error ? e.message : "Delete failed", 500);
  }
}
