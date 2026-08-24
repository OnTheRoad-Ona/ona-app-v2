/**
 * Support tickets extend Care desk (Phase B).
 */

import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import {
  createTicket,
  listTickets,
} from "@/lib/server/modules/support/tickets";
import { writeAuditLog } from "@/lib/server/modules/audit";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const status = new URL(req.url).searchParams.get("status") || undefined;
    const tickets = await listTickets({ status, limit: 50 });
    return apiOk({ tickets });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, e.code || "auth");
    return apiFail(
      e instanceof Error ? e.message : "Failed to list tickets",
      500,
    );
  }
}

const postSchema = z.object({
  subject: z.string().min(1).max(200),
  category: z.string().optional(),
  priority: z.string().optional(),
  requesterId: z.string().uuid().optional().nullable(),
  relatedJobId: z.string().uuid().optional().nullable(),
  body: z.string().optional(),
});

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const { session } = await requireAdmin();
    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiFail("Invalid body", 400);

    const ticket = await createTicket({
      ...parsed.data,
      actorId: session.userId,
    });
    await writeAuditLog({
      adminId: session.userId,
      action: "ticket.create",
      meta: { ticketId: ticket.id },
    });
    return apiOk({ ticket });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, e.code || "auth");
    return apiFail(
      e instanceof Error ? e.message : "Failed to create ticket",
      500,
    );
  }
}
