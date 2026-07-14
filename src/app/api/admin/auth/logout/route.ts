import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE } from "@/lib/server/admin-auth";
import { apiOk } from "@/lib/server/api-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return apiOk({ loggedOut: true });
}
