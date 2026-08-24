import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isExpressTrade, isValidScheduleTime } from "@/lib/express/pricing";
import { composeExpressProblem } from "@/lib/express/question-engine";
import { createExpressBooking } from "@/lib/server/express/store";
import { computeExpressQuote } from "@/lib/server/express/quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  trade: z.string().min(1),
  answers: z.record(z.string(), z.string()).default({}),
  vehicleLabel: z.string().max(200).optional().nullable(),
  lat: z.number(),
  lng: z.number(),
  locationLabel: z.string().max(300).default("Near you"),
  bookingType: z.enum(["instant", "scheduled"]),
  urgency: z.string().optional(),
  scheduledAt: z.string().optional().nullable(),
});

/** Create the express booking + init upfront payment (base + call-out). */
export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success || !isExpressTrade(parsed.data.trade)) {
      return apiFail("Invalid express booking", 400, "validation");
    }
    const b = parsed.data;

    let scheduledAt: string | null = null;
    if (b.bookingType === "scheduled") {
      if (!b.scheduledAt || !isValidScheduleTime(b.scheduledAt, Date.now())) {
        return apiFail(
          "Scheduled time must be within the next 7 days",
          400,
          "validation",
        );
      }
      scheduledAt = new Date(b.scheduledAt).toISOString();
    }

    const sb = createServiceSupabase();
    // Server computes the price client totals are never trusted.
    const quote = await computeExpressQuote(
      b.trade,
      b.lat,
      b.lng,
      b.urgency ?? "normal",
    );

    // A customer has at most one live Express booking: retire older
    // unpaid drafts so abandoned sessions never linger as open requests.
    await sb
      .from("service_requests")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "superseded by a newer Ona Express booking",
      })
      .eq("motorist_id", auth.userId)
      .eq("source", "express")
      .eq("status", "draft");

    const requestId = randomUUID();
    const problem = [
      composeExpressProblem(b.answers),
      b.vehicleLabel ? `Vehicle: ${b.vehicleLabel}` : "",
      `Booking: ${b.bookingType}${scheduledAt ? ` (${scheduledAt})` : ""}`,
    ]
      .filter(Boolean)
      .join("\n");

    await createExpressBooking({
      sb,
      requestId,
      motoristId: auth.userId,
      serviceType: b.trade,
      problem,
      lat: b.lat,
      lng: b.lng,
      locationLabel: b.locationLabel,
      scheduledAt,
    });

    return apiOk({ requestId, quote });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Booking failed", 500);
  }
}
