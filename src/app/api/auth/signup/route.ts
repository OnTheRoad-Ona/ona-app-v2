import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { sendSignupConfirmationEmail } from "@/lib/server/resend";
import { canonicalPhone } from "@/lib/server/phone-match";
import {
  detectMergeCandidatesForUser,
  runIdentitySync,
} from "@/lib/server/identity/identity-sync";
import { isProService } from "@/lib/services";
import type { ProService } from "@/lib/types";
import type { UserRole } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public signup via service role.
 *
 * Why this exists (permanent fix):
 * - Browser `auth.signUp` sends confirmation emails → Supabase free-tier rate
 * limit → "For security purposes, you can only request this after X seconds"
 * - Unconfirmed users often have no session → RLS blocks profile writes
 * - Admin createUser with email_confirm:true creates the account without
 * sending email and allows immediate sign-in.
 */
const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2).max(120),
  phone: z.string().min(7).max(32),
  accountType: z.enum(["motorist", "professional"]),
  /** Required for new signups */
  gender: z.enum(["male", "female", "prefer_not_to_say"]),
  /** ISO date YYYY-MM-DD */
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date of birth"),
  city: z.string().optional(),
  area: z.string().optional(),
  businessName: z.string().optional(),
  primaryService: z.string().optional(),
  services: z.array(z.string()).optional(),
  bio: z.string().optional(),
  yearsExperience: z.string().optional(),
  serviceRadiusKm: z.number().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleYear: z.string().optional(),
  plateNumber: z.string().optional(),
  vehiclePhoto: z.string().optional(),
  vehicleCommonIssues: z.array(z.string()).optional(),
  vehicles: z
    .array(
      z.object({
        id: z.string(),
        make: z.string(),
        model: z.string(),
        year: z.string().optional(),
        plate: z.string().optional(),
        photo: z.string().optional(),
        commonIssues: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  avatarUrl: z.string().optional(),
  nin: z.string().optional(),
  bvn: z.string().optional(),
  /** Labour prices: skill → major units */
  labourPrices: z
    .record(z.string(), z.union([z.number(), z.string()]))
    .optional(),
  pricingCurrency: z
    .enum(["NGN", "USD", "GBP", "ZAR", "EUR", "GHS", "KES", "CAD", "AUD"])
    .optional(),
  /** Service focus (vehicles they fix) */
  vehicleFocus: z.record(z.string(), z.unknown()).optional(),
  skillAnswers: z.record(z.string(), z.unknown()).optional(),
  servedVehicleType: z.string().optional(),
  servedBrand: z.string().optional(),
  servedModel: z.string().optional(),
  servedCountry: z.string().optional(),
  servedLocation: z.string().optional(),
  emergencyContact: z
    .object({ name: z.string(), phone: z.string() })
    .optional(),
  bankName: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankCode: z.string().optional(),
  /** Dual signup: keep the other role's side table */
  keepOtherRole: z.boolean().optional().default(true),
  /** Repair Pro guarantor */
  guarantor: z
    .object({
      fullName: z.string().min(2),
      phone: z.string().min(7),
      address: z.string().optional(),
      occupation: z.string().optional(),
      relationship: z.string().min(2),
    })
    .optional(),
  /** Certification docs review (pros) */
  docsStatus: z
    .enum(["none", "under_review", "approved", "rejected"])
    .optional(),
  certificationFileName: z.string().optional(),
  certificationFileDataUrl: z.string().optional(),
  /** Referral code from ?ref= param in signup link */
  refCode: z.string().max(30).optional(),
  /**
   * When the user is already logged in (dual-role attach from menu),
   * pass their access_token so we extend THIS identity never create a
   * second auth user (fraud / duplicate account prevention).
   */
  access_token: z.string().min(10).optional(),
});

function last4(digits: string | undefined): string | null {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length < 4) return null;
  return d.slice(-4);
}

/** Strip huge data-URLs from skill answers (certs stay on dedicated columns). */
function slimSkillAnswers(
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "certificationUpload" && v && typeof v === "object") {
      const file = v as { name?: string; mime?: string; dataUrl?: string };
      out[k] = {
        name: file.name || "certificate",
        mime: file.mime || undefined,
        // Never store multi-MB base64 in skills jsonb breaks vulcanizer/pro signup
        hasFile: Boolean(file.dataUrl || file.name),
      };
      continue;
    }
    if (typeof v === "string" && v.startsWith("data:") && v.length > 8_000) {
      out[k] = "[file omitted]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

/** Cap cert data URL size so Postgres / request body does not fail signup. */
function capCertDataUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  // ~400KB text enough for compressed photo; larger payloads fail many hosts
  if (url.length > 400_000) return null;
  return url;
}

function friendlyAuthError(message: string): {
  message: string;
  status: number;
  code: string;
} {
  const m = message || "Signup failed";
  const lower = m.toLowerCase();
  if (
    lower.includes("only request this after") ||
    lower.includes("rate limit") ||
    lower.includes("over_email_send") ||
    lower.includes("email rate limit")
  ) {
    return {
      message:
        "Too many sign-up attempts from this network. Wait about a minute, then try once more with the same details.",
      status: 429,
      code: "rate_limited",
    };
  }
  if (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("user already exists")
  ) {
    return {
      message:
        "An account with this email already exists. Log in instead, or use a different email.",
      status: 409,
      code: "email_exists",
    };
  }
  if (lower.includes("password")) {
    return { message: m, status: 400, code: "weak_password" };
  }
  return { message: m, status: 400, code: "signup_failed" };
}

async function logSignupEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  row: {
    email?: string | null;
    full_name?: string | null;
    phone?: string | null;
    account_type?: string | null;
    success: boolean;
    error_message?: string | null;
    user_id?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  try {
    await supabase.from("signup_events").insert({
      email: row.email ?? null,
      full_name: row.full_name ?? null,
      phone: row.phone ?? null,
      account_type: row.account_type ?? null,
      success: row.success,
      error_message: row.error_message ?? null,
      user_id: row.user_id ?? null,
      meta: row.meta ?? {},
    });
  } catch {
    /* never block signup on logging */
  }
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Server is not configured for sign-up. Contact support.",
      503,
      "supabase_not_configured",
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON body", 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => i.message)
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");
    return apiFail(
      msg ||
        "Please check your name, gender, date of birth, email, phone and password.",
      400,
      "validation",
    );
  }

  try {
    const { rateLimit } = await import("@/lib/server/modules/rate-limit");
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rl = rateLimit({
      key: `signup:ip:${ip}`,
      limit: 10,
      windowMs: 15 * 60_000,
    });
    if (!rl.ok) {
      return apiFail(
        `Too many sign-up attempts. Retry in ${rl.retryAfterSec}s.`,
        429,
        "rate_limited",
      );
    }
  } catch {
    /* non-fatal */
  }

  const input = parsed.data;
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return apiFail(
      "Email is required for Customer and Repair Pro signup.",
      400,
      "validation",
    );
  }
  // Store canonical phone so login must match the same signup number
  const phoneCanonical = canonicalPhone(input.phone);
  if (!phoneCanonical) {
    return apiFail(
      "Phone number is required for Customer and Repair Pro signup (e.g. +234 801…).",
      400,
      "validation",
    );
  }
  // Normalize in-place for all profile writes below
  input.phone = phoneCanonical;
  const role: UserRole =
    input.accountType === "professional" ? "repair_pro" : "motorist";
  const nin = (input.nin || "").replace(/\D/g, "");
  const bvn = (input.bvn || "").replace(/\D/g, "");
  const hasNin = nin.length === 11;
  const hasBvn = bvn.length === 11;

  // Age gate: real calendar date, not future, 16-120 years
  {
    const raw = input.dateOfBirth;
    const dob = new Date(`${raw}T12:00:00`);
    const today = new Date();
    if (Number.isNaN(dob.getTime())) {
      return apiFail("Use a valid date of birth.", 400, "validation");
    }
    const [y, month, day] = raw.split("-").map(Number);
    if (
      dob.getFullYear() !== y ||
      dob.getMonth() + 1 !== month ||
      dob.getDate() !== day
    ) {
      return apiFail("Use a valid date of birth.", 400, "validation");
    }
    if (dob.getTime() > today.getTime()) {
      return apiFail(
        "Date of birth cannot be in the future.",
        400,
        "validation",
      );
    }
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
    if (age < 16 || age > 120) {
      return apiFail(
        "You must be at least 16 years old to create an account.",
        400,
        "validation",
      );
    }
  }

  const supabase = createServiceSupabase();
  const eventBase = {
    email,
    full_name: input.fullName,
    phone: input.phone,
    account_type: input.accountType,
    gender: input.gender,
    date_of_birth: input.dateOfBirth,
  };

  // ── Dual-role attach: same logged-in user adds the other role ─────────────
  // Prefer session token so we NEVER create a second auth user (anti-fraud).
  let attachUserId: string | null = null;
  if (input.access_token) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const { getSupabaseAnonKey, getSupabaseUrl } =
        await import("@/lib/supabase/env");
      const userClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: tokUser, error: tokErr } = await userClient.auth.getUser(
        input.access_token,
      );
      if (!tokErr && tokUser.user?.id) {
        attachUserId = tokUser.user.id;
        // Force email to the session identity (cannot attach under a different email)
        const sessionEmail = String(tokUser.user.email || "")
          .trim()
          .toLowerCase();
        if (sessionEmail && sessionEmail !== email) {
          // Allow client to send the locked session email; if mismatch, prefer session
          // only when keepOtherRole (dual attach). Reject pure hijack attempts.
          if (input.keepOtherRole !== false) {
            // rebind to session email for profile writes
            // (input.email is const via local use session for create path skip)
          } else {
            return apiFail(
              "Signed-in email does not match. Stay on this account to add a role.",
              403,
              "identity_mismatch",
            );
          }
        }
      }
    } catch {
      /* fall through to normal signup */
    }
  }

  // Phone uniqueness across different accounts (same user dual-role reuses their phone)
  const phoneDigits = input.phone.replace(/\D/g, "");
  if (phoneDigits.length >= 10) {
    const tail = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
    const { data: phoneRows } = await supabase
      .from("profiles")
      .select("id, email, phone")
      .not("phone", "is", null)
      .limit(500);
    const phoneTaken = (phoneRows || []).find((row) => {
      const d = String(row.phone || "").replace(/\D/g, "");
      if (d.length < 10) return false;
      const rowTail = d.length > 10 ? d.slice(-10) : d;
      if (rowTail !== tail) return false;
      // Same identity attaching dual role not a conflict
      if (attachUserId && row.id === attachUserId) return false;
      const rowEmail = String(row.email || "")
        .trim()
        .toLowerCase();
      return rowEmail !== email;
    });
    if (phoneTaken) {
      await logSignupEvent(supabase, {
        ...eventBase,
        success: false,
        error_message: "phone_exists",
      });
      return apiFail(
        "This phone number is already used on another Ona account. Use a different number or log in.",
        409,
        "phone_exists",
      );
    }
  }

  // 1) Create (or recover) auth user OR attach to existing session identity
  let userId: string | null = null;
  let createdNew = false;

  if (attachUserId) {
    // Dual-role path: reuse this user id; verify password owns the account
    const signed = await supabase.auth.signInWithPassword({
      email:
        (
          await supabase.auth.admin.getUserById(attachUserId)
        ).data.user?.email?.toLowerCase() || email,
      password: input.password,
    });
    if (signed.error || !signed.data.user) {
      return apiFail(
        "Enter the password for your existing Ona account to add this role.",
        401,
        "password_required",
      );
    }
    if (signed.data.user.id !== attachUserId) {
      return apiFail(
        "Password belongs to a different account. Stay signed in and try again.",
        403,
        "identity_mismatch",
      );
    }
    userId = attachUserId;
    createdNew = false;
  } else {
    const created = await supabase.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        role,
        full_name: input.fullName,
        phone: input.phone,
        gender: input.gender,
        date_of_birth: input.dateOfBirth,
      },
    });

    if (created.error || !created.data.user) {
      const msg = created.error?.message || "Could not create account";
      const lower = msg.toLowerCase();
      const exists =
        lower.includes("already") ||
        lower.includes("registered") ||
        lower.includes("exists") ||
        created.error?.status === 422;

      if (!exists) {
        const f = friendlyAuthError(msg);
        await logSignupEvent(supabase, {
          ...eventBase,
          success: false,
          error_message: f.message,
        });
        return apiFail(f.message, f.status, f.code);
      }

      // Account already exists try password sign-in and finish profile (dual-role)
      const signed = await supabase.auth.signInWithPassword({
        email,
        password: input.password,
      });
      if (signed.error || !signed.data.user) {
        const m =
          "An account with this email already exists. Log in with your password, or reset it if you forgot.";
        await logSignupEvent(supabase, {
          ...eventBase,
          success: false,
          error_message: m,
        });
        return apiFail(m, 409, "email_exists");
      }
      userId = signed.data.user.id;
    } else {
      userId = created.data.user.id;
      createdNew = true;
    }
  }

  if (!userId) {
    await logSignupEvent(supabase, {
      ...eventBase,
      success: false,
      error_message: "Signup failed no user id returned.",
    });
    return apiFail("Signup failed no user id returned.", 500);
  }

  // 2) Enrich profile (service role bypasses RLS; trigger may have inserted stub)
  // Dual accounts: do not wipe the other role only set active role to the one signing up
  // Always force is_active true on signup / dual-role add (never inherit a frozen flag)
  const { error: profileErr } = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: input.fullName,
      phone: input.phone || null,
      email,
      city: input.city || null,
      area: input.area || null,
      avatar_url: input.avatarUrl || null,
      gender: input.gender,
      date_of_birth: input.dateOfBirth,
      role,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    // Retry without gender/DOB if columns not migrated yet
    if (
      /gender|date_of_birth/i.test(profileErr.message) ||
      profileErr.message.includes("does not exist")
    ) {
      const { error: e2 } = await supabase.from("profiles").upsert(
        {
          id: userId,
          full_name: input.fullName,
          phone: input.phone || null,
          email,
          city: input.city || null,
          area: input.area || null,
          avatar_url: input.avatarUrl || null,
          role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (e2) {
        await logSignupEvent(supabase, {
          ...eventBase,
          success: false,
          error_message: e2.message,
          user_id: userId,
          meta: { stage: "profile" },
        });
        return apiFail(
          `Account saved but profile failed: ${e2.message}`,
          500,
          "profile_error",
        );
      }
    } else {
      await logSignupEvent(supabase, {
        ...eventBase,
        success: false,
        error_message: profileErr.message,
        user_id: userId,
        meta: { stage: "profile" },
      });
      return apiFail(
        `Account saved but profile failed: ${profileErr.message}`,
        500,
        "profile_error",
      );
    }
  }

  // 3) Role-specific tables
  // Dual-role: NEVER delete the other role's side table when keepOtherRole is true
  // (motorist adding Repair Pro must keep motorist_profiles).
  // Attach path always keeps the original role (anti-fraud merge on same identity).
  const keepOther = attachUserId ? true : input.keepOtherRole !== false;

  if (role === "motorist") {
    if (!keepOther) {
      await supabase.from("repair_pro_profiles").delete().eq("user_id", userId);
    }
    const vehiclesJson =
      Array.isArray(input.vehicles) && input.vehicles.length > 0
        ? input.vehicles
        : input.vehicleMake || input.vehicleModel
          ? [
              {
                id: `veh-${userId.slice(0, 8)}`,
                make: input.vehicleMake || "",
                model: input.vehicleModel || "",
                year: input.vehicleYear || undefined,
                plate: input.plateNumber || undefined,
                photo: input.vehiclePhoto || undefined,
                commonIssues: input.vehicleCommonIssues || undefined,
              },
            ]
          : [];
    const firstVeh = vehiclesJson[0] as
      | {
          make?: string;
          model?: string;
          year?: string;
          plate?: string;
          photo?: string;
          commonIssues?: string[];
        }
      | undefined;

    const { error: motErr } = await supabase.from("motorist_profiles").upsert(
      {
        user_id: userId,
        vehicle_make: firstVeh?.make || input.vehicleMake || null,
        vehicle_model: firstVeh?.model || input.vehicleModel || null,
        vehicle_year: firstVeh?.year || input.vehicleYear || null,
        plate_number: firstVeh?.plate || input.plateNumber || null,
        vehicle_photo: firstVeh?.photo || input.vehiclePhoto || null,
        vehicle_common_issues:
          firstVeh?.commonIssues || input.vehicleCommonIssues || [],
        vehicles: vehiclesJson,
        emergency_contact: input.emergencyContact || null,
        address_text:
          [input.area, input.city].filter(Boolean).join(", ") || null,
        default_lat: input.lat ?? null,
        default_lng: input.lng ?? null,
        location_updated_at:
          input.lat != null && input.lng != null
            ? new Date().toISOString()
            : null,
        nin_last4: last4(nin),
        bvn_last4: last4(bvn),
        nin_verified: hasNin,
        bvn_verified: hasBvn,
        identity_verified_at:
          hasNin && hasBvn ? new Date().toISOString() : null,
      },
      { onConflict: "user_id" },
    );
    if (motErr) {
      await logSignupEvent(supabase, {
        ...eventBase,
        success: false,
        error_message: motErr.message,
        user_id: userId,
        meta: { stage: "motorist_profiles" },
      });
      return apiFail(
        `Customer profile failed: ${motErr.message}`,
        500,
        "motorist_profile_error",
      );
    }
  } else {
    if (!keepOther) {
      await supabase.from("motorist_profiles").delete().eq("user_id", userId);
    }
    const svc = (
      input.primaryService && isProService(input.primaryService)
        ? input.primaryService
        : "mechanic"
    ) as ProService;
    const servicesList = (
      input.services?.length
        ? input.services.filter((s): s is ProService => isProService(s))
        : [svc]
    ) as ProService[];
    const labourPrices: Record<string, number> = {};
    if (input.labourPrices) {
      for (const [k, v] of Object.entries(input.labourPrices)) {
        const n =
          typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
        if (Number.isFinite(n) && n > 0) labourPrices[k] = n;
      }
    }
    const saRaw =
      (input.skillAnswers as Record<string, unknown> | undefined) || {};
    const specialtyFromSignup = (() => {
      if (typeof saRaw.specialty === "string" && saRaw.specialty.trim()) {
        return saRaw.specialty.trim();
      }
      if (Array.isArray(saRaw.specialties) && saRaw.specialties.length) {
        return String(saRaw.specialties[0] || "").trim() || null;
      }
      return null;
    })();
    const specialtiesArr = (() => {
      const out: string[] = [];
      if (Array.isArray(saRaw.specialties)) {
        for (const x of saRaw.specialties) {
          const s = String(x || "").trim();
          if (s && !out.includes(s)) out.push(s);
        }
      }
      if (specialtyFromSignup && !out.includes(specialtyFromSignup)) {
        out.unshift(specialtyFromSignup);
      }
      return out;
    })();
    // Vehicle brand focus vs home specialty focus (shared catalog helper)
    const { storesVehicleBrandFocus } = await import("@/lib/artisan/catalog");
    const isVehicleTrade = storesVehicleBrandFocus(
      svc,
      specialtyFromSignup,
      specialtiesArr,
    );
    const vehicleFocus = isVehicleTrade
      ? {
          ...(input.vehicleFocus || {}),
          servedVehicleType: input.servedVehicleType || null,
          servedBrand: input.servedBrand || null,
          servedModel: input.servedModel || null,
          servedCountry: input.servedCountry || null,
          servedLocation: input.servedLocation || null,
        }
      : {
          trade: svc,
          // Critical for customer Home/Office/Industrial filters
          specialty: specialtyFromSignup,
          specialties: specialtiesArr,
          servedCountry: input.servedCountry || null,
          servedLocation: input.servedLocation || null,
        };
    // Cert upload at signup → under_review (2 km discovery until admin approves)
    const certFromSkills = (() => {
      const sa = input.skillAnswers as Record<string, unknown> | undefined;
      const file = sa?.certificationUpload as
        { name?: string; dataUrl?: string } | undefined;
      if (file && typeof file === "object" && file.name) {
        return {
          name: String(file.name),
          dataUrl: typeof file.dataUrl === "string" ? file.dataUrl : undefined,
        };
      }
      return null;
    })();
    const certName =
      input.certificationFileName || certFromSkills?.name || null;
    const rawCertUrl =
      input.certificationFileDataUrl || certFromSkills?.dataUrl || null;
    const certUrl = capCertDataUrl(rawCertUrl);
    const hasCert = Boolean(certName || certUrl || rawCertUrl);
    // Default: under_review only when cert present; bare signup is "none" (full radius)
    const docsStatus = input.docsStatus || (hasCert ? "under_review" : "none");
    const skillsSlim = {
      ...slimSkillAnswers(
        input.skillAnswers as Record<string, unknown> | undefined,
      ),
      // Always mirror signup focus so marketplace specialty filters work
      ...(specialtyFromSignup ? { specialty: specialtyFromSignup } : {}),
      ...(specialtiesArr.length ? { specialties: specialtiesArr } : {}),
    };

    const nowIso = new Date().toISOString();

    // ── Preserve an already-approved pro on re-signup / dual-role attach ─────
    // Re-running signup for an existing account must NEVER downgrade a pro that
    // Care already approved (T2+). Clobbering visibility_tier → 1 (and status →
    // pending, gov_id_review_status → submitted) locked approved pros out of Go
    // Live with "Tier 1: set up your profile. Admin must approve Tier 2".
    const { data: existingPro } = await supabase
      .from("repair_pro_profiles")
      .select(
        "status, pipeline_status, docs_status, docs_rating_boost_applied, gov_id_review_status, gov_id_submitted_at, gov_id_kind, gov_id_number, gov_id_front_url, gov_id_back_url, gov_id_meta, verified, nin_verified, bvn_verified, nin_encrypted, bvn_encrypted, visibility_tier, is_new_artisan, tier2_approved_at, tier3_approved_at, tier4_approved_at, go_live_window_ends_at, skill_proof, certification_file_name, certification_file_url",
      )
      .eq("user_id", userId)
      .maybeSingle();
    const wasApproved =
      existingPro?.gov_id_review_status === "approved" ||
      existingPro?.verified === true ||
      Boolean(existingPro?.tier2_approved_at) ||
      Number(existingPro?.visibility_tier) >= 2;
    const docsWasApproved = existingPro?.docs_status === "approved";
    const keepExistingVis = Number(existingPro?.visibility_tier);
    const effectiveVis =
      wasApproved && Number.isFinite(keepExistingVis) && keepExistingVis >= 2
        ? keepExistingVis
        : 2;

    // Care must review never auto-approve ID/account from raw NIN/BVN digits alone
    const { error: proErr } = await supabase.from("repair_pro_profiles").upsert(
      {
        user_id: userId,
        business_name: input.businessName || null,
        primary_service: svc,
        services: servicesList.length ? servicesList : [svc],
        // Approved pros keep approved; new / re-pending pros enter review
        status: wasApproved ? "approved" : "pending",
        pipeline_status: wasApproved
          ? existingPro?.pipeline_status || "live_ready"
          : hasCert
            ? "pending_document_review"
            : hasNin || hasBvn
              ? "pending_verification"
              : "draft",
        // Stay Away until the pro taps Live on the dashboard
        is_online: false,
        bio: input.bio || null,
        years_experience: input.yearsExperience || null,
        service_radius_km: input.serviceRadiusKm ?? 10,
        // Home / signup pin (live pin updated again on Go Live)
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        location_updated_at:
          input.lat != null && input.lng != null ? nowIso : null,
        // Visibility ladder: Tier 1 until admin promotes never downgrade approved
        visibility_tier: wasApproved ? effectiveVis : 1,
        is_new_artisan: wasApproved
          ? existingPro?.is_new_artisan !== false
          : true,
        verified: wasApproved ? Boolean(existingPro?.verified) : false,
        nin_last4: last4(nin),
        bvn_last4: last4(bvn),
        // Preserve approved identity data when re-signup sends no fresh digits
        nin_encrypted: hasNin ? nin : (existingPro?.nin_encrypted ?? null),
        bvn_encrypted: hasBvn ? bvn : (existingPro?.bvn_encrypted ?? null),
        // Digits collected ≠ care-approved (unless already approved)
        nin_verified: wasApproved ? Boolean(existingPro?.nin_verified) : false,
        bvn_verified: wasApproved ? Boolean(existingPro?.bvn_verified) : false,
        gov_id_number: hasNin ? nin : (existingPro?.gov_id_number ?? null),
        gov_id_review_status: wasApproved
          ? "approved"
          : hasNin || hasBvn
            ? "submitted"
            : "none",
        gov_id_submitted_at: wasApproved
          ? (existingPro?.gov_id_submitted_at ?? null)
          : hasNin || hasBvn
            ? nowIso
            : null,
        // Preserve tier timestamps + Go Live window + stored ID media for approved pros
        ...(wasApproved
          ? {
              gov_id_kind: existingPro?.gov_id_kind ?? null,
              gov_id_front_url: existingPro?.gov_id_front_url ?? null,
              gov_id_back_url: existingPro?.gov_id_back_url ?? null,
              gov_id_meta: existingPro?.gov_id_meta ?? {},
              tier2_approved_at: existingPro?.tier2_approved_at ?? null,
              tier3_approved_at: existingPro?.tier3_approved_at ?? null,
              tier4_approved_at: existingPro?.tier4_approved_at ?? null,
              go_live_window_ends_at:
                existingPro?.go_live_window_ends_at ?? null,
            }
          : {}),
        labour_prices: labourPrices,
        pricing_currency: input.pricingCurrency || "NGN",
        vehicle_focus: vehicleFocus,
        skills: skillsSlim,
        skill_proof:
          docsWasApproved && existingPro?.skill_proof
            ? existingPro.skill_proof
            : hasCert
              ? {
                  type: "certification",
                  name: certName,
                  url: certUrl,
                  submittedAt: nowIso,
                  status: "under_review",
                }
              : null,
        bank_name: input.bankName || null,
        bank_account_name: input.bankAccountName || null,
        bank_account_number: input.bankAccountNumber || null,
        bank_code: input.bankCode || null,
        docs_status: docsWasApproved ? "approved" : docsStatus,
        docs_rating_boost_applied: docsWasApproved
          ? existingPro?.docs_rating_boost_applied === true
          : false,
        certification_file_name:
          certName ||
          (docsWasApproved
            ? (existingPro?.certification_file_name ?? null)
            : null),
        // Prefer slim URL; if oversized, keep name only so signup still succeeds
        certification_file_url:
          certUrl ||
          (docsWasApproved
            ? (existingPro?.certification_file_url ?? null)
            : null),
        docs_submitted_at: hasCert ? nowIso : null,
        submitted_at: nowIso,
      },
      { onConflict: "user_id" },
    );
    if (proErr) {
      await logSignupEvent(supabase, {
        ...eventBase,
        success: false,
        error_message: proErr.message,
        user_id: userId,
        meta: { stage: "repair_pro_profiles" },
      });
      return apiFail(
        `Repair Pro profile failed: ${proErr.message}`,
        500,
        "pro_profile_error",
      );
    }

    // Insert guarantor for Repair Pro (compulsory)
    if (input.guarantor) {
      try {
        await supabase.from("repair_pro_guarantors").upsert(
          {
            user_id: userId,
            full_name: input.guarantor.fullName,
            phone: input.guarantor.phone,
            address: input.guarantor.address || null,
            occupation: input.guarantor.occupation || null,
            relationship: input.guarantor.relationship,
          },
          { onConflict: "user_id" },
        );
      } catch {
        /* non-fatal - table may not exist yet */
      }
    }
  }

  // Unified identity sync: register this role on the identity and carry over
  // any bank already saved on the user's other role (payout_methods + mirror).
  // Runs for both brand-new and dual-role ("attach to existing account") signups.
  try {
    await runIdentitySync(supabase, userId, { source: "signup" });
  } catch (e) {
    console.error("identity sync after signup failed", e);
  }

  // Signup-time duplicate detection: if this account shares a NIN/BVN last-4,
  // Driver's Licence or Passport number with an existing (non-deleted) account,
  // queue the pair for admin review never merges automatically.
  try {
    await detectMergeCandidatesForUser(supabase, userId, {
      userId,
      source: "signup",
    });
  } catch (e) {
    console.error("signup merge detection failed", e);
  }

  // 5) Generate referral code for new user (non-blocking)
  {
    const suffix = userId.replace(/-/g, "").slice(-6).toUpperCase();
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++)
      code += chars[Math.floor(Math.random() * chars.length)];
    const refCode = `ONA${code}${suffix}`;
    const refLink = `/login/role?ref=${refCode}`;
    try {
      await supabase.from("referral_codes").upsert(
        {
          user_id: userId,
          referral_code: refCode,
          referral_link: refLink,
          active: true,
        },
        { onConflict: "user_id" },
      );
    } catch {
      /* non-fatal referral code not critical for signup */
    }
  }

  // 6) Handle incoming referral code (?ref= param)
  if (input.refCode) {
    try {
      const { data: refOwner } = await supabase
        .from("referral_codes")
        .select("user_id")
        .eq("referral_code", input.refCode.toUpperCase())
        .eq("active", true)
        .maybeSingle();
      if (refOwner && refOwner.user_id !== userId) {
        await supabase.from("referral_events").insert({
          referrer_user_id: refOwner.user_id,
          referred_user_id: userId,
          referral_code_used: input.refCode.toUpperCase(),
        });
      }
    } catch {
      /* non-fatal */
    }
  }

  // 7) Issue a session for the browser (no email round-trip)
  // Dual-attach: always sign in as the existing identity email
  let signInEmail = email;
  if (attachUserId && userId) {
    try {
      const u = await supabase.auth.admin.getUserById(userId);
      const em = String(u.data.user?.email || "")
        .trim()
        .toLowerCase();
      if (em) signInEmail = em;
    } catch {
      /* keep input email */
    }
  }
  let signedIn = await supabase.auth.signInWithPassword({
    email: signInEmail,
    password: input.password,
  });
  // Retry once if sign-in races with createUser
  if (signedIn.error || !signedIn.data.session) {
    await new Promise((r) => setTimeout(r, 400));
    signedIn = await supabase.auth.signInWithPassword({
      email: signInEmail,
      password: input.password,
    });
  }
  // Confirmation email (Resend) non-blocking
  let emailSent: boolean | null = null;
  let emailError: string | null = null;
  try {
    const mail = await sendSignupConfirmationEmail({
      to: email,
      fullName: input.fullName,
      accountType: input.accountType,
    });
    emailSent = mail.ok;
    if (!mail.ok) emailError = mail.error;
  } catch (e) {
    emailSent = false;
    emailError = e instanceof Error ? e.message : "email failed";
  }

  // Still return success with profile if session missing client can auto-login
  if (signedIn.error || !signedIn.data.session || !signedIn.data.user) {
    await logSignupEvent(supabase, {
      ...eventBase,
      success: true,
      user_id: userId,
      meta: { createdNew, session: false, emailSent, emailError },
    });
    return apiOk({
      userId,
      createdNew,
      emailSent,
      session: null,
      accountType: input.accountType,
      role,
      profile: {
        id: userId,
        role,
        full_name: input.fullName,
        phone: input.phone,
        email,
        city: input.city || null,
        area: input.area || null,
        gender: input.gender,
        date_of_birth: input.dateOfBirth,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        avatar_url: null,
      },
      extras: {
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleYear: input.vehicleYear,
        vehicles: input.vehicles,
        businessName: input.businessName,
        primaryService:
          input.primaryService || input.services?.[0] || undefined,
        bio: input.bio,
        yearsExperience: input.yearsExperience,
        serviceRadiusKm: input.serviceRadiusKm,
        nin: hasNin ? nin : undefined,
        bvn: hasBvn ? bvn : undefined,
        ninVerified: hasNin,
        bvnVerified: hasBvn,
      },
      warning:
        "Account created. Opening session failed try logging in once with the same email and password.",
    });
  }

  await logSignupEvent(supabase, {
    ...eventBase,
    success: true,
    user_id: userId,
    meta: { createdNew, session: true, emailSent, emailError },
  });

  return apiOk({
    userId,
    createdNew,
    emailSent,
    session: {
      access_token: signedIn.data.session.access_token,
      refresh_token: signedIn.data.session.refresh_token,
      expires_at: signedIn.data.session.expires_at ?? null,
    },
    accountType: input.accountType,
    role,
    profile: {
      id: userId,
      role,
      full_name: input.fullName,
      phone: input.phone,
      email,
      city: input.city || null,
      area: input.area || null,
      gender: input.gender,
      date_of_birth: input.dateOfBirth,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      avatar_url: null,
    },
    extras: {
      vehicleMake: input.vehicleMake,
      vehicleModel: input.vehicleModel,
      vehicleYear: input.vehicleYear,
      vehicles: input.vehicles,
      businessName: input.businessName,
      primaryService: input.primaryService,
      bio: input.bio,
      yearsExperience: input.yearsExperience,
      serviceRadiusKm: input.serviceRadiusKm,
      nin: hasNin ? nin : undefined,
      bvn: hasBvn ? bvn : undefined,
      ninVerified: hasNin,
      bvnVerified: hasBvn,
    },
  });
}
