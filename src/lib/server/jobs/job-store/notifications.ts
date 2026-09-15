import type { JobRecord } from "@/lib/jobs/types";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";
import { nowIso } from "./mappers";

export async function notifyPayoutReleased(job: JobRecord) {
  try {
    const { insertNotification, markNotificationsByGroupKey } =
      await import("@/lib/server/notifications");
    // Close the old "Confirm Job & Release Payment" notification
    if (job.motoristId) {
      await markNotificationsByGroupKey(
        job.motoristId,
        `job-complete-${job.id}`,
      );
    }
    if (job.repairProId) {
      await markNotificationsByGroupKey(
        job.repairProId,
        `job-complete-${job.id}`,
      );
    }
    // group_key dedupe one notification per user per job even if called twice
    if (job.motoristId) {
      await insertNotification({
        userId: job.motoristId,
        category: "payments",
        priority: "critical",
        title: "Payment released",
        body: "Your payment has been released to your Repair Pro.",
        href: `/jobs/${job.id}`,
        actionType: "view_payment",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "released",
        groupKey: `payout-released-${job.id}`,
      });
    }
    if (job.repairProId) {
      await insertNotification({
        userId: job.repairProId,
        category: "payments",
        priority: "critical",
        title: "Payout released",
        body: "Your labour payout has been released to your bank.",
        href: `/jobs/${job.id}`,
        actionType: "view_payment",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "released",
        groupKey: `payout-released-pro-${job.id}`,
      });
    }
  } catch {
    /* optional */
  }
}

export async function notifyPayoutPendingSettlement(job: JobRecord) {
  try {
    const { insertNotification, markNotificationsByGroupKey } =
      await import("@/lib/server/notifications");
    // Close the old "Confirm Job & Release Payment" notification
    if (job.motoristId) {
      await markNotificationsByGroupKey(
        job.motoristId,
        `job-complete-${job.id}`,
      );
    }
    if (job.repairProId) {
      await markNotificationsByGroupKey(
        job.repairProId,
        `job-complete-${job.id}`,
      );
    }
    const body =
      "Payout processing auto-retry every 10 minutes for up to 24 hours. You'll be notified when payment is released.";
    if (job.motoristId) {
      await insertNotification({
        userId: job.motoristId,
        category: "payments",
        priority: "high",
        title: "Payout processing",
        body,
        href: `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "satisfied",
        groupKey: `payout-pending-${job.id}`,
      });
    }
    if (job.repairProId) {
      await insertNotification({
        userId: job.repairProId,
        category: "payments",
        priority: "high",
        title: "Payout processing",
        body,
        href: `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "satisfied",
        groupKey: `payout-pending-pro-${job.id}`,
      });
    }
  } catch {
    /* optional */
  }
}

/** Count completed trades when customer taps I am Satisfied (successful release). */
export async function bumpProJobsCompleted(repairProId: string) {
  if (!repairProId || !isSupabaseAdminConfigured()) return;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("repair_pro_profiles")
      .select("jobs_completed")
      .eq("user_id", repairProId)
      .maybeSingle();
    const prev = Number(data?.jobs_completed) || 0;
    await sb
      .from("repair_pro_profiles")
      .update({
        jobs_completed: prev + 1,
        updated_at: nowIso(),
      })
      .eq("user_id", repairProId);
  } catch {
    /* non-fatal */
  }
}
