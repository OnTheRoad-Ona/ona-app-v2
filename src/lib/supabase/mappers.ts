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
  const lat = pro.lat ?? DEFAULT_USER_LOCATION.coordinates.lat;
  const lng = pro.lng ?? DEFAULT_USER_LOCATION.coordinates.lng;
  const distanceKm = haversineKm(userCoords, { lat, lng });
  const serviceType = (pro.primary_service || "mechanic") as ProService;
  const etaMinutes = Math.max(5, Math.round(distanceKm * 4 + 6));
  return {
    id: pro.user_id,
    name: profile?.full_name || pro.business_name || "Repair Pro",
    shortName: (profile?.full_name || "RP").slice(0, 12),
    serviceType,
    roleLabel: PRO_SERVICE_LABELS[serviceType] ?? serviceType,
    photo: profile?.avatar_url || "",
    rating: Number(pro.rating_avg) || 4.5,
    reviewCount: pro.rating_count || 0,
    distanceKm: Math.round(distanceKm * 10) / 10,
    etaMinutes,
    status: pro.is_online
      ? "available"
      : pro.status === "approved"
        ? "nearby"
        : "offline",
    verified: pro.verified || pro.nin_verified,
    fastResponse: pro.is_online,
    specialties: Array.isArray(pro.services)
      ? pro.services.map((s) => PRO_SERVICE_LABELS[s as ProService] ?? s)
      : [],
    description: pro.bio || "",
    phone: profile?.phone || "",
    serviceRadiusKm: pro.service_radius_km || 10,
    location: { lat, lng },
    responseSpeedScore: pro.is_online ? 0.9 : 0.5,
    currentLoad: pro.is_online ? 0 : 1,
    businessName: pro.business_name || undefined,
    yearsExperience: pro.years_experience || undefined,
    bio: pro.bio || undefined,
    skillAnswers: (pro.skills as Technician["skillAnswers"]) || undefined,
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
    password?: string;
    services?: ProService[];
    businessName?: string;
    bio?: string;
    yearsExperience?: string;
    serviceRadiusKm?: number;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    ninVerified?: boolean;
    bvnVerified?: boolean;
  }
): UserProfile {
  const accountType =
    extra?.accountType ||
    (profile.role === "repair_pro" ? "professional" : "motorist");
  return {
    accountType,
    fullName: profile.full_name || "",
    phone: profile.phone || "",
    email: profile.email || "",
    password: extra?.password || "",
    city: profile.city || "",
    area: profile.area || "",
    vehicleMake: extra?.vehicleMake,
    vehicleModel: extra?.vehicleModel,
    vehicleYear: extra?.vehicleYear,
    businessName: extra?.businessName,
    services: extra?.services,
    serviceRadiusKm: extra?.serviceRadiusKm,
    yearsExperience: extra?.yearsExperience,
    bio: extra?.bio,
    identityId: profile.id,
    registeredAt: profile.created_at,
    ninVerified: extra?.ninVerified,
    bvnVerified: extra?.bvnVerified,
    serviceActionCount: 0,
  };
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
  const chatMsgs: ChatMessage[] = msgs.map((m) => ({
    id: m.id,
    sender:
      m.sender_id === conv.motorist_id
        ? "motorist"
        : m.sender_id === conv.repair_pro_id
          ? "professional"
          : "system",
    text: m.body,
    at: m.created_at,
  }));
  const unread = msgs.filter(
    (m) => !m.read_at && m.sender_id !== myUserId
  ).length;
  return {
    id: conv.id,
    requestId: conv.request_id || undefined,
    technicianId: conv.repair_pro_id,
    technicianName: names.technicianName,
    motoristName: names.motoristName,
    serviceType: names.serviceType,
    lastMessage: last?.body || "New chat",
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
