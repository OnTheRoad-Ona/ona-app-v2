/**
 * Care document download proxy — serves gov ID / skill docs with service role
 * so admin can open/download even when storage is private or CORS blocks browser fetch.
 *
 * GET ?userId=&kind=front|back|pro_front|pro_back|skill
 * GET ?url=   (absolute http(s) or data: URL — re-fetched server-side when http)
 */
import { apiFail } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server not configured", 503);
  }

  const { searchParams } = new URL(req.url);
  const userId = (searchParams.get("userId") || "").trim();
  const kind = (searchParams.get("kind") || "front").trim();
  const rawUrl = (searchParams.get("url") || "").trim();

  let target: string | null = rawUrl || null;

  if (!target && userId) {
    try {
      const sb = createServiceSupabase();
      if (kind === "pro_front" || kind === "pro_back" || kind === "skill") {
        const { data } = await sb
          .from("repair_pro_profiles")
          .select(
            "gov_id_front_url, gov_id_back_url, skill_doc_url, cac_document_url, portfolio"
          )
          .eq("user_id", userId)
          .maybeSingle();
        if (kind === "pro_front")
          target = (data?.gov_id_front_url as string) || null;
        else if (kind === "pro_back")
          target = (data?.gov_id_back_url as string) || null;
        else
          target =
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
            : "jpg";
      return new Response(buf, {
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `inline; filename="ona-doc.${ext}"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return apiFail("Invalid document data", 400);
    }
  }

  // Remote URL (Supabase storage or CDN) — fetch server-side and stream
  if (target.startsWith("http://") || target.startsWith("https://")) {
    try {
      // Prefer signed URL if this is a storage path style
      const sb = createServiceSupabase();
      let fetchUrl = target;
      try {
        // public bucket path pattern: /storage/v1/object/public/BUCKET/path
        const pub = target.match(
          /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/
        );
        if (pub) {
          const bucket = pub[1];
          const path = decodeURIComponent(pub[2].split("?")[0]);
          const { data } = await sb.storage
            .from(bucket)
            .createSignedUrl(path, 120);
          if (data?.signedUrl) fetchUrl = data.signedUrl;
        }
      } catch {
        /* use original */
      }

      const res = await fetch(fetchUrl, { cache: "no-store" });
      if (!res.ok) {
        return apiFail(`Upstream document error (${res.status})`, 502);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const ctype =
        res.headers.get("content-type") || "application/octet-stream";
      return new Response(buf, {
        headers: {
          "Content-Type": ctype,
          "Content-Disposition": `inline; filename="ona-doc"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch (e) {
      return apiFail(
        e instanceof Error ? e.message : "Download failed",
        502
      );
    }
  }

  return apiFail("Unsupported document URL", 400);
}
