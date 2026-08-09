import { NextRequest } from "next/server";
import { AdminAuthError, requirePermission } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { adminUploadProductImage } from "@/lib/server/shop/admin-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Upload gallery/primary image as data URL (PNG/JPEG/WebP, max 3MB). */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const auth = await requirePermission("shop_catalog");
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      imageDataUrl?: string;
      setPrimary?: boolean;
      altText?: string | null;
    };
    if (!body.imageDataUrl) return apiFail("imageDataUrl required", 400);

    const result = await adminUploadProductImage({
      productId: id,
      imageDataUrl: body.imageDataUrl,
      setPrimary: body.setPrimary,
      altText: body.altText,
      actorId: auth.session.userId,
    });
    return apiOk(result);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    const msg = e instanceof Error ? e.message : "Upload failed";
    return apiFail(msg, 500);
  }
}
