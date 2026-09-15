import type { JobRecord } from "@/lib/jobs/types";
import { nowIso } from "./mappers";
import { persist } from "./cache";
import { getJob } from "./reads";

export async function rateJob(input: {
  jobId: string;
  rating: number;
  note?: string;
  /** Only motorists may rate the Repair Pro */
  actor?: "motorist" | "repair_pro";
}): Promise<{ job: JobRecord } | { error: string }> {
  const job = await getJob(input.jobId);
  if (!job) return { error: "Not found" };
  if (job.status !== "released" && job.status !== "satisfied") {
    return { error: "Rate after completion" };
  }
  // Pros never rate anyone (including other pros)
  if (input.actor === "repair_pro") {
    return { error: "Only the motorist can rate and review the Repair Pro" };
  }
  if (job.rating != null) {
    return { error: "This job was already rated" };
  }
  const noteRaw = (input.note || "").trim();
  if (noteRaw.length > 144) {
    return { error: "Review max 144 characters" };
  }
  const stars = Math.min(5, Math.max(1, Math.round(input.rating)));
  const updated = await persist({
    ...job,
    rating: stars,
    ratingNote: noteRaw || null,
    updatedAt: nowIso(),
  });

  // Publish to reviews table + pro profile aggregates (motorists see before offer)
  try {
    const { publishProReview } = await import("@/lib/server/reviews");
    const pub = await publishProReview({
      requestId: job.id,
      motoristId: job.motoristId,
      repairProId: job.repairProId,
      rating: stars,
      comment: noteRaw || null,
    });
    if (!pub.ok) {
      console.warn("rateJob: profile review publish failed", pub.error);
    }
  } catch (e) {
    console.warn("rateJob: profile review publish error", e);
  }

  return { job: updated };
}
