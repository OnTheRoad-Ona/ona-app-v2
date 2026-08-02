/**
 * Care document proxy — Admin + Customer Care only.
 * View in-browser (inline). Download is blocked for everyone else.
 * Support role cannot access review / ID / skill files.
 *
 * GET ?userId=&kind=front|back|pro_front|pro_back|skill|selfie|cac|cert
 * GET ?url=   (absolute http(s) or data: URL — re-fetched server-side when http)
 */
import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail } from "@/lib/server/api-json";
import { roleHasPermission } from "@/lib/server/modules/admin-roles";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canViewReviewFiles(role: string | undefined): boolean {
  // Super Admin + Customer Care only (view_pii). Support cannot open docs.
  if (role === "support") return false;
  if (role === "customer_care" || role === "super_admin") {
    return roleHasPermission(role, "view_pii");
  }
  // Legacy admin without role → treat as super admin
  return true;
}

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server not configured", 503);
  }

  try {
    const { adminRole } = await requireAdmin();
    if (!canViewReviewFiles(adminRole)) {
      return apiFail(
        "Only Admin and Customer Care can view review documents.",
        403,
        "docs_forbidden"
      );
    }
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Unauthorized", 401);
  }

  const { searchParams } = new URL(req.url);
  const userId = (searchParams.get("userId") || "").trim();
  const kind = (searchParams.get("kind") || "front").trim();
  const rawUrl = (searchParams.get("url") || "").trim();
  // Never allow attachment/download for public scrapers — inline view only
  const forceDownload = searchParams.get("download") === "1";
  if (forceDownload) {
    return apiFail(
      "Downloading review or backend identity files is not allowed. View only for Admin and Customer Care.",
      403,
      "download_forbidden"
    );
  }

  let target: string | null = rawUrl || null;

  if (!target && userId) {
    try {
      const sb = createServiceSupabase();
      if (
        kind === "pro_front" ||
        kind === "pro_back" ||
        kind === "skill" ||
        kind === "selfie" ||
        kind === "cac" ||
        kind === "cert"
      ) {
        const { data } = await sb
          .from("repair_pro_profiles")
          .select(
            "gov_id_front_url, gov_id_back_url, skill_doc_url, cac_document_url, certification_file_url, face_liveness_selfie_url, portfolio"
          )
          .eq("user_id", userId)
          .maybeSingle();
        if (kind === "pro_front")
          target = (data?.gov_id_front_url as string) || null;
        else if (kind === "pro_back")
          target = (data?.gov_id_back_url as string) || null;
        else if (kind === "selfie")
          target = (data?.face_liveness_selfie_url as string) || null;
        else if (kind === "cac")
          target = (data?.cac_document_url as string) || null;
        else
          // skill | cert — any skill proof column
          target =
            (data?.certification_file_url as string) ||
            (data?.skill_doc_url as string) ||
            (data?.cac_document_url as string) ||
            null;
      } else {
        const { data } = await sb
          .from("motorist_profiles")
          .select("gov_id_front_url, gov_id_back_url")
          .eq("user_id", userId)
          .maybeSingle();
        target =
          kind === "back"
            ? ((data?.gov_id_back_url as string) || null)
            : ((data?.gov_id_front_url as string) || null);
      }
    } catch (e) {
      return apiFail(
        e instanceof Error ? e.message : "Could not load document",
        500
      );
    }
  }

  if (!target) {
    return apiFail("Document not found", 404, "not_found");
  }

  const viewHeaders = (mime: string, ext: string) => ({
    "Content-Type": mime,
    // Inline only — no attachment (blocks “Save as / download” intent)
    "Content-Disposition": `inline; filename="ona-view.${ext}"`,
    "Cache-Control": "private, max-age=60, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Ona-Doc-Access": "view-only-admin-care",
  });

  // data: URLs — return decoded bytes
  if (target.startsWith("data:")) {
    try {
      const m = target.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!m) {
        return new Response(target, {
          headers: { "Content-Type": "text/plain" },
        });
      }
      const mime = m[1] || "application/octet-stream";
      const buf = Buffer.from(m[2], "base64");
      const ext = mime.includes("png")
        ? "png"
        : mime.includes("webp")
          ? "webp"
          : mime.includes("pdf")
            ? "pdf"
            : mime.includes("mp4")
              ? "mp4"
              : mime.includes("webm")
                ? "webm"
                : mime.startsWith("video/")
                  ? "mp4"
                  : "jpg";
      return new Response(buf, {
        headers: viewHeaders(mime, ext),
      });
    } catch {
      return apiFail("Invalid document data", 400);
    }
  }

  // Remote URL (Supabase storage or CDN) — fetch server-side and stream
  if (target.startsWith("http://") || target.startsWith("https://")) {
    try {
      const sb = createServiceSupabase();
      let fetchUrl = target;
      try {
        // public | sign | authenticated object paths → short-lived signed URL
        const storageMatch = target.match(
          /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/
        );
        if (storageMatch) {
          const bucket = storageMatch[1];
          const path = decodeURIComponent(
            storageMatch[2].split("?")[0]
          );
          const { data, error } = await sb.storage
            .from(bucket)
            .createSignedUrl(path, 300);
          if (!error && data?.signedUrl) fetchUrl = data.signedUrl;
        }
      } catch {
        /* use original */
      }

      let res = await fetch(fetchUrl, { cache: "no-store" });
      // Retry once with original URL if signed fetch failed
      if (!res.ok && fetchUrl !== target) {
        res = await fetch(target, { cache: "no-store" });
      }
      if (!res.ok) {
        return apiFail(`Upstream document error (${res.status})`, 502);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const ctype =
        res.headers.get("content-type") || "application/octet-stream";
      const ext = ctype.includes("png")
        ? "png"
        : ctype.includes("webp")
          ? "webp"
          : ctype.includes("pdf")
            ? "pdf"
            : ctype.includes("mp4")
              ? "mp4"
              : ctype.includes("webm")
                ? "webm"
                : ctype.startsWith("video/")
                  ? "mp4"
                  : "jpg";
      return new Response(buf, {
        headers: viewHeaders(ctype, ext),
      });
    } catch (e) {
      return apiFail(
        e instanceof Error ? e.message : "View failed",
        502
      );
    }
  }

  return apiFail("Unsupported document URL", 400);
}
