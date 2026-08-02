import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Unified identity + role sync.
 *
 * One real person == one `profiles` row (shared identity). `user_roles`
 * records which roles that identity has attached (Customer / Repair Pro), and
 * `payout_methods` is the canonical bank record reused across roles. Role
 * data stays in the side tables (motorist_profiles / repair_pro_profiles);
 * `profiles.role` remains the *active* role pointer.
 *
 * All of these run through the service-role client (bypasses RLS) and every
 * event is written to `identity_sync_log` for the audit trail.
 */

export type RoleType = "motorist" | "repair_pro";
export type Db = SupabaseClient;

export type SyncActor = {
  userId?: string | null;
  role?: string | null;
  /** Where the change came from (signup, switch, admin, system) */
  source?: string;
};

type LogEntry = {
  userId: string;
  action: string;
  oldState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  fieldsSynced?: Record<string, unknown>;
  bankSynced?: Record<string, unknown>;
  verificationSynced?: Record<string, unknown>;
  result?: "ok" | "error";
  error?: string;
  actor?: SyncActor;
  meta?: Record<string, unknown>;
};

export async function logIdentitySync(
  supabase: Db,
  entry: LogEntry
): Promise<void> {
  try {
    await supabase.from("identity_sync_log").insert({
      user_id: entry.userId,
      action: entry.action,
      old_state: entry.oldState ?? {},
      new_state: entry.newState ?? {},
      fields_synced: entry.fieldsSynced ?? {},
      bank_synced: entry.bankSynced ?? {},
      verification_synced: entry.verificationSynced ?? {},
      initiated_by: entry.actor?.userId ?? null,
      initiated_by_role: entry.actor?.role ?? null,
      result: entry.result ?? "ok",
      error: entry.error ?? null,
      meta: entry.meta ?? {},
    });
  } catch (e) {
    // Never block the caller on audit logging.
    console.error("[identity-sync] logIdentitySync failed", e);
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** List role types attached to a user (from user_roles registry). */
export async function listUserRoles(
  supabase: Db,
  userId: string
): Promise<RoleType[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role_type")
    .eq("user_id", userId)
    .eq("role_status", "active");
  if (error) return [];
  return ((data ?? []) as { role_type?: string }[])
    .map((r) => r.role_type)
    .filter((r): r is RoleType => r === "motorist" || r === "repair_pro");
}

/**
 * Idempotently register a role on an identity (creates the user_roles row).
 * Does not invent a side-table row — callers create role data themselves.
 */
export async function ensureUserRole(
  supabase: Db,
  userId: string,
  roleType: RoleType,
  actor?: SyncActor
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role_type", roleType)
      .maybeSingle();
    if (error) return { ok: false, created: false, error: error.message };
    if (data) return { ok: true, created: false };

    const { error: insErr } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role_type: roleType, role_status: "active" });
    if (insErr) return { ok: false, created: false, error: insErr.message };

    await logIdentitySync(supabase, {
      userId,
      action: "role_attached",
      newState: { role_type: roleType },
      actor,
      meta: { registry: "user_roles" },
    });
    return { ok: true, created: true };
  } catch (e) {
    return { ok: false, created: false, error: errorMessage(e) };
  }
}

/**
 * Canonical bank sync. Reads the best bank details from either side table,
 * writes one `payout_methods` record per user, and copies the details to the
 * other role's side table when it is missing them — so a bank entered once is
 * reused for both payouts (pro) and refunds (customer) without re-entry.
 */
export async function syncPayoutAcrossRoles(
  supabase: Db,
  userId: string,
  actor?: SyncActor
): Promise<{
  ok: boolean;
  error?: string;
  bankSynced?: Record<string, unknown>;
}> {
  const bankSynced: Record<string, unknown> = { copiedTo: [] as string[] };
  try {
    const [motRes, proRes] = await Promise.all([
      supabase
        .from("motorist_profiles")
        .select(
          "user_id, bank_name, bank_code, bank_account_name, bank_account_number, updated_at"
        )
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("repair_pro_profiles")
        .select(
          "user_id, bank_name, bank_code, bank_account_name, bank_account_number, updated_at"
        )
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (motRes.error && proRes.error) {
      return { ok: false, error: "Could not read bank details" };
    }

    type BankRow = {
      bank_name?: string | null;
      bank_code?: string | null;
      bank_account_name?: string | null;
      bank_account_number?: string | null;
      updated_at?: string | null;
    } | null | undefined;

    const mot = motRes.data as BankRow;
    const pro = proRes.data as BankRow;

    const hasNum = (row: BankRow) =>
      Boolean(row?.bank_account_number && row.bank_account_number.trim());

    // Source of truth: one NUBAN per identity. Prefer the side that has a
    // number; if both do, prefer the more recently updated row so the latest
    // save (Customer or Pro) wins and is merged to both roles.
    let source: "motorist" | "repair_pro" | "both" | null = null;
    if (hasNum(mot) && hasNum(pro)) {
      const mAt = mot?.updated_at ? Date.parse(mot.updated_at) : 0;
      const pAt = pro?.updated_at ? Date.parse(pro.updated_at) : 0;
      source = mAt >= pAt ? "motorist" : "repair_pro";
      bankSynced.conflictResolved = source;
    } else if (hasNum(mot)) source = "motorist";
    else if (hasNum(pro)) source = "repair_pro";
    if (!source) return { ok: true, bankSynced };

    const pick = (
      row: BankRow,
      field:
        | "bank_name"
        | "bank_code"
        | "bank_account_name"
        | "bank_account_number"
    ) => (row?.[field] || "").trim() || null;
    const winner = source === "motorist" ? mot : pro;
    const bank = {
      bank_name: pick(winner, "bank_name"),
      bank_code: pick(winner, "bank_code"),
      account_name: pick(winner, "bank_account_name"),
      account_number: pick(winner, "bank_account_number"),
    };
    const last4 = bank.account_number ? bank.account_number.slice(-4) : null;
    const bothRoles = Boolean(motRes.data && proRes.data);

    // 1) Canonical record.
    const { error: pmErr } = await supabase.from("payout_methods").upsert(
      {
        user_id: userId,
        bank_name: bank.bank_name,
        bank_code: bank.bank_code,
        account_name: bank.account_name,
        account_number_last4: last4,
        linked_role: bothRoles ? "both" : source,
        verified: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (pmErr) return { ok: false, error: pmErr.message };

    // 2) Always mirror the winning bank into every role side-table that exists
    //    so refunds (customer) and payouts (pro) withdraw to the same NUBAN.
    //    Role balances remain separate; only the payout destination is shared.
    const bankPatch = {
      bank_name: bank.bank_name,
      bank_code: bank.bank_code,
      bank_account_name: bank.account_name,
      bank_account_number: bank.account_number,
      updated_at: new Date().toISOString(),
    };

    if (motRes.data) {
      const same =
        pick(mot, "bank_code") === bank.bank_code &&
        (pick(mot, "bank_account_number") || "").replace(/\D/g, "") ===
          (bank.account_number || "").replace(/\D/g, "");
      if (!same) {
        const { error: copyErr } = await supabase
          .from("motorist_profiles")
          .update(bankPatch)
          .eq("user_id", userId);
        if (!copyErr) (bankSynced.copiedTo as string[]).push("motorist_profiles");
      }
    }
    if (proRes.data) {
      const same =
        pick(pro, "bank_code") === bank.bank_code &&
        (pick(pro, "bank_account_number") || "").replace(/\D/g, "") ===
          (bank.account_number || "").replace(/\D/g, "");
      if (!same) {
        const { error: copyErr } = await supabase
          .from("repair_pro_profiles")
          .update(bankPatch)
          .eq("user_id", userId);
        if (!copyErr) (bankSynced.copiedTo as string[]).push("repair_pro_profiles");
      }
    }

    await logIdentitySync(supabase, {
      userId,
      action: "bank_synced",
      newState: { source, bankName: bank.bank_name, last4, bothRoles },
      bankSynced,
      actor,
      meta: { canonical: "payout_methods", merged: true },
    });
    return { ok: true, bankSynced };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Attach a role to an identity: register it, then sync bank so anything the
 * user already saved on their other role carries over.
 */
export async function attachRole(
  supabase: Db,
  userId: string,
  roleType: RoleType,
  actor?: SyncActor
): Promise<{ ok: boolean; error?: string }> {
  const reg = await ensureUserRole(supabase, userId, roleType, {
    ...actor,
    source: actor?.source ?? "attach",
  });
  if (!reg.ok) return { ok: false, error: reg.error };
  const bank = await syncPayoutAcrossRoles(supabase, userId, actor);
  return { ok: bank.ok, error: bank.error };
}

/**
 * Re-run a full identity sync for a user: re-register roles from the side
 * tables and re-sync the canonical bank record. Self-heals old accounts that
 * predate the user_roles registry.
 */
export async function runIdentitySync(
  supabase: Db,
  userId: string,
  actor?: SyncActor
): Promise<{ ok: boolean; error?: string; roles?: RoleType[] }> {
  try {
    const [mot, pro] = await Promise.all([
      supabase.from("motorist_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
      supabase.from("repair_pro_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);

    const roles: RoleType[] = [];
    if (mot.data) roles.push("motorist");
    if (pro.data) roles.push("repair_pro");

    for (const r of roles) {
      await ensureUserRole(supabase, userId, r, actor);
    }
    const bank = await syncPayoutAcrossRoles(supabase, userId, actor);

    await logIdentitySync(supabase, {
      userId,
      action: "identity_sync",
      newState: { roles },
      fieldsSynced: { roles },
      bankSynced: bank.bankSynced ?? {},
      result: bank.ok ? "ok" : "error",
      error: bank.error,
      actor,
      meta: { source: actor?.source ?? "admin" },
    });
    return { ok: true, roles, error: bank.ok ? undefined : bank.error };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Merge queue candidate detection. Since `profiles.phone` / `profiles.email`
 * are UNIQUE, real duplicates are two accounts (a customer + a pro) that share
 * a strong identity signal — most reliably NIN/BVN last-4 (both side tables
 * store them). We also scan phone/email tails for future-proofing.
 */
/** Gov-ID kinds that identify a person by Driver's Licence number. */
const LICENSE_KINDS = new Set([
  "drivers_licence",
  "drivers_license",
  "driver_licence",
  "driver_license",
]);

/** Gov-ID kinds that identify a person by International Passport number. */
const PASSPORT_KINDS = new Set([
  "passport",
  "international_passport",
  "intl_passport",
]);

/** Normalize a full document number for matching (alnum + uppercase). */
function normalizeDocNumber(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = String(v).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return n || null;
}

export type IdSignal = {
  /** "nin" | "bvn" | "drivers_licence" | "passport" */
  type: string;
  value: string;
  source: string;
};

/** The identity signals stored on one side-table row. */
function signalsFromRow(row: Record<string, unknown>): IdSignal[] {
  const sigs: IdSignal[] = [];
  const nin = row.nin_last4;
  if (nin != null && String(nin).trim()) {
    sigs.push({ type: "nin", value: String(nin).trim(), source: "nin_last4" });
  }
  const bvn = row.bvn_last4;
  if (bvn != null && String(bvn).trim()) {
    sigs.push({ type: "bvn", value: String(bvn).trim(), source: "bvn_last4" });
  }
  const kind = String(row.gov_id_kind || "").toLowerCase().trim();
  const num = normalizeDocNumber(row.gov_id_number as string | null | undefined);
  if (num) {
    if (LICENSE_KINDS.has(kind)) {
      sigs.push({
        type: "drivers_licence",
        value: num,
        source: `gov_id.${kind}`,
      });
    } else if (PASSPORT_KINDS.has(kind)) {
      sigs.push({ type: "passport", value: num, source: `gov_id.${kind}` });
    }
  }
  return sigs;
}

const REASON_FOR_SIGNAL: Record<string, string> = {
  nin: "nin_last4",
  bvn: "bvn_last4",
  drivers_licence: "drivers_licence",
  passport: "passport",
};

/**
 * Merge candidate detection. Matches ANY two distinct accounts (customer +
 * pro, customer + customer, pro + pro) that share a strong identity signal:
 *   - NIN last-4 / BVN last-4 (privacy-safe)
 *   - full Driver's Licence number (gov_id_kind = drivers_licence)
 *   - full International Passport number (gov_id_kind = passport)
 * Deleted accounts are ignored as match targets. The earliest-created account
 * of a pair is suggested as the primary (canonical) identity.
 */
export async function detectMergeCandidates(
  supabase: Db,
  opts: { actor?: SyncActor; onlyUserId?: string } = {}
): Promise<{ added: number; candidates: unknown[]; error?: string }> {
  try {
    // Deleted accounts never participate in matching.
    const { data: deletedRes } = await supabase
      .from("profiles")
      .select("id")
      .or("is_active.eq.false,deleted_at.not.isnull");
    const excluded = new Set(
      ((deletedRes ?? []) as { id?: string }[]).map((r) => String(r.id))
    );

    const [mots, pros] = await Promise.all([
      supabase
        .from("motorist_profiles")
        .select("user_id, nin_last4, bvn_last4, gov_id_kind, gov_id_number, created_at")
        .order("created_at", { ascending: true })
        .limit(10000),
      supabase
        .from("repair_pro_profiles")
        .select("user_id, nin_last4, bvn_last4, gov_id_kind, gov_id_number, created_at")
        .order("created_at", { ascending: true })
        .limit(10000),
    ]);
    if (mots.error) return { added: 0, candidates: [], error: mots.error.message };
    if (pros.error) return { added: 0, candidates: [], error: pros.error.message };

    // Index every identity (by user_id) with its signals + earliest created_at.
    const users = new Map<
      string,
      { userId: string; createdAt: number; signals: IdSignal[] }
    >();
    const addUser = (row: Record<string, unknown>) => {
      if (row.user_id == null) return;
      const id = String(row.user_id);
      if (excluded.has(id)) return;
      const sigs = signalsFromRow(row);
      if (!sigs.length && !users.has(id)) {
        users.set(id, { userId: id, createdAt: 0, signals: [] });
        return;
      }
      const existing = users.get(id);
      const t = new Date(String(row.created_at || "")).getTime() || 0;
      if (!existing) {
        users.set(id, { userId: id, createdAt: t, signals: sigs });
      } else {
        for (const s of sigs) {
          if (
            !existing.signals.some(
              (x) => x.type === s.type && x.value === s.value
            )
          ) {
            existing.signals.push(s);
          }
        }
        if (existing.createdAt === 0 || (t > 0 && t < existing.createdAt)) {
          existing.createdAt = t;
        }
      }
    };
    ((mots.data ?? []) as Record<string, unknown>[]).forEach(addUser);
    ((pros.data ?? []) as Record<string, unknown>[]).forEach(addUser);

    // Group user ids by each signal value.
    const bySignal = new Map<string, string[]>();
    for (const u of users.values()) {
      for (const s of u.signals) {
        const key = `${s.type}:${s.value}`;
        if (!bySignal.has(key)) bySignal.set(key, []);
        bySignal.get(key)!.push(u.userId);
      }
    }

    // Already-handled pairs (pending/approved/merged/rejected) are not re-added.
    const { data: existingRes } = await supabase
      .from("identity_merges")
      .select("primary_user_id, duplicate_user_id");
    const existingPairs = new Set<string>();
    for (const r of (existingRes ?? []) as { primary_user_id?: string; duplicate_user_id?: string }[]) {
      existingPairs.add(
        [String(r.primary_user_id), String(r.duplicate_user_id)].sort().join(":")
      );
    }

    const pairs: {
      primary: string;
      duplicate: string;
      reason: string;
      detail: Record<string, unknown>;
    }[] = [];
    const seen = new Set<string>();
    for (const [key, ids] of bySignal) {
      if (ids.length < 2) continue;
      const uniq = [...new Set(ids)];
      for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
          const a = uniq[i];
          const b = uniq[j];
          if (a === b) continue;
          const pairKey = [a, b].sort().join(":");
          if (seen.has(pairKey) || existingPairs.has(pairKey)) continue;
          seen.add(pairKey);
          // Earliest account is the primary (canonical) identity.
          const aT = users.get(a)!.createdAt;
          const bT = users.get(b)!.createdAt;
          let primary = a;
          let duplicate = b;
          if (bT < aT || (bT === aT && b < a)) {
            primary = b;
            duplicate = a;
          }
          if (
            opts.onlyUserId &&
            primary !== opts.onlyUserId &&
            duplicate !== opts.onlyUserId
          ) {
            continue;
          }
          const sigType = key.slice(0, key.indexOf(":"));
          const sigValue = key.slice(key.indexOf(":") + 1);
          pairs.push({
            primary,
            duplicate,
            reason: REASON_FOR_SIGNAL[sigType] || sigType,
            detail: {
              matched_signal: sigType,
              matched_value: sigValue,
              gov_id_kind:
                sigType === "drivers_licence" || sigType === "passport"
                  ? sigValue
                  : null,
            },
          });
        }
      }
    }

    let added = 0;
    for (const p of pairs) {
      const { error } = await supabase
        .from("identity_merges")
        .insert({
          primary_user_id: p.primary,
          duplicate_user_id: p.duplicate,
          match_reason: p.reason,
          match_detail: p.detail,
          status: "pending",
          created_by: opts.actor?.userId ?? null,
        })
        .select("id");
      if (!error) added += 1;
    }
    return { added, candidates: pairs };
  } catch (e) {
    return { added: 0, candidates: [], error: errorMessage(e) };
  }
}

/**
 * Signup-time detection: match ONE freshly-registered identity's documents
 * against every other account and queue any duplicates for admin review.
 */
export async function detectMergeCandidatesForUser(
  supabase: Db,
  userId: string,
  actor?: SyncActor
): Promise<{ added: number; candidates: unknown[]; error?: string }> {
  return detectMergeCandidates(supabase, { actor, onlyUserId: userId });
}

/** Reassign FK references from the duplicate identity to the primary. */
async function reassignRefs(
  supabase: Db,
  dup: string,
  primary: string
): Promise<string[]> {
  const refTables: { table: string; columns: string[] }[] = [
    { table: "service_requests", columns: ["motorist_id", "repair_pro_id"] },
    { table: "job_status_events", columns: ["actor_id"] },
    { table: "bookings", columns: ["motorist_id", "repair_pro_id"] },
    { table: "payments", columns: ["motorist_id", "repair_pro_id"] },
    { table: "conversations", columns: ["motorist_id", "repair_pro_id"] },
    { table: "messages", columns: ["sender_id"] },
    { table: "reviews", columns: ["motorist_id", "repair_pro_id"] },
    { table: "pro_reviews", columns: ["motorist_id", "repair_pro_id"] },
    { table: "notifications", columns: ["user_id"] },
    { table: "admin_actions", columns: ["admin_id", "target_user_id"] },
    { table: "payout_accounts", columns: ["user_id"] },
    { table: "payouts", columns: ["pro_id"] },
    { table: "support_tickets", columns: ["requester_id", "assigned_to"] },
    { table: "support_ticket_events", columns: ["actor_id"] },
    { table: "wallet_accounts", columns: ["user_id"] },
    { table: "wallet_transactions", columns: ["user_id"] },
    { table: "user_addresses", columns: ["user_id"] },
    { table: "user_sessions", columns: ["user_id"] },
    { table: "referral_codes", columns: ["user_id"] },
    { table: "referral_events", columns: ["referrer_user_id", "referred_user_id"] },
    { table: "platform_audit_logs", columns: ["actor_id"] },
    { table: "app_settings", columns: ["updated_by"] },
    { table: "feature_flags", columns: ["updated_by"] },
    { table: "staff_role_assignments", columns: ["user_id", "assigned_by"] },
    { table: "call_signals", columns: ["to_user_id", "from_user_id"] },
  ];
  const warnings: string[] = [];
  for (const { table, columns } of refTables) {
    for (const col of columns) {
      try {
        const { error } = await supabase
          .from(table)
          .update({ [col]: primary })
          .eq(col, dup);
        if (error) warnings.push(`${table}.${col}: ${error.message}`);
      } catch (e) {
        warnings.push(`${table}.${col}: ${errorMessage(e)}`);
      }
    }
  }
  return warnings;
}

/** Fill missing identity fields on the primary from the duplicate. */
async function mergeProfileFields(
  supabase: Db,
  primary: string,
  dup: string
): Promise<void> {
  const [aRes, bRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, phone, email, avatar_url, city, area, gender, date_of_birth, preferred_locale"
      )
      .eq("id", primary)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select(
        "full_name, phone, email, avatar_url, city, area, gender, date_of_birth, preferred_locale"
      )
      .eq("id", dup)
      .maybeSingle(),
  ]);
  const a = aRes.data as Record<string, unknown> | null | undefined;
  const b = bRes.data as Record<string, unknown> | null | undefined;
  if (!a || !b) return;

  const patch: Record<string, unknown> = {};
  for (const key of [
    "full_name",
    "phone",
    "email",
    "avatar_url",
    "city",
    "area",
    "gender",
    "date_of_birth",
    "preferred_locale",
  ]) {
    const cur = a[key];
    const empty = cur == null || cur === "";
    if (empty && b[key] != null && b[key] !== "") patch[key] = b[key];
  }
  if (Object.keys(patch).length) {
    await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", primary);
  }
}

/** Merge a side-table row from the duplicate into the primary (fill empty). */
async function mergeSideTable(
  supabase: Db,
  dup: string,
  primary: string,
  table: "motorist_profiles" | "repair_pro_profiles"
): Promise<void> {
  const { data: dupRow } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", dup)
    .maybeSingle();
  if (!dupRow) return;
  const row = dupRow as Record<string, unknown>;

  const { data: primRow } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", primary)
    .maybeSingle();
  if (!primRow) {
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!["user_id", "created_at", "updated_at"].includes(k)) rest[k] = v;
    }
    await supabase
      .from(table)
      .upsert({ ...rest, user_id: primary }, { onConflict: "user_id" });
    return;
  }

  const cur = primRow as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (["user_id", "created_at", "updated_at"].includes(k)) continue;
    const c = cur[k];
    const empty =
      c == null || c === "" || (Array.isArray(c) && c.length === 0);
    if (empty && v != null && v !== "") patch[k] = v;
  }
  if (Object.keys(patch).length) {
    await supabase
      .from(table)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", primary);
  }
}

/**
 * Merge two accounts for the same person. The duplicate's data (jobs, chats,
 * payments, reviews, side profiles, payout) is moved onto the primary identity,
 * the duplicate is soft-disabled, and its auth login is banned so there is one
 * login + one financial identity. Never deletes historical records.
 */
export async function mergeIdentities(
  supabase: Db,
  opts: {
    primaryUserId: string;
    duplicateUserId: string;
    performedBy?: string | null;
    performedByRole?: string | null;
  }
): Promise<{ ok: boolean; error?: string; warnings?: string[] }> {
  const { primaryUserId, duplicateUserId } = opts;
  if (primaryUserId === duplicateUserId) {
    return { ok: false, error: "Cannot merge an account into itself." };
  }
  const actor: SyncActor = {
    userId: opts.performedBy,
    role: opts.performedByRole,
    source: "admin_merge",
  };

  try {
    await logIdentitySync(supabase, {
      userId: primaryUserId,
      action: "merge_started",
      newState: { duplicateUserId },
      actor,
      meta: { duplicateUserId },
    });

    // 1) Move every FK reference to the primary identity.
    const warnings = await reassignRefs(supabase, duplicateUserId, primaryUserId);

    // 2) Fill missing identity fields (never overwrite existing values).
    await mergeProfileFields(supabase, primaryUserId, duplicateUserId);

    // 3) Bring role data across.
    await mergeSideTable(supabase, duplicateUserId, primaryUserId, "motorist_profiles");
    await mergeSideTable(supabase, duplicateUserId, primaryUserId, "repair_pro_profiles");

    // 4) Register both roles on the primary and sync the canonical bank.
    await runIdentitySync(supabase, primaryUserId, actor);

    // 5) Remove the duplicate's own role/payout registry rows.
    await supabase.from("user_roles").delete().eq("user_id", duplicateUserId);
    await supabase.from("payout_methods").delete().eq("user_id", duplicateUserId);
    await supabase.from("motorist_profiles").delete().eq("user_id", duplicateUserId);
    await supabase.from("repair_pro_profiles").delete().eq("user_id", duplicateUserId);

    // 6) Soft-disable the duplicate identity (keeps history; no second login).
    await supabase
      .from("profiles")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", duplicateUserId);

    // 7) Ban the duplicate auth user so the old login stops working.
    try {
      await supabase.auth.admin.updateUserById(duplicateUserId, {
        ban_duration: "876000h",
      });
    } catch (e) {
      warnings.push(`auth ban: ${errorMessage(e)}`);
    }

    // 8) Close any open merge records.
    await supabase
      .from("identity_merges")
      .update({
        status: "merged",
        reviewed_by: opts.performedBy ?? null,
        reviewed_at: new Date().toISOString(),
        error: warnings.length ? warnings.join("; ") : null,
      })
      .or(`primary_user_id.eq.${duplicateUserId},duplicate_user_id.eq.${duplicateUserId}`)
      .eq("status", "pending");

    await logIdentitySync(supabase, {
      userId: primaryUserId,
      action: "merge_completed",
      newState: { duplicateUserId },
      fieldsSynced: { merged: ["jobs", "chats", "payments", "reviews", "roles", "payout"] },
      result: "ok",
      actor,
      meta: { duplicateUserId, warnings },
    });
    return { ok: true, warnings };
  } catch (e) {
    const msg = errorMessage(e);
    await logIdentitySync(supabase, {
      userId: primaryUserId,
      action: "merge_completed",
      result: "error",
      error: msg,
      actor,
      meta: { duplicateUserId },
    });
    return { ok: false, error: msg };
  }
}

/**
 * Admin identity snapshot: roles, side profiles, canonical payout, sync status,
 * missing/completed fields, recent sync events and pending merges.
 */
export async function identityStatus(
  supabase: Db,
  userId: string
): Promise<{
  roles: RoleType[];
  hasMotorist: boolean;
  hasPro: boolean;
  payoutMethod: Record<string, unknown> | null;
  syncStatus: "in_sync" | "needs_sync" | "conflict" | "unknown";
  missingFields: string[];
  completedFields: string[];
  syncLog: unknown[];
  pendingMerges: unknown[];
}> {
  const roles = await listUserRoles(supabase, userId);

  const [motRes, proRes, pmRes, logRes, mergesRes] = await Promise.all([
    supabase.from("motorist_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("repair_pro_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("payout_methods").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("identity_sync_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("identity_merges")
      .select("*")
      .or(`primary_user_id.eq.${userId},duplicate_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const mot = motRes.data as Record<string, unknown> | null | undefined;
  const pro = proRes.data as Record<string, unknown> | null | undefined;
  const pm = pmRes.data as Record<string, unknown> | null | undefined;
  const hasMotorist = Boolean(mot);
  const hasPro = Boolean(pro);

  // Registry vs reality check.
  let syncStatus: "in_sync" | "needs_sync" | "conflict" | "unknown" = "in_sync";
  if (Boolean(mot) !== roles.includes("motorist") || Boolean(pro) !== roles.includes("repair_pro")) {
    syncStatus = "needs_sync";
  }
  if (
    pm &&
    pm.linked_role === "both" &&
    (!hasMotorist || !hasPro)
  ) {
    syncStatus = "conflict";
  }

  const missingFields: string[] = [];
  const completedFields: string[] = [];
  if (mot) {
    if (!mot.vehicle_make && !mot.vehicle_model) missingFields.push("customer.vehicle");
    if (mot.nin_verified) completedFields.push("customer.nin_verified");
    else missingFields.push("customer.nin_verified");
  }
  if (pro) {
    if (!pro.business_name) missingFields.push("pro.business_name");
    if (pro.status === "approved") completedFields.push("pro.approved");
    else missingFields.push(`pro.status:${String(pro.status || "?")}`);
    if (pro.nin_verified) completedFields.push("pro.nin_verified");
    if (pro.docs_status === "approved") completedFields.push("pro.docs_approved");
  }
  if (!pm) missingFields.push("payout_method");
  else completedFields.push(`payout.${pm.linked_role}`);

  return {
    roles,
    hasMotorist,
    hasPro,
    payoutMethod: pm ?? null,
    syncStatus,
    missingFields,
    completedFields,
    syncLog: (logRes.data ?? []) as unknown[],
    pendingMerges: (mergesRes.data ?? []) as unknown[],
  };
}
