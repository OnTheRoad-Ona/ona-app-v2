import { z } from "zod";
import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { setHealthLogResolved } from "@/lib/server/health-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  id: z.string().uuid(),
  resolved: z.boolean(),
});

/** PATCH mark issue resolved / reopen */
export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const json = await req.json();
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) return apiFail("Invalid body", 400);

    const res = await setHealthLogResolved(
      parsed.data.id,
      parsed.data.resolved,
    );
    if (!res.ok) return apiFail(res.error, 500);
    return apiOk({ id: parsed.data.id, resolved: parsed.data.resolved });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to update log", 500);
  }
}
