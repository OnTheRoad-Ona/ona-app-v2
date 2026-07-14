"use client";

/**
 * Main-app Supabase data layer (auth, pros, jobs, chat).
 * Falls back gracefully when keys/session missing.
 */

import { getAppSupabase, isAppBackendOnline } from "@/lib/supabase/app-client";
import {
  appStatusToJob,
  mapConversationToThread,
  mapProToTechnician,
  mapRequestRow,
  profileToUserProfile,
  type ConversationRow,
  type MessageRow,
} from "@/lib/supabase/mappers";
import type { ProfileRow, RepairProRow, ServiceRequestRow } from "@/lib/supabase/types";
import type {
  AccountType,
  ProService,
  ServiceRequest,
  Technician,
  UserProfile,
  MessageThread,
  RequestStatus,
} from "@/lib/types";
import { isProService } from "@/lib/services";

export { isAppBackendOnline };

export async function backendSignUp(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  accountType: AccountType;
  city?: string;
  area?: string;
  /** Repair pro */
  businessName?: string;
  primaryService?: ProService;
  bio?: string;
  yearsExperience?: string;
  serviceRadiusKm?: number;
  lat?: number;
  lng?: number;
  /** Motorist */
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
}): Promise<{ error: string | null; userId?: string; profile?: UserProfile }> {
  const sb = getAppSupabase();
  if (!sb) return { error: "Supabase is not configured." };

  const role = input.accountType === "professional" ? "repair_pro" : "motorist";
  const { data, error } = await sb.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: {
        role,
        full_name: input.fullName,
        phone: input.phone,
      },
    },
  });
  if (error) return { error: error.message };
  const userId = data.user?.id;
  if (!userId) return { error: "Signup failed — no user returned." };

  // Enrich profile row
  await sb
    .from("profiles")
    .update({
      full_name: input.fullName,
      phone: input.phone,
      email: input.email.trim().toLowerCase(),
      city: input.city || null,
      area: input.area || null,
      role,
    })
    .eq("id", userId);

  if (role === "motorist") {
    await sb.from("motorist_profiles").upsert({
      user_id: userId,
      vehicle_make: input.vehicleMake || null,
      vehicle_model: input.vehicleModel || null,
      vehicle_year: input.vehicleYear || null,
      address_text: [input.area, input.city].filter(Boolean).join(", ") || null,
      default_lat: input.lat ?? null,
      default_lng: input.lng ?? null,
    });
  } else {
    const svc = (input.primaryService && isProService(input.primaryService)
      ? input.primaryService
      : "mechanic") as ProService;
    await sb.from("repair_pro_profiles").upsert({
      user_id: userId,
      business_name: input.businessName || null,
      primary_service: svc,
      services: [svc],
      // Approve for marketplace visibility (admin can suspend later)
      status: "approved",
      is_online: true,
      bio: input.bio || null,
      years_experience: input.yearsExperience || null,
      service_radius_km: input.serviceRadiusKm ?? 10,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      verified: false,
    });
  }

  const profile = profileToUserProfile(
    {
      id: userId,
      role,
      full_name: input.fullName,
      phone: input.phone,
      email: input.email,
      avatar_url: null,
      city: input.city || null,
      area: input.area || null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      accountType: input.accountType,
      password: input.password,
      services: input.primaryService ? [input.primaryService] : undefined,
      businessName: input.businessName,
      bio: input.bio,
      yearsExperience: input.yearsExperience,
      serviceRadiusKm: input.serviceRadiusKm,
      vehicleMake: input.vehicleMake,
      vehicleModel: input.vehicleModel,
      vehicleYear: input.vehicleYear,
    }
  );

  return { error: null, userId, profile };
}

export async function backendSignIn(
  email: string,
  password: string
): Promise<{ error: string | null; profile?: UserProfile; userId?: string }> {
  const sb = getAppSupabase();
  if (!sb) return { error: "Supabase is not configured." };

  const { data, error } = await sb.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return { error: error.message };
  const userId = data.user?.id;
  if (!userId) return { error: "Login failed." };

  const loaded = await backendLoadUserProfile(userId);
  if (!loaded) return { error: "Profile not found. Complete signup first." };
  return { error: null, profile: loaded, userId };
}

export async function backendSignOut(): Promise<void> {
  const sb = getAppSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function backendGetSessionUserId(): Promise<string | null> {
  const sb = getAppSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function backendLoadUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const sb = getAppSupabase();
  if (!sb) return null;
  const { data: profile } = await sb
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;
  const p = profile as ProfileRow;
  const accountType: AccountType =
    p.role === "repair_pro" ? "professional" : "motorist";

  if (accountType === "professional") {
    const { data: pro } = await sb
      .from("repair_pro_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const pr = pro as RepairProRow | null;
    return profileToUserProfile(p, {
      accountType,
      services: (pr?.services as ProService[]) ||
        (pr?.primary_service ? [pr.primary_service as ProService] : []),
      businessName: pr?.business_name || undefined,
      bio: pr?.bio || undefined,
      yearsExperience: pr?.years_experience || undefined,
      serviceRadiusKm: pr?.service_radius_km,
      ninVerified: pr?.nin_verified,
      bvnVerified: pr?.bvn_verified,
    });
  }

  const { data: mot } = await sb
    .from("motorist_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return profileToUserProfile(p, {
    accountType,
    vehicleMake: mot?.vehicle_make || undefined,
    vehicleModel: mot?.vehicle_model || undefined,
    vehicleYear: mot?.vehicle_year || undefined,
  });
}

export async function backendFetchPros(userCoords: {
  lat: number;
  lng: number;
}): Promise<Technician[]> {
  const sb = getAppSupabase();
  if (!sb) return [];

  const { data: pros, error } = await sb
    .from("repair_pro_profiles")
    .select("*")
    .eq("status", "approved")
    .limit(80);

  if (error || !pros?.length) return [];

  const ids = pros.map((p) => (p as RepairProRow).user_id);
  const { data: profiles } = await sb
    .from("profiles")
    .select("*")
    .in("id", ids);

  const byId = new Map(
    (profiles as ProfileRow[] | null)?.map((p) => [p.id, p]) ?? []
  );

  return (pros as RepairProRow[]).map((pro) =>
    mapProToTechnician(pro, byId.get(pro.user_id) ?? null, userCoords)
  );
}

export async function backendSetProOnline(
  userId: string,
  online: boolean,
  coords?: { lat: number; lng: number }
): Promise<string | null> {
  const sb = getAppSupabase();
  if (!sb) return "Backend offline";
  const patch: Record<string, unknown> = { is_online: online };
  if (coords) {
    patch.lat = coords.lat;
    patch.lng = coords.lng;
  }
  const { error } = await sb
    .from("repair_pro_profiles")
    .update(patch)
    .eq("user_id", userId);
  return error?.message ?? null;
}

export async function backendCreateJob(input: {
  motoristId: string;
  repairProId: string;
  serviceType: ProService;
  description: string;
  lat: number;
  lng: number;
  address: string;
  radiusKm: number;
}): Promise<{ error: string | null; request?: ServiceRequest }> {
  const sb = getAppSupabase();
  if (!sb) return { error: "Backend offline" };

  const { data, error } = await sb
    .from("service_requests")
    .insert({
      motorist_id: input.motoristId,
      repair_pro_id: input.repairProId,
      service_type: input.serviceType,
      status: "requested",
      description: input.description,
      pickup_lat: input.lat,
      pickup_lng: input.lng,
      pickup_address: input.address,
      radius_km: input.radiusKm,
    })
    .select("*")
    .single();

  if (error || !data) return { error: error?.message || "Could not create job" };

  const { data: proProfile } = await sb
    .from("profiles")
    .select("full_name")
    .eq("id", input.repairProId)
    .maybeSingle();

  return {
    error: null,
    request: mapRequestRow(
      data as ServiceRequestRow,
      (proProfile as { full_name?: string } | null)?.full_name
    ),
  };
}

export async function backendUpdateJobStatus(
  requestId: string,
  status: RequestStatus,
  actorId: string
): Promise<string | null> {
  const sb = getAppSupabase();
  if (!sb) return "Backend offline";
  const jobStatus = appStatusToJob(status);
  const patch: Record<string, unknown> = { status: jobStatus };
  if (jobStatus === "accepted") {
    patch.accepted_at = new Date().toISOString();
    patch.repair_pro_id = actorId;
  }
  if (jobStatus === "completed") patch.completed_at = new Date().toISOString();
  if (jobStatus === "cancelled") patch.cancelled_at = new Date().toISOString();

  const { error } = await sb
    .from("service_requests")
    .update(patch)
    .eq("id", requestId);
  if (error) return error.message;

  await sb.from("job_status_events").insert({
    request_id: requestId,
    status: jobStatus,
    actor_id: actorId,
  });
  return null;
}

export async function backendFetchJobsForUser(
  userId: string,
  role: AccountType
): Promise<ServiceRequest[]> {
  const sb = getAppSupabase();
  if (!sb) return [];

  let q = sb.from("service_requests").select("*").order("created_at", {
    ascending: false,
  });
  if (role === "motorist") q = q.eq("motorist_id", userId);
  else q = q.or(`repair_pro_id.eq.${userId},status.in.(requested,matched)`);

  const { data, error } = await q.limit(50);
  if (error || !data) return [];

  const proIds = [
    ...new Set(
      (data as ServiceRequestRow[])
        .map((r) => r.repair_pro_id)
        .filter(Boolean) as string[]
    ),
  ];
  const names = new Map<string, string>();
  if (proIds.length) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, full_name")
      .in("id", proIds);
    for (const p of profiles || []) {
      names.set(
        (p as { id: string; full_name: string }).id,
        (p as { id: string; full_name: string }).full_name
      );
    }
  }

  return (data as ServiceRequestRow[]).map((r) =>
    mapRequestRow(r, r.repair_pro_id ? names.get(r.repair_pro_id) : undefined)
  );
}

export async function backendEnsureConversation(input: {
  requestId: string;
  motoristId: string;
  repairProId: string;
}): Promise<{ error: string | null; conversationId?: string }> {
  const sb = getAppSupabase();
  if (!sb) return { error: "Backend offline" };

  const { data: existing } = await sb
    .from("conversations")
    .select("id")
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (existing?.id) return { error: null, conversationId: existing.id as string };

  const { data, error } = await sb
    .from("conversations")
    .insert({
      request_id: input.requestId,
      motorist_id: input.motoristId,
      repair_pro_id: input.repairProId,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message || "Chat create failed" };

  await sb.from("messages").insert({
    conversation_id: data.id,
    sender_id: input.motoristId,
    body: "Chat opened for this job.",
  });

  return { error: null, conversationId: data.id as string };
}

export async function backendFetchConversations(
  userId: string,
  role: AccountType
): Promise<MessageThread[]> {
  const sb = getAppSupabase();
  if (!sb) return [];

  const col = role === "professional" ? "repair_pro_id" : "motorist_id";
  const { data: convs, error } = await sb
    .from("conversations")
    .select("*")
    .eq(col, userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(40);
  if (error || !convs?.length) return [];

  const threads: MessageThread[] = [];
  for (const c of convs as ConversationRow[]) {
    const { data: msgs } = await sb
      .from("messages")
      .select("*")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: true })
      .limit(100);

    const { data: job } = c.request_id
      ? await sb
          .from("service_requests")
          .select("service_type")
          .eq("id", c.request_id)
          .maybeSingle()
      : { data: null };

    const { data: names } = await sb
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", [c.motorist_id, c.repair_pro_id]);

    const byId = new Map(
      (
        names as
          | { id: string; full_name: string; avatar_url: string | null }[]
          | null
      )?.map((n) => [n.id, n]) ?? []
    );

    threads.push(
      mapConversationToThread(
        c,
        (msgs as MessageRow[]) || [],
        {
          motoristName: byId.get(c.motorist_id)?.full_name || "Motorist",
          technicianName: byId.get(c.repair_pro_id)?.full_name || "Repair Pro",
          serviceType: ((job as { service_type?: ProService } | null)
            ?.service_type || "mechanic") as ProService,
          photo: byId.get(c.repair_pro_id)?.avatar_url || "",
        },
        userId
      )
    );
  }
  return threads;
}

export async function backendSendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
}): Promise<string | null> {
  const sb = getAppSupabase();
  if (!sb) return "Backend offline";
  const { error } = await sb.from("messages").insert({
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body: input.body,
  });
  if (error) return error.message;
  await sb
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", input.conversationId);
  return null;
}

/** Subscribe to new messages in a conversation (Realtime). */
export function backendSubscribeMessages(
  conversationId: string,
  onInsert: (row: MessageRow) => void
): (() => void) | null {
  const sb = getAppSupabase();
  if (!sb) return null;
  const channel = sb
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        onInsert(payload.new as MessageRow);
      }
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

/** Subscribe to service request updates for multi-device job status. */
export function backendSubscribeJobs(
  userId: string,
  onChange: () => void
): (() => void) | null {
  const sb = getAppSupabase();
  if (!sb) return null;
  const channel = sb
    .channel(`jobs:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "service_requests" },
      () => onChange()
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

/** Subscribe to pro location/online changes for map. */
export function backendSubscribePros(onChange: () => void): (() => void) | null {
  const sb = getAppSupabase();
  if (!sb) return null;
  const channel = sb
    .channel("pros:live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "repair_pro_profiles" },
      () => onChange()
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}
