import { MAX_NEGOTIATION_OFFERS } from "@/lib/jobs/constants";
import type { CreateJobInput, JobRecord } from "@/lib/jobs/types";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";
import { memory } from "./constants";
import { nowIso, uid, rowToJob, jobToDbPatch, clampCustomerRadius } from "./mappers";
import { cacheJob } from "./cache";
import { getJobRaw } from "./reads";

async function startOpenSearchIfNeeded(
  job: JobRecord,
  input: CreateJobInput,
): Promise<JobRecord> {
  if (input.repairProId) return job;
  try {
    const { advancePairing } =
      await import("@/lib/server/pairing/pairing-engine");
    await advancePairing(job.id);
    const fresh = await getJobRaw(job.id);
    return fresh || job;
  } catch (e) {
    console.error("[sspe] open-search start failed", e);
    return job;
  }
}

/** Best-effort Call-Out quote. Never blocks job create / SSPE. */
async function attachCalloutQuietly(
  job: JobRecord,
  input: CreateJobInput,
): Promise<JobRecord> {
  // Fire-and-forget: do not await callout classification before dispatch.
  // SSPE must start in <200ms for one-click feel; callout persists in background.
  void (async () => {
    try {
      const { attachCalloutToRequest } =
        await import("@/lib/server/callout/quote");
      await attachCalloutToRequest({
        requestId: job.id,
        problem: input.problem,
        selectedTrade: input.serviceType,
        destination: input.motoristLocation,
        proId: input.repairProId,
        atWorkshop: input.atWorkshop,
        remoteConsultation: input.remoteConsultation,
        physicalAttendanceRequired: input.physicalAttendanceRequired,
        calloutEligible: input.calloutEligible,
        tradeLocked: true,
        urgencyKind: input.calloutUrgency || "normal",
      });
    } catch (e) {
      console.error("[callout] attach failed", e);
    }
  })();
  void createScheduledLinkedRequestIfNeeded(job, input).catch(() => undefined);
  return startOpenSearchIfNeeded(job, input);
}

/**
 * Tow "add another repair pro": after the primary (tow) request is persisted,
 * also create a SCHEDULED second request for `input.meetProTrade` same
 * details, new trade, linked to the primary via `linked_request_id`.
 * It is NOT dispatched yet: the pairing engine arms `scheduled_dispatch_at`
 * (now + SECOND_PRO_DELAY_MS) the moment the primary's pro accepts; the
 * scheduled-dispatch sweep then pings the motorist to enter their current
 * address, which dispatches it.
 */
async function createScheduledLinkedRequestIfNeeded(
  job: JobRecord,
  input: CreateJobInput,
): Promise<void> {
  const trade = input.meetProTrade;
  if (!trade) return;
  if (!isSupabaseAdminConfigured()) return;
  const sb = createServiceSupabase();
  try {
    // Idempotent replay: a replayed createJob must never double the linked request.
    const { data: existing } = await sb
      .from("service_requests")
      .select("id")
      .eq("linked_request_id", job.id)
      .eq("flow_status", "scheduled")
      .maybeSingle();
    if (existing?.id) return;

    const ts = nowIso();
    const id = uid("job");
    const ends = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const second: JobRecord = {
      id,
      clientRequestId: null,
      motoristId: job.motoristId,
      motoristName: job.motoristName,
      motoristPhoto: job.motoristPhoto,
      motoristVehicle: job.motoristVehicle,
      repairProId: "",
      repairProName: "",
      repairProPhoto: undefined,
      serviceType: trade,
      problem: job.problem,
      voiceNote: job.voiceNote || null,
      photos: job.photos,
      status: "scheduled",
      currency: job.currency,
      proBaseMajor: null,
      agreedMajor: null,
      offers: [],
      negotiateEndsAt: ends,
      maxOffers: MAX_NEGOTIATION_OFFERS,
      locationLabel: job.locationLabel,
      motoristLocation: job.motoristLocation,
      proLocation: null,
      statusHistory: [{ status: "scheduled", at: ts, by: "motorist" }],
      pairingStage: "scheduled",
      pairingDeadline: null,
      queuePosition: null,
      remainingCandidates: null,
      reservationStatus: null,
      assignmentStatus: null,
      pairingRadiusKm: job.radiusKm,
      radiusKm: job.radiusKm,
      linkedRequestId: job.id,
      scheduledDispatchAt: null,
      dispatchNotifiedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };

    const { data, error } = await sb
      .from("service_requests")
      .insert({
        id,
        client_request_id: null,
        motorist_id: job.motoristId,
        repair_pro_id: null,
        service_type: trade,
        status: "requested",
        description: second.problem,
        pickup_lat: second.motoristLocation.lat,
        pickup_lng: second.motoristLocation.lng,
        pickup_address: second.locationLabel,
        radius_km: second.radiusKm,
        ...jobToDbPatch(second),
        flow_status: "scheduled",
        pairing_stage: "scheduled",
        created_at: ts,
      })
      .select("*")
      .maybeSingle();
    if (data) {
      const mapped = rowToJob(data as Record<string, unknown>);
      mapped.photos = second.photos;
      mapped.voiceNote = second.voiceNote;
      memory.set(mapped.id, mapped);
    }
    if (error) {
      console.error("[second-pro] create linked request failed", error.message);
    }
  } catch (e) {
    console.error("[second-pro] create linked request error", e);
  }
}

export async function createJob(input: CreateJobInput): Promise<JobRecord> {
  const ts = nowIso();
  // Negotiation clock does NOT start until Repair Pro taps "I can fix this".
  // Far-future sentinel so expire logic / UI know the timer is unarmed.
  const ends = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const id = uid("job");

  // Prefer explicit photo; else hydrate from profiles.avatar_url
  let motoristPhoto = input.motoristPhoto?.trim() || null;
  if (!motoristPhoto && isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("profiles")
        .select("avatar_url")
        .eq("id", input.motoristId)
        .maybeSingle();
      if (data?.avatar_url) motoristPhoto = String(data.avatar_url);
    } catch {
      /* optional */
    }
  }

  const job: JobRecord = {
    id,
    clientRequestId: input.clientRequestId || null,
    motoristId: input.motoristId,
    motoristName: input.motoristName,
    motoristPhoto,
    motoristVehicle: input.motoristVehicle?.trim() || null,
    repairProId: input.repairProId || "",
    repairProName: input.repairProName || "",
    repairProPhoto: input.repairProPhoto,
    serviceType: input.serviceType,
    problem: input.emergency ? `EMERGENCY: ${input.problem}` : input.problem,
    voiceNote: input.voiceNote || null,
    photos: input.photos || [],
    status: "waiting_for_selected",
    currency: input.currency,
    proBaseMajor: input.proBaseMajor ?? null,
    agreedMajor: null,
    offers: [],
    negotiateEndsAt: ends,
    maxOffers: MAX_NEGOTIATION_OFFERS,
    locationLabel: input.locationLabel,
    motoristLocation: input.motoristLocation,
    motoristLocationAt: ts,
    proLocation: null,
    statusHistory: [{ status: "waiting_for_selected", at: ts, by: "motorist" }],
    pairingStage: "waiting_for_selected",
    // Timer stays NULL until the request actually appears on the pro's screen.
    // The surface endpoint arms pairing_deadline exactly once at that moment
    // (chosen pro + open search alike), so customer ring and pro card both
    // start from 66 together and never roll back.
    pairingDeadline: null,
    queuePosition: 1,
    remainingCandidates: null,
    reservationStatus: null,
    assignmentStatus: null,
    pairingRadiusKm: clampCustomerRadius(input.radiusKm),
    radiusKm: clampCustomerRadius(input.radiusKm),
    chosenProId: input.repairProId || null,
    createdAt: ts,
    updatedAt: ts,
  };

  const openSearch = !input.repairProId;
  if (openSearch) {
    job.status = "sequential_pairing";
    job.pairingStage = "sequential_pairing";
    job.queuePosition = 0;
    job.statusHistory = [
      { status: "sequential_pairing", at: ts, by: "motorist" },
    ];
  }

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      // Idempotent replay: a sticker we've seen before already created the
      // request. Return that job instead of creating a second one.
      if (input.clientRequestId) {
        const { data: existing } = await sb
          .from("service_requests")
          .select("*")
          .eq("motorist_id", input.motoristId)
          .eq("client_request_id", input.clientRequestId)
          .maybeSingle();
        if (existing) {
          const mapped = rowToJob(existing as Record<string, unknown>);
          memory.set(mapped.id, mapped);
          return attachCalloutQuietly(mapped, input);
        }
      }
      const { data, error } = await sb
        .from("service_requests")
        .insert({
          id: job.id,
          client_request_id: input.clientRequestId || null,
          motorist_id: input.motoristId,
          repair_pro_id: input.repairProId || null,
          service_type: input.serviceType,
          status: "requested",
          description: job.problem,
          pickup_lat: input.motoristLocation.lat,
          pickup_lng: input.motoristLocation.lng,
          pickup_address: input.locationLabel,
          radius_km: clampCustomerRadius(input.radiusKm),
          ...jobToDbPatch(job),
          flow_status: job.pairingStage,
          pairing_stage: job.pairingStage,
          pairing_deadline: job.pairingDeadline,
          queue_position: job.queuePosition,
          chosen_pro_id: input.repairProId || null,
          created_at: ts,
        })
        .select("*")
        .single();
      if (!error && data) {
        if (input.repairProId) {
          // The customer-chosen pro is the first queue entry (position 1).
          await sb.from("request_pairing_queue").insert({
            request_id: job.id,
            pro_id: input.repairProId,
            position: 1,
            source: "chosen",
            status: "offered",
            offered_at: ts,
          });
        }
        const mapped = rowToJob(data as Record<string, unknown>);
        // preserve client-generated media / vehicle if DB stripped columns
        mapped.photos = job.photos;
        mapped.voiceNote = job.voiceNote;
        mapped.motoristPhoto = mapped.motoristPhoto || motoristPhoto;
        mapped.motoristVehicle =
          mapped.motoristVehicle || job.motoristVehicle || null;
        memory.set(mapped.id, mapped);
        // Instantly notify assigned repair pro
        if (input.repairProId) {
          try {
            const { insertNotification } =
              await import("@/lib/server/notifications");
            await insertNotification({
              userId: input.repairProId,
              category: "requests",
              priority: "high",
              title: "Service Request",
              body: `New request from ${job.motoristName} · ${job.problem.slice(0, 80)}`,
              href: `/jobs/${job.id}`,
              actionType: "open_job",
              actionPayload: { jobId: job.id },
              jobId: job.id,
              jobStatus: "waiting_for_selected",
              groupKey: `service-request-${job.id}`,
            });
          } catch {
            /* optional */
          }
        }
        return attachCalloutQuietly(mapped, input);
      }
      // Insert may fail if motorist_vehicle column missing retry without it
      if (error) {
        // Unique-violation race: an identical request (same sticker) won.
        // Replay its job instead of creating a duplicate.
        if (
          input.clientRequestId &&
          String((error as { code?: string }).code) === "23505"
        ) {
          const { data: raced } = await sb
            .from("service_requests")
            .select("*")
            .eq("motorist_id", input.motoristId)
            .eq("client_request_id", input.clientRequestId)
            .maybeSingle();
          if (raced) {
            const mapped = rowToJob(raced as Record<string, unknown>);
            memory.set(mapped.id, mapped);
            return attachCalloutQuietly(mapped, input);
          }
        }
        const { motorist_vehicle: _mv, ...rest } = {
          id: job.id,
          client_request_id: input.clientRequestId || null,
          motorist_id: input.motoristId,
          repair_pro_id: input.repairProId || null,
          service_type: input.serviceType,
          status: "requested",
          description: job.problem,
          pickup_lat: input.motoristLocation.lat,
          pickup_lng: input.motoristLocation.lng,
          pickup_address: input.locationLabel,
          radius_km: clampCustomerRadius(input.radiusKm),
          ...jobToDbPatch(job),
          flow_status: job.pairingStage,
          pairing_stage: job.pairingStage,
          pairing_deadline: job.pairingDeadline,
          queue_position: job.queuePosition,
          chosen_pro_id: input.repairProId || null,
          created_at: ts,
        } as Record<string, unknown>;
        void _mv;
        const retry = await sb
          .from("service_requests")
          .insert(rest)
          .select("*")
          .single();
        if (!retry.error && retry.data) {
          if (input.repairProId)
            await sb.from("request_pairing_queue").insert({
              request_id: job.id,
              pro_id: input.repairProId,
              position: 1,
              source: "chosen",
              status: "offered",
              offered_at: ts,
            });
          const mapped = rowToJob(retry.data as Record<string, unknown>);
          mapped.photos = job.photos;
          mapped.voiceNote = job.voiceNote;
          mapped.motoristPhoto = mapped.motoristPhoto || motoristPhoto;
          mapped.motoristVehicle = job.motoristVehicle || null;
          // Best-effort store vehicle in problem_text prefix is avoided;
          // hydrateMotoristVehicle will fill from profile if needed
          memory.set(mapped.id, mapped);
          // Try update with vehicle only (if column exists)
          if (job.motoristVehicle) {
            try {
              await sb
                .from("service_requests")
                .update({ motorist_vehicle: job.motoristVehicle })
                .eq("id", mapped.id);
            } catch {
              /* column may not exist yet */
            }
          }
          if (input.repairProId) {
            try {
              const { insertNotification } =
                await import("@/lib/server/notifications");
              await insertNotification({
                userId: input.repairProId,
                category: "requests",
                priority: "high",
                title: "Service Request",
                body: `New request from ${job.motoristName} · ${job.problem.slice(0, 80)}`,
                href: `/jobs/${job.id}`,
                actionType: "open_job",
                actionPayload: { jobId: job.id },
                jobId: job.id,
                groupKey: `service-request-${job.id}`,
              });
            } catch {
              /* optional */
            }
          }
          return attachCalloutQuietly(mapped, input);
        }
      }
    } catch {
      /* memory */
    }
  }

  cacheJob(job);
  return attachCalloutQuietly(job, input);
}
