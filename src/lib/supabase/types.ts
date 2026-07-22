export type UserRole = "admin" | "motorist" | "repair_pro";
export type ProServiceDb =
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
export type ProStatus = "pending" | "approved" | "suspended" | "rejected";
export type JobStatus =
  | "draft"
  | "requested"
  | "matched"
  | "accepted"
  | "en_route"
  | "in_progress"
  | "completed"
  | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export interface ProfileRow {
  id: string;
  role: UserRole;
  /** Panel RBAC: super_admin | customer_care | support */
  admin_role?: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  city: string | null;
  area: string | null;
  /** male | female | prefer_not_to_say */
  gender?: string | null;
  /** YYYY-MM-DD */
  date_of_birth?: string | null;
  /** App UI language (en, pcm, yo, …) */
  preferred_locale?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MotoristProfileRow {
  user_id: string;
  default_lat: number | null;
  default_lng: number | null;
  address_text: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: string | null;
  plate_number: string | null;
  nin_last4: string | null;
  bvn_last4: string | null;
  nin_verified: boolean;
  bvn_verified: boolean;
  identity_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DocsStatus = "none" | "under_review" | "approved" | "rejected";

export interface RepairProRow {
  user_id: string;
  business_name: string | null;
  primary_service: ProServiceDb;
  services: ProServiceDb[];
  status: ProStatus;
  is_online: boolean;
  rating_avg: number;
  rating_count: number;
  /** Live GPS pin (required for marketplace discovery) */
  lat: number | null;
  lng: number | null;
  location_updated_at?: string | null;
  /** Admin visibility ladder 1–4 */
  visibility_tier?: number | null;
  tier2_approved_at?: string | null;
  tier3_approved_at?: string | null;
  tier4_approved_at?: string | null;
  go_live_window_ends_at?: string | null;
  is_new_artisan?: boolean | null;
  tier4_one_star_seeded?: boolean | null;
  service_radius_km: number;
  years_experience: string | null;
  bio: string | null;
  verified: boolean;
  nin_last4: string | null;
  bvn_last4: string | null;
  nin_verified: boolean;
  bvn_verified: boolean;
  skills: unknown;
  vehicle_focus: unknown;
  docs_status?: DocsStatus;
  docs_rating_boost_applied?: boolean;
  certification_file_name?: string | null;
  certification_file_url?: string | null;
  docs_submitted_at?: string | null;
  docs_reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceRequestRow {
  id: string;
  motorist_id: string;
  repair_pro_id: string | null;
  service_type: ProServiceDb;
  status: JobStatus;
  description: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_address: string | null;
  radius_km: number;
  scheduled_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  request_id: string;
  motorist_id: string;
  repair_pro_id: string | null;
  amount_kobo: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  provider_ref: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminActionRow {
  id: string;
  admin_id: string;
  action: string;
  target_user_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}
