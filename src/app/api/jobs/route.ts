import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createJob, listJobsForUser } from "@/lib/server/jobs/job-store";
import type { JobMedia } from "@/lib/jobs/types";
import { isProService } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mediaSchema = z.object({
  id: z.string(),
  kind: z.enum(["photo", "voice", "other"]),
  url: z.string(),
  name: z.string().optional(),
  mime: z.string().optional(),
  durationSec: z.number().optional(),
  createdAt: z.string(),
  uploadedBy: z.string(),
});

const createSchema = z.object({
  motoristId: z.string().min(1),
  motoristName: z.string().min(1),
  motoristPhoto: z.string().optional().nullable(),
  repairProId: z.string().min(1),
  repairProName: z.string().min(1),
  repairProPhoto: z.string().optional(),
  serviceType: z.string(),
  problem: z.string().min(3).max(2000),
  voiceNote: mediaSchema.nullable().optional(),
  photos: z.array(mediaSchema).optional(),
  currency: z
    .enum(["NGN", "USD", "GBP", "ZAR", "EUR", "GHS", "KES", "CAD", "AUD"])
    .optional()
    .default("NGN"),
  proBaseMajor: z.number().positive().nullable().optional(),
  locationLabel: z.string().optional().default("Near you"),
  lat: z.number(),
  lng: z.number(),
  motoristVehicle: z.string().max(200).optional().nullable(),
  /** Customer home radius slider (km) — caps SSPE pairing expansion */
  radiusKm: z.number().min(0).max(100).optional().nullable(),
  /** Client idempotency sticker — retries of the same request reuse it */
  clientRequestId: z.string().min(1).max(100).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiFail("Invalid job request", 400, "validation");
    }
    const b = parsed.data;

    // Only the authenticated motorist can open a job for themselves
    if (b.motoristId !== auth.userId) {
      return apiFail("You can only create jobs for your own account", 403, "forbidden");
    }
    if (!isProService(b.serviceType)) {
      return apiFail("Invalid service type", 400);
    }
    const job = await createJob({
      motoristId: b.motoristId,
      motoristName: b.motoristName,
      motoristPhoto: b.motoristPhoto || null,
      motoristVehicle: b.motoristVehicle || null,
      repairProId: b.repairProId,
      repairProName: b.repairProName,
      repairProPhoto: b.repairProPhoto,
      serviceType: b.serviceType,
      problem: b.problem.trim(),
      voiceNote: (b.voiceNote as JobMedia) || null,
      photos: (b.photos as JobMedia[]) || [],
      currency: b.currency,
      proBaseMajor: b.proBaseMajor ?? null,
      locationLabel: b.locationLabel,
      motoristLocation: { lat: b.lat, lng: b.lng },
      radiusKm: b.radiusKm ?? null,
      clientRequestId: b.clientRequestId || null,
    });
    return apiOk({ job, serverNow: new Date().toISOString() });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Could not create job",
      500
    );
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const role = searchParams.get("role") as "motorist" | "repair_pro" | null;
    if (!userId || (role !== "motorist" && role !== "repair_pro")) {
      return apiFail("userId and role required", 400);
    }
    // Never list another user's jobs
    if (userId !== auth.userId) {
      return apiFail("Forbidden", 403, "forbidden");
    }
    const lean = searchParams.get("lean") === "1";
    const jobs = await listJobsForUser(userId, role, { lean });
    return apiOk({ jobs, serverNow: new Date().toISOString() });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "List failed", 500);
  }
}
