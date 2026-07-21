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
    rating: Number(pro.rating_avg) || 4.5,
    reviewCount: pro.rating_count || 0,
    distanceKm: Math.round(distanceKm * 10) / 10,
    etaMinutes,
    // Live only → available. Away is never "nearby" on the motorist map.
    status: pro.is_online ? "available" : "offline",
    verified: Boolean(pro.verified || pro.nin_verified),
    // Fast: Live + solid rating (or explicit high response score below)
    fastResponse:
      Boolean(pro.is_online) &&
      (Number(pro.rating_avg) >= 4.3 || Boolean(pro.verified)),
    specialties: (() => {
      const skills = pro.skills as Technician["skillAnswers"] | undefined;
      const core = skills?.specialties;
      if (Array.isArray(core) && core.length) {
        return core.map(String);
      }
      return Array.isArray(pro.services)
        ? pro.services.map((s) => PRO_SERVICE_LABELS[s as ProService] ?? s)
        : [];
    })(),
    description: pro.bio || "",
    phone: profile?.phone || "",
    serviceRadiusKm: (() => {
      const base = pro.service_radius_km || 10;
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
      const r = Number(pro.rating_avg) || 4.5;
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
      const dbTier = Number(pro.visibility_tier);
      if (dbTier >= 1 && dbTier <= 4) {
        const pct =
          dbTier === 1 ? 0 : dbTier === 2 ? 30 : dbTier === 3 ? 70 : 100;
        const maxR =
          dbTier === 1 ? 0 : dbTier === 2 ? 1 : dbTier === 3 ? 3 : 10;
        return {
          visibilityTier: dbTier as 1 | 2 | 3 | 4,
          visibilityPercent: pct,
          isNewArtisan:
            pro.is_new_artisan != null
              ? Boolean(pro.is_new_artisan)
              : dbTier <= 2,
          serviceRadiusKm: Math.min(pro.service_radius_km || 10, maxR || 10),
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
        const {
          getArtisanProfile,
        } = require("@/lib/artisan/local-store") as typeof import("@/lib/artisan/local-store");
        const {
          resolveVisibilityTier,
          rulesForTier,
        } = require("@/lib/artisan/visibility-tiers") as typeof import("@/lib/artisan/visibility-tiers");
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
            pro.service_radius_km || 10,
            rules.maxRadiusKm || 10
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
    fullName: profile.full_name || "",
    phone: profile.phone || "",
    email: profile.email || "",
    password: extra?.password || "",
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
  const last = msgs[msgs.length - 1];
  const chatMsgs: ChatMessage[] = msgs.map((m) => parseChatBody(m, conv));
  const unread = msgs.filter(
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
