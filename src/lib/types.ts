/**
 * Browse categories on home.
 * Real trades match Repair Pro signup (exclude "all").
 */
export type ServiceCategory =
  | "mechanic"
  | "vulcanizer"
  | "towing"
  | "battery"
  | "ac"
  | "body"
  | "electrical"
  | "diagnostics"
  | "wash"
  | "plumber"
  | "carpenter"
  | "painter"
  | "solar"
  | "generator"
  | "all";

/**
 * Services a professional can register / offer.
 * Matches home service cards (excludes "All").
 */
export type ProService =
  | "mechanic"
  | "vulcanizer"
  | "towing"
  | "battery"
  | "ac"
  | "body"
  | "electrical"
  | "diagnostics"
  | "wash"
  | "plumber"
  | "carpenter"
  | "painter"
  | "solar"
  | "generator";

/**
 * What the user registered as.
 * Determines the first screen on app open.
 * Pros can still add more services later.
 */
export type RegisteredAs = "client" | ProService;

/** Current session view: client discovery vs professional tools */
export type UserMode = "client" | "professional";

/** Account type chosen on login / sign-up */
export type AccountType = "motorist" | "professional";

/** One motorist vehicle (unlimited list on profile) */
export type MotoristVehicle = {
  id: string;
  make: string;
  model: string;
  year?: string;
  /** e.g. Automobile / Passenger Car */
  vehicleType?: string;
  plate?: string;
  photo?: string;
  commonIssues?: string[];
};

/** Full profile after Motorist or Repair Pro signup */
export interface Guarantor {
  fullName: string;
  phone: string;
  address?: string;
  occupation?: string;
  relationship: string;
  linkedUserId?: string;
}

export interface UserProfile {
  accountType: AccountType;
  /**
   * Role the user originally signed up as (main / primary account).
   * Stays fixed when they switch Motorist ↔ Repair Pro.
   */
  primaryAccountType?: AccountType;
  fullName: string;
  phone: string;
  email: string;
  /** Stored for demo session only — not a production password store */
  password: string;
  /** male | female | prefer_not_to_say — collected at signup */
  gender?: "male" | "female" | "prefer_not_to_say";
  /** ISO date YYYY-MM-DD — collected at signup */
  dateOfBirth?: string;
  city: string;
  area: string;
  /** Motorist optional vehicle (legacy single — kept as first of `vehicles`) */
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehiclePlate?: string;
  vehiclePhoto?: string;
  vehicleCommonIssues?: string[];
  /** Motorist can add unlimited vehicles (one-at-a-time wizard) */
  vehicles?: MotoristVehicle[];
  /** Profile avatar (data URL or path) */
  avatarUrl?: string;
  /** Motorist saved places */
  savedLocations?: {
    id: string;
    label: string;
    address: string;
    lat: number;
    lng: number;
  }[];
  emergencyContact?: { name: string; phone: string };
  /** Stats (local / demo; server may overwrite) */
  jobsRequested?: number;
  jobsCompleted?: number;
  averageRating?: number;
  averageRatingGiven?: number;
  avgResponseMinutes?: number;
  completionRate?: number;
  /** Repair Pro */
  businessName?: string;
  services?: ProService[];
  /**
   * Labour/service fee per skill (major units: ₦ or $).
   * Spare parts never included. Legacy string values still parse.
   */
  servicePrices?: Partial<Record<ProService, number | string>>;
  /** Pricing currency from geo (NGN, GBP, ZAR, USD, …) */
  pricingCurrency?: import("@/lib/pricing").AppCurrency;
  serviceRadiusKm?: number;
  yearsExperience?: string;
  bio?: string;
  /** Payout (pro) / refund (customer) bank — required after Tier 1 phone */
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankName?: string;
  /** Flutterwave account_bank code (e.g. 058 for GTBank) */
  bankCode?: string;
  cacDocumentName?: string;
  cacDocumentDataUrl?: string;
  /** Repair Pro guarantor (compulsory) */
  guarantor?: Guarantor;
  /** National / primary ID number (country-specific) */
  idNumber?: string;
  /** Bank / secondary ID (e.g. BVN in Nigeria) */
  bvn?: string;
  /**
   * Phone-country ISO that locks which IDs are allowed
   * (same as the country on the user’s phone number).
   */
  identityCountryIso?: string;
  /** Selected primary document kind for this country */
  govIdKind?: string;
  govIdFrontUrl?: string;
  govIdBackUrl?: string;
  /**
   * Post-signup identity verification (country ID rules).
   * Users can explore first; verification unlocks unlimited
   * book / accept after free trial requests.
   */
  ninVerified?: boolean;
  bvnVerified?: boolean;
  /** True when admin/care approved Tier 2 government ID */
  govIdVerified?: boolean;
  identityVerifiedAt?: string;
  /**
   * Customer ID review queue (manual admin/care).
   * submitted = uploaded, waiting · approved = Tier 2 · rejected = re-upload
   */
  identityReviewStatus?: "none" | "submitted" | "approved" | "rejected";
  identitySubmittedAt?: string;
  phoneVerified?: boolean;
  emailVerified?: boolean;
  faceLivenessVerified?: boolean;
  faceLivenessAt?: string;
  /** In-person validation → permanent Verification Mark (Tier 3) */
  inPersonVerified?: boolean;
  inPersonVerifiedAt?: string;
  /**
   * Certification docs from signup.
   * under_review on pro profile until admin approves (then +1 star once).
   */
  docsStatus?: "none" | "under_review" | "approved" | "rejected";
  docsRatingBoostApplied?: boolean;
  certificationFileName?: string;
  certificationFileDataUrl?: string;
  /**
   * Count of gated actions: motorist books + pro accepts.
   * Used for progressive verification warnings / hard block.
   */
  serviceActionCount?: number;
  /**
   * ISO timestamp of the customer's first gated request.
   * Starts the Tier 1 free window (30 days) until Tier 2 approval.
   */
  firstServiceAt?: string;
  /**
   * Service focus (vehicles this pro serves).
   * Shown on their public profile when motorists view them.
   */
  servedVehicleType?: string;
  servedBrand?: string;
  /** @deprecated prefer servedBrand */
  servedMake?: string;
  servedModel?: string;
  servedCountry?: string;
  servedLocation?: string;
  /**
   * When vehicles-you-serve was last saved.
   * Next change allowed only after 28 days.
   */
  vehiclesServedUpdatedAt?: string;
  /**
   * Skill-specific signup answers (keyed by question id).
   * Public fields are shown when motorists view the pro.
   * Values may be string, string[], or certification file metadata.
   */
  skillAnswers?: Record<
    string,
    | string
    | string[]
    | { name: string; dataUrl?: string; mime?: string; hasFile?: boolean }
  >;
  /** Stable identity id for the local account registry */
  identityId?: string;
  /** Name is locked after signup — cannot be changed */
  name_locked?: boolean;
  registeredAt: string;
}

export type AvailabilityStatus =
  | "available"
  | "busy"
  | "nearby"
  | "offline";

export type RequestStatus =
  | "pending"
  | "accepted"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Technician {
  id: string;
  name: string;
  shortName: string;
  serviceType: ProService;
  roleLabel: string;
  photo: string;
  rating: number;
  reviewCount: number;
  distanceKm: number;
  etaMinutes: number;
  status: AvailabilityStatus;
  verified: boolean;
  fastResponse: boolean;
  specialties: string[];
  description: string;
  phone: string;
  serviceRadiusKm: number;
  location: Coordinates;
  /** True when lat/lng come from the pro’s live pin (not a fallback) */
  hasLiveLocation?: boolean;
  markerLabel?: string;
  responseSpeedScore: number;
  currentLoad: number;
  /** Service focus — vehicles this pro serves (motorist-visible) */
  servedVehicleType?: string;
  servedBrand?: string;
  servedMake?: string;
  servedModel?: string;
  servedCountry?: string;
  servedLocation?: string;
  businessName?: string;
  yearsExperience?: string;
  bio?: string;
  /**
   * Certification / trade docs review.
   * under_review → public discovery limited to 2 km until approved.
   */
  docsStatus?: "none" | "under_review" | "approved" | "rejected";
  docsRatingBoostApplied?: boolean;
  /** Jobs completed (for achievement badges) */
  jobsCompleted?: number;
  /** New Artisan badge — lower ranking (Tier 1–2) */
  isNewArtisan?: boolean;
  /** Admin visibility ladder 1–4 */
  visibilityTier?: 1 | 2 | 3 | 4;
  /** 0–100 marketplace weight */
  visibilityPercent?: number;
  servicePrices?: Partial<Record<ProService, number | string>>;
  pricingCurrency?: import("@/lib/pricing").AppCurrency;
  skillAnswers?: Record<
    string,
    | string
    | string[]
    | { name: string; dataUrl?: string; mime?: string; hasFile?: boolean }
  >;
}

export interface ServiceRequest {
  id: string;
  technicianId: string;
  technicianName: string;
  /** Supabase motorist profile id when job is cloud-backed */
  motoristId?: string;
  serviceType: ProService;
  problem: string;
  status: RequestStatus;
  createdAt: string;
  etaMinutes: number;
  distanceKm: number;
  locationLabel: string;
  /** Motorist is booking help for another person at this meet point */
  bookingForSomeoneElse?: boolean;
  meetCoordinates?: Coordinates;
  /** Labour pricing snapshot (escrow) */
  pricingCurrency?: import("@/lib/pricing").AppCurrency;
  labourBaseMajor?: number;
  labourAgreedMajor?: number;
  discountPercent?: number;
  negotiationStatus?:
    | "none"
    | "pending_pro"
    | "accepted"
    | "declined"
    | "paid";
  paymentId?: string;
  paymentReference?: string;
  escrowStatus?: string;
}

export interface Booking {
  id: string;
  technicianName: string;
  serviceType: ProService;
  date: string;
  time: string;
  status: "upcoming" | "completed" | "cancelled";
  locationLabel: string;
}

export type ChatSender = "motorist" | "professional" | "system";

export interface ChatMessage {
  id: string;
  sender: ChatSender;
  text: string;
  at: string;
  /** Optional voice note (data URL or remote URL) */
  voiceUrl?: string | null;
  voiceDurationSec?: number | null;
  voiceMime?: string | null;
}

/**
 * One job/booking conversation between a Customer and a Repair Pro.
 * Threads never mix roles or jobs.
 */
export interface MessageThread {
  id: string;
  /** Linked service request when chat started from a job */
  requestId?: string;
  technicianId: string;
  technicianName: string;
  motoristName: string;
  serviceType: ProService;
  lastMessage: string;
  time: string;
  unread: number;
  photo: string;
  messages: ChatMessage[];
}

export interface AppFilters {
  nearest: boolean;
  rating45: boolean;
  availableNow: boolean;
  verified: boolean;
  fastResponse: boolean;
}

export interface UserLocation {
  /** Full human address from Google/Nominatim (street + area + city) */
  label: string;
  /** Area / city line for Uber-style subtitle under the street */
  city: string;
  coordinates: Coordinates;
}
