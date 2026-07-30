import { createHash, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accessToken: z.string().min(1),
  imageDataUrl: z.string().min(20).max(5_000_000),
});

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server not configured", 503);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return apiFail("Invalid payload", 400);

  const { accessToken, imageDataUrl } = parsed.data;

  // Verify user
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  const userClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken);
  if (userErr || !userData.user) {
    return apiFail("Session expired. Sign in again.", 401, "session_expired");
  }
  const userId = userData.user.id;

  // Validate and decode the data URL
  const match = imageDataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return apiFail("Invalid image format. Accepted: PNG, JPEG, WebP.", 400);
  }
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const base64 = match[2];

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return apiFail("Could not decode image data.", 400);
  }

  // Size check (max 2 MB)
  if (buffer.length > 2_000_000) {
    return apiFail("Image too large (max 2 MB).", 400);
  }

  // Upload to Supabase Storage
  const id = createHash("sha256").update(`${userId}:${randomUUID()}`).digest("hex").slice(0, 16);
  const filePath = `${userId}/${id}.${ext}`;

  const admin = createServiceSupabase();
  const { error: uploadErr } = await admin.storage.from("avatars").upload(filePath, buffer, {
    contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
    cacheControl: "public, max-age=31536000",
    upsert: false,
  });

  if (uploadErr) {
    return apiFail("Could not upload image. Try again.", 500);
  }

  const publicUrl = `${url}/storage/v1/object/public/avatars/${filePath}`;

  return apiOk({ url: publicUrl });
}
