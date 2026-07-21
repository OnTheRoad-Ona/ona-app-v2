/**
 * Support tickets CRM foundation (Phase A scaffold).
 */

import { createServiceSupabase } from "@/lib/supabase/server";

export type TicketStatus =
  | "open"
  | "pending"
  | "in_progress"
  | "resolved"
  | "closed";

export async function createTicket(input: {
  requesterId?: string | null;
  subject: string;
  category?: string;
  priority?: string;
  relatedJobId?: string | null;
  body?: string;
  actorId?: string | null;
}) {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      requester_id: input.requesterId ?? null,
      subject: input.subject,
      category: input.category || "general",
      priority: input.priority || "normal",
      status: "open",
      related_job_id: input.relatedJobId ?? null,
    })
    .select("id, ticket_number, status, created_at")
    .single();
  if (error) throw error;

  if (input.body) {
    await supabase.from("support_ticket_events").insert({
      ticket_id: data.id,
      actor_id: input.actorId ?? input.requesterId ?? null,
      event_type: "created",
      body: input.body,
      is_internal: false,
    });
  }
  return data;
}

export async function listTickets(opts?: {
  status?: string;
  limit?: number;
}) {
  const supabase = createServiceSupabase();
  let q = supabase
    .from("support_tickets")
    .select(
      "id, ticket_number, subject, category, priority, status, requester_id, assigned_to, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
