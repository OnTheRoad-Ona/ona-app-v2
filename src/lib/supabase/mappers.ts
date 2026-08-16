import type {
  MessageThread,
  ProService,
  ServiceRequest,
  Technician,
  UserProfile,
  AccountType,
  ChatMessage,
  RequestStatus,
} from "@/lib/types";
import type {
  JobStatus,
  ProfileRow,
  RepairProRow,
  ServiceRequestRow,
  ProServiceDb,
} from "@/lib/supabase/types";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { DEFAULT_USER_LOCATION } from "@/lib/data/technicians";
import { getArtisanProfile } from "@/lib/artisan/local-store";
import {
  clampVisibilityTier,
  resolveVisibilityTier,
  rulesForTier,
} from "@/lib/artisan/visibility-tiers";
import { MAX_RADIUS_KM } from "@/lib/matching";

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function jobStatusToApp(s: JobStatus): RequestStatus {
  switch (s) {
    case "draft":
    case "requested":
    case "matched":
      return "pending";
    case "accepted":
      return "accepted";
    case "en_route":
      return "en_route";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

export function appStatusToJob(s: RequestStatus): JobStatus {
  switch (s) {
    case "pending":
      return "requested";
    case "accepted":
      return "accepted";
    case "en_route":
      return "en_route";
    case "arrived":
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "requested";
  }
}

/**
 * Pull discovery specialties from every shape used at signup / settings:
 * - skills.specialties[] (skill multiselect)
 * - skills.specialty string (pro signup Home/Office/…)
 * - vehicle_focus.specialty (home trades)
 * - services[] labels as last resort
 */
export function extractProSpecialties(pro: RepairProRow): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      for (const x of v) add(x);
      return;
    }
    if (typeof v === "object") return;
    const s = String(v).trim();
    if (!s) return;
    if (out.some((o) => o.toLowerCase() === s.toLowerCase())) return;
    out.push(s);
  };

  const skills =
    pro.skills && typeof pro.skills === "object"
      ? (pro.skills as Record<string, unknown>)
      : null;
  if (skills) {
    add(skills.specialties);
    add(skills.specialty);
    // Profession-question multiselects often stored as solar_scope etc.
    for (const [k, v] of Object.entries(skills)) {
      if (
        /scope|specialt|focus|segment|segment_type/i.test(k) &&
        k !== "specialty" &&
        k !== "specialties"
      ) {
        add(v);
      }
    }
  }

  const vf =
    pro.vehicle_focus && typeof pro.vehicle_focus === "object"
      ? (pro.vehicle_focus as Record<string, unknown>)
      : null;
  if (vf) {
    add(vf.specialty);
    add(vf.specialties);
  }

  if (out.length === 0 && Array.isArray(pro.services)) {
    for (const s of pro.services) {
      add(PRO_SERVICE_LABELS[s as ProService] ?? s);
    }
  }
  return out;
}

export function mapProToTechnician(
  pro: RepairProRow,
  profile: ProfileRow | null,
  userCoords: { lat: number; lng: number }
): Technician {
  // Prefer the pro’s own live GPS pin (updated while they are Live)
  const hasLiveLocation =
    typeof pro.lat === "number" &&
    typeof pro.lng === "number" &&
    Number.isFinite(pro.lat) &&
    Number.isFinite(pro.lng) &&
    !(pro.lat === 0 && pro.lng === 0);

  const lat = hasLiveLocation
    ? (pro.lat as number)
    : userCoords.lat ?? DEFAULT_USER_LOCATION.coordinates.lat;
  const lng = hasLiveLocation
    ? (pro.lng as number)
    : userCoords.lng ?? DEFAULT_USER_LOCATION.coordinates.lng;
  const distanceKm = hasLiveLocation
    ? haversineKm(userCoords, { lat, lng })
    : 999;
  const serviceType = (pro.primary_service || "mechanic") as ProService;
  // Placeholder ETA — /api/pros overwrites with Google Distance Matrix when possible
  const etaMinutes = hasLiveLocation
    ? distanceKm <= 0.12
      ? 1
      : distanceKm <= 0.3
        ? 2
        : Math.max(1, Math.round((distanceKm / 28) * 60))
    : 99;
  const displayName =
    (profile?.full_name || "").trim() ||
    (pro.business_name || "").trim() ||
    "Repair Pro";
  const short =
    displayName === "Repair Pro"
      ? "Pro"
      : displayName.split(/\s+/)[0]?.slice(0, 12) || "Pro";
  return {
    id: pro.user_id,
    name: displayName,
    shortName: short,
    serviceType,
    roleLabel: PRO_SERVICE_LABELS[serviceType] ?? serviceType,
    // Empty photo → map/UI uses DEFAULT_VENDOR_PHOTO (Repair Pro brand icon)
    photo: (profile?.avatar_url || "").trim(),
    // Real ratings only — start at 0 (no mock 4.5 seed)
    rating: Number(pro.rating_avg) > 0 ? Number(pro.rating_avg) : 0,
    reviewCount: pro.rating_count || 0,
    distanceKm: Math.round(distanceKm * 10) / 10,
    etaMinutes,
    // Live only → available. Away is never "nearby" on the motorist map.
    status: pro.is_online ? "available" : "offline",
    // Blue tick only for Tier 4 (skill docs approved ladder)
    verified: (() => {
      const t = Number(pro.visibility_tier);
      if (t === 4) return true;
      // Fallback when visibility_tier column missing: skill docs approved
      return pro.docs_status === "approved";
    })(),
    // Fast: Live + has real ratings (or Tier 4)
    fastResponse:
      Boolean(pro.is_online) &&
      (Number(pro.rating_avg) >= 4.3 || Number(pro.visibility_tier) === 4),
    specialties: extractProSpecialties(pro),
    description: pro.bio || "",
    phone: profile?.phone || "",
    serviceRadiusKm: (() => {
      const base = Math.min(pro.service_radius_km || MAX_RADIUS_KM, MAX_RADIUS_KM);
      const docs = pro.docs_status;
      // Cap advertised radius only while cert is under review / rejected
      // (null / approved / none → full radius)
      if (docs === "under_review" || docs === "rejected") {
        return Math.min(base, 2);
      }
      return base;
    })(),
    location: { lat, lng },
    hasLiveLocation,
    responseSpeedScore: (() => {
      if (!pro.is_online) return 0.35;
      const r = Number(pro.rating_avg) || 0;
      if (r <= 0) return 0.55;
      // 4.0 → ~0.7, 4.5 → ~0.8, 5.0 → ~0.9
      return Math.min(0.98, 0.45 + r * 0.1);
    })(),
    currentLoad: pro.is_online ? 0 : 1,
    businessName: pro.business_name || undefined,
    yearsExperience: pro.years_experience || undefined,
    bio: pro.bio || undefined,
    // Legacy rows without column → treat as approved
    docsStatus: (pro.docs_status as Technician["docsStatus"]) || "approved",
    docsRatingBoostApplied: Boolean(pro.docs_rating_boost_applied),
    skillAnswers: (pro.skills as Technician["skillAnswers"]) || undefined,
    servicePrices: (pro as { labour_prices?: Technician["servicePrices"] })
      .labour_prices,
    pricingCurrency: (pro as {
      pricing_currency?: import("@/lib/pricing").AppCurrency;
    }).pricing_currency,
    // Prefer backend visibility_tier columns; fall back to local artisan store
    ...(() => {
      let dbTier = Number(pro.visibility_tier);
      // Null/1 tier but T2-approved/verified (or approved status) → treat as T2
      // so customers can find them — stale tier must never hide an approved pro
      if (
        (!Number.isFinite(dbTier) || dbTier < 2) &&
        (Boolean(pro.verified) ||
          pro.status === "approved" ||
          pro.gov_id_review_status === "approved")
      ) {
        dbTier = 2;
      }
      if (dbTier >= 1 && dbTier <= 4) {
        const rules = rulesForTier(clampVisibilityTier(dbTier));
        return {
          visibilityTier: dbTier as 1 | 2 | 3 | 4,
          visibilityPercent: rules.visibilityPercent,
          isNewArtisan:
            pro.is_new_artisan != null
              ? Boolean(pro.is_new_artisan)
              : dbTier <= 2,
          serviceRadiusKm: Math.min(
            pro.service_radius_km || MAX_RADIUS_KM,
            rules.maxRadiusKm || MAX_RADIUS_KM
          ),
        };
      }
      try {
        if (typeof window === "undefined") {
          return {
            visibilityTier: 4 as const,
            visibilityPercent: 100,
            isNewArtisan: false,
          };
        }
        const art = getArtisanProfile(pro.user_id);
        if (!art) {
          return {
            visibilityTier: 4 as const,
            visibilityPercent: 100,
            isNewArtisan: false,
          };
        }
        const tier = resolveVisibilityTier(art);
        const rules = rulesForTier(tier);
        return {
          visibilityTier: tier,
          visibilityPercent: rules.visibilityPercent,
          isNewArtisan: rules.showNewBadge || art.isNewArtisan,
          serviceRadiusKm: Math.min(
            pro.service_radius_km || MAX_RADIUS_KM,
            rules.maxRadiusKm || MAX_RADIUS_KM
          ),
        };
      } catch {
        return {
          visibilityTier: 4 as const,
          visibilityPercent: 100,
        };
      }
    })(),
  };
}

export function mapRequestRow(
  row: ServiceRequestRow,
  proName?: string
): ServiceRequest {
  return {
    id: row.id,
    technicianId: row.repair_pro_id || "",
    technicianName: proName || "Repair Pro",
    motoristId: row.motorist_id,
    serviceType: row.service_type as ProService,
    problem: row.description || "Roadside assistance",
    status: jobStatusToApp(row.status),
    createdAt: row.created_at,
    etaMinutes: 15,
    distanceKm: 0,
    locationLabel: row.pickup_address || "Near you",
  };
}

export function profileToUserProfile(
  profile: ProfileRow,
  extra?: {
    accountType: AccountType;
    /** Original signup role — does not change when switching */
    primaryAccountType?: AccountType;
    dualRole?: boolean;
    lastRoleSwitchAt?: string;
    roleSwitchCount?: number;
    password?: string;
    services?: ProService[];
    businessName?: string;
    bio?: string;
    yearsExperience?: string;
    serviceRadiusKm?: number;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    vehiclePlate?: string;
    vehiclePhoto?: string;
    vehicleCommonIssues?: string[];
    vehicles?: UserProfile["vehicles"];
    idNumber?: string;
    bvn?: string;
    ninVerified?: boolean;
    bvnVerified?: boolean;
    govIdVerified?: boolean;
    identityVerifiedAt?: string;
    identityReviewStatus?: UserProfile["identityReviewStatus"];
    identitySubmittedAt?: string;
    govIdKind?: string;
    govIdFrontUrl?: string;
    phoneVerified?: boolean;
    firstServiceAt?: string;
    docsStatus?: UserProfile["docsStatus"];
    docsRatingBoostApplied?: boolean;
    certificationFileName?: string;
    certificationFileDataUrl?: string;
    skillAnswers?: UserProfile["skillAnswers"];
    averageRating?: number;
    jobsCompleted?: number;
    servicePrices?: UserProfile["servicePrices"];
    pricingCurrency?: UserProfile["pricingCurrency"];
    servedVehicleType?: string;
    servedBrand?: string;
    servedModel?: string;
    servedCountry?: string;
    servedLocation?: string;
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankCode?: string;
    guarantor?: UserProfile["guarantor"];
  }
): UserProfile {
  const accountType =
    extra?.accountType ||
    (profile.role === "repair_pro" ? "professional" : "motorist");
  return {
    accountType,
    // Only set when known (signup role / side-table timestamps). Do not default
    // to active role — that would overwrite primary on Motorist ↔ Pro switch.
    ...(extra?.primaryAccountType
      ? { primaryAccountType: extra.primaryAccountType }
      : {}),
    ...(typeof extra?.dualRole === "boolean"
      ? { dualRole: extra.dualRole }
      : {}),
    ...(extra?.lastRoleSwitchAt
      ? { lastRoleSwitchAt: extra.lastRoleSwitchAt }
      : {}),
    ...(typeof extra?.roleSwitchCount === "number"
      ? { roleSwitchCount: extra.roleSwitchCount }
      : {}),
    fullName: profile.full_name || "",
    phone: profile.phone || "",
    email: profile.email || "",
    avatarUrl: profile.avatar_url || "",
    password: extra?.password || "",
    gender:
      profile.gender === "male" ||
      profile.gender === "female" ||
      profile.gender === "prefer_not_to_say"
        ? profile.gender
        : undefined,
    dateOfBirth: profile.date_of_birth
      ? String(profile.date_of_birth).slice(0, 10)
      : undefined,
    city: profile.city || "",
    area: profile.area || "",
    vehicleMake: extra?.vehicleMake,
    vehicleModel: extra?.vehicleModel,
    vehicleYear: extra?.vehicleYear,
    vehiclePlate: extra?.vehiclePlate,
    vehiclePhoto: extra?.vehiclePhoto,
    vehicleCommonIssues: extra?.vehicleCommonIssues,
    vehicles: extra?.vehicles,
    businessName: extra?.businessName,
    services: extra?.services,
    serviceRadiusKm: extra?.serviceRadiusKm,
    yearsExperience: extra?.yearsExperience,
    bio: extra?.bio,
    identityId: profile.id,
    registeredAt: profile.created_at,
    idNumber: extra?.idNumber,
    bvn: extra?.bvn,
    ninVerified: extra?.ninVerified,
    bvnVerified: extra?.bvnVerified,
    govIdVerified: extra?.govIdVerified,
    identityVerifiedAt: extra?.identityVerifiedAt,
    identityReviewStatus: extra?.identityReviewStatus,
    identitySubmittedAt: extra?.identitySubmittedAt,
    govIdKind: extra?.govIdKind,
    govIdFrontUrl: extra?.govIdFrontUrl,
    phoneVerified: extra?.phoneVerified,
    firstServiceAt: extra?.firstServiceAt,
    docsStatus: extra?.docsStatus,
    docsRatingBoostApplied: extra?.docsRatingBoostApplied,
    certificationFileName: extra?.certificationFileName,
    certificationFileDataUrl: extra?.certificationFileDataUrl,
    skillAnswers: extra?.skillAnswers,
    averageRating: extra?.averageRating,
    jobsCompleted: extra?.jobsCompleted,
    servicePrices: extra?.servicePrices,
    pricingCurrency: extra?.pricingCurrency,
    servedVehicleType: extra?.servedVehicleType,
    servedBrand: extra?.servedBrand,
    servedModel: extra?.servedModel,
    servedCountry: extra?.servedCountry,
    servedLocation: extra?.servedLocation,
    bankName: extra?.bankName,
    bankAccountName: extra?.bankAccountName,
    bankAccountNumber: extra?.bankAccountNumber,
    bankCode: extra?.bankCode,
    guarantor: extra?.guarantor,
    serviceActionCount: 0,
  };
}

/**
 * Main account = whichever side profile was created first (original signup).
 * Falls back to the active role when only one side exists.
 */
export function resolvePrimaryAccountType(opts: {
  hasMotorist: boolean;
  hasPro: boolean;
  motoristCreatedAt?: string | null;
  proCreatedAt?: string | null;
  activeAccountType?: AccountType;
}): AccountType {
  const { hasMotorist, hasPro, motoristCreatedAt, proCreatedAt, activeAccountType } =
    opts;
  if (hasMotorist && hasPro) {
    const m = motoristCreatedAt ? new Date(motoristCreatedAt).getTime() : 0;
    const p = proCreatedAt ? new Date(proCreatedAt).getTime() : 0;
    if (m && p) return m <= p ? "motorist" : "professional";
    if (m) return "motorist";
    if (p) return "professional";
  }
  if (hasPro && !hasMotorist) return "professional";
  if (hasMotorist && !hasPro) return "motorist";
  return activeAccountType ?? "motorist";
}

export type ConversationRow = {
  id: string;
  request_id: string | null;
  motorist_id: string;
  repair_pro_id: string;
  last_message_at: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

/** Parse plain text or JSON voice payload from messages.body */
function parseChatBody(m: MessageRow, conv: ConversationRow): ChatMessage {
  const sender: ChatMessage["sender"] =
    m.sender_id === conv.motorist_id
      ? "motorist"
      : m.sender_id === conv.repair_pro_id
        ? "professional"
        : "system";
  const raw = m.body || "";
  if (raw.startsWith("{") && raw.includes("voiceUrl")) {
    try {
      const parsed = JSON.parse(raw) as {
        text?: string;
        voiceUrl?: string;
        voiceDurationSec?: number | null;
        voiceMime?: string | null;
      };
      if (parsed.voiceUrl) {
        return {
          id: m.id,
          sender,
          text: (parsed.text || "Voice note").trim() || "Voice note",
          at: m.created_at,
          voiceUrl: parsed.voiceUrl,
          voiceDurationSec: parsed.voiceDurationSec ?? null,
          voiceMime: parsed.voiceMime ?? null,
        };
      }
    } catch {
      /* plain text */
    }
  }
  return {
    id: m.id,
    sender,
    text: raw,
    at: m.created_at,
  };
}

/** Auto system spam we never show (legacy rows + never re-insert). */
function isAutoChatOpenedBody(body: string | null | undefined): boolean {
  const t = (body || "").trim().toLowerCase();
  if (!t) return false;
  return (
    t === "chat opened for this job." ||
    t === "chat opened for this job" ||
    t.startsWith("chat opened ·") ||
    t.startsWith("chat opened.")
  );
}

export function mapConversationToThread(
  conv: ConversationRow,
  msgs: MessageRow[],
  names: {
    motoristName: string;
    technicianName: string;
    serviceType: ProService;
    photo?: string;
  },
  myUserId: string
): MessageThread {
  // Accept newest-first or oldest-first; normalize chronological for UI
  const sorted = [...msgs].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const filtered = sorted.filter((m) => !isAutoChatOpenedBody(m.body));
  const last = filtered[filtered.length - 1];
  const chatMsgs: ChatMessage[] = filtered.map((m) => parseChatBody(m, conv));
  const unread = filtered.filter(
    (m) => !m.read_at && m.sender_id !== myUserId
  ).length;
  const lastPreview = chatMsgs[chatMsgs.length - 1];
  return {
    id: conv.id,
    requestId: conv.request_id || undefined,
    technicianId: conv.repair_pro_id,
    technicianName: names.technicianName,
    motoristName: names.motoristName,
    serviceType: names.serviceType,
    lastMessage: lastPreview
      ? lastPreview.voiceUrl
        ? lastPreview.text && lastPreview.text !== "Voice note"
          ? `🎤 ${lastPreview.text}`
          : "🎤 Voice note"
        : lastPreview.text
      : "New chat",
    time: last
      ? new Date(last.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
    unread,
    photo: names.photo || "",
    messages: chatMsgs,
  };
}

export type { ProServiceDb };
