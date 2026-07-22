import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { insertNotification } from "@/lib/server/notifications";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["motorist", "professional"]).default("motorist"),
});

/**
 * POST /api/notifications/seed
 * Seeds sample notifications when the user has none (demo + QA).
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiFail("userId required", 400);
  }
  const { userId, role } = parsed.data;

  const sb = createServiceSupabase();
  const { count, error: cErr } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (cErr) {
    if (/Could not find the table|does not exist/i.test(cErr.message || "")) {
      return apiFail(
        "Notifications table missing. Run migration 20260717_020_notifications.sql",
        503,
        "table_missing"
      );
    }
    return apiFail(cErr.message, 500);
  }
  if ((count ?? 0) > 0) {
    return apiOk({ seeded: 0, message: "Already has notifications" });
  }

  const samples =
    role === "professional"
      ? proSamples(userId)
      : motoristSamples(userId);

  let seeded = 0;
  for (const s of samples) {
    const res = await insertNotification(s);
    if (!("error" in res)) seeded += 1;
  }
  return apiOk({ seeded });
}

function motoristSamples(userId: string) {
  const now = Date.now();
  return [
    {
      userId,
      category: "requests" as const,
      priority: "high" as const,
      title: "Request accepted",
      body: "Tunde accepted your battery jump request.",
      href: "/jobs/demo-job-1",
      actionType: "open_job" as const,
      groupKey: "req-demo-1",
      jobId: "demo-job-1",
      jobStatus: "agreed",
    },
    {
      userId,
      category: "requests" as const,
      priority: "critical" as const,
      title: "Mechanic arrived",
      body: "Your Repair Pro is on site. Meet them at the gate.",
      href: "/jobs/demo-job-1",
      actionType: "view_tracking" as const,
      groupKey: "req-demo-1",
      jobId: "demo-job-1",
      jobStatus: "arrived",
    },
    {
      userId,
      category: "messages" as const,
      priority: "normal" as const,
      title: "Message from Tunde",
      body: "I am 5 minutes away. Stay put.",
      href: "/messages/demo-thread-1",
      actionType: "open_chat" as const,
      jobId: "demo-job-1",
      jobStatus: "en_route",
      messageText: "I am 5 minutes away. Stay put.",
    },
    {
      userId,
      category: "messages" as const,
      priority: "normal" as const,
      title: "Message from Ada",
      body: "Thanks for confirming. Parts are sorted.",
      actionType: "none" as const,
      jobId: "demo-job-old",
      jobStatus: "released",
      messageText:
        "Thanks for confirming. Parts are sorted. Safe drive home!",
    },
    {
      userId,
      category: "payments" as const,
      priority: "high" as const,
      title: "Escrow held",
      body: "₦12,500 labour fee is held safely until you confirm.",
      href: "/payments/history",
      actionType: "view_payment" as const,
    },
    {
      userId,
      category: "payments" as const,
      priority: "normal" as const,
      title: "Payment released",
      body: "You confirmed the job. Escrow released to your Repair Pro.",
      actionType: "view_payment" as const,
    },
    {
      userId,
      category: "system" as const,
      priority: "low" as const,
      title: "Profile tip",
      body: "Add your vehicle plate for faster matching.",
      href: "/profile",
      actionType: "none" as const,
    },
    {
      userId,
      category: "system" as const,
      priority: "normal" as const,
      title: "Welcome to Ona",
      body: "Roadside help when you need it. Stay safe.",
      actionType: "none" as const,
    },
    {
      userId,
      category: "requests" as const,
      priority: "high" as const,
      title: "ETA update",
      body: "Your pro’s ETA is now 8 minutes.",
      groupKey: "req-demo-1",
      jobId: "demo-job-1",
      jobStatus: "en_route",
      actionType: "view_tracking" as const,
      href: "/jobs/demo-job-1",
    },
  ].map((s, i) => ({
    ...s,
    // stagger timestamps for list
    // created_at set by DB; insert order is reverse-chronological after sort
    title: s.title,
    body: s.body + (i === 0 ? "" : ""),
  }));
}

function proSamples(userId: string) {
  return [
    {
      userId,
      category: "requests" as const,
      priority: "critical" as const,
      title: "New job request",
      body: "Chioma · Dead battery near Lekki Phase 1.",
      href: "/jobs",
      actionType: "accept_request" as const,
      groupKey: "incoming-chioma",
      jobStatus: "negotiating",
    },
    {
      userId,
      category: "requests" as const,
      priority: "high" as const,
      title: "New job request",
      body: "Emeka · Flat tyre · Admiralty Way.",
      href: "/jobs",
      actionType: "accept_request" as const,
      groupKey: "incoming-emeka",
      jobStatus: "negotiating",
    },
    {
      userId,
      category: "messages" as const,
      priority: "normal" as const,
      title: "Message from Chioma",
      body: "I am by the red gate.",
      href: "/messages",
      actionType: "open_chat" as const,
      jobStatus: "en_route",
      messageText: "I am by the red gate.",
    },
    {
      userId,
      category: "messages" as const,
      priority: "normal" as const,
      title: "Message from Emeka",
      body: "Great work. Thank you!",
      actionType: "none" as const,
      jobStatus: "released",
      messageText: "Great work. Thank you! Escrow should release shortly.",
    },
    {
      userId,
      category: "payments" as const,
      priority: "high" as const,
      title: "Escrow ready",
      body: "Customer paid. ₦18,000 held — start trip when ready.",
      actionType: "open_job" as const,
      href: "/jobs",
    },
    {
      userId,
      category: "payments" as const,
      priority: "normal" as const,
      title: "Payout released",
      body: "₦17,100 credited after platform fee (5%).",
      actionType: "view_payment" as const,
    },
    {
      userId,
      category: "system" as const,
      priority: "normal" as const,
      title: "Go Live reminder",
      body: "You are Away. Go Live to receive nearby requests.",
      href: "/dashboard",
      actionType: "none" as const,
    },
    {
      userId,
      category: "system" as const,
      priority: "low" as const,
      title: "Documents under review",
      body: "Your certificate is being checked by Ona Care.",
      actionType: "none" as const,
    },
    {
      userId,
      category: "requests" as const,
      priority: "high" as const,
      title: "Offer update",
      body: "Chioma countered your labour price.",
      groupKey: "incoming-chioma",
      actionType: "open_job" as const,
      href: "/jobs",
    },
  ];
}
