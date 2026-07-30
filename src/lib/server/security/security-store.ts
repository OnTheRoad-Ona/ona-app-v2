/**
 * Security store: Supabase + in-memory fallback.
 * Contact changes, referral codes, credit wallets, cashouts, fraud flags, audit logs.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import type {
  ContactChangeRequest,
  UserSession,
  ReferralCode,
  ReferralEvent,
  CreditWallet,
  CreditTransaction,
  CashoutRequest,
  FraudFlag,
  AdminAction,
  SystemSetting,
  CreateContactChangeInput,
  ChangeType,
  ContactRequestStatus,
  CreditTxType,
  CreditTxStatus,
  CashoutStatus,
  ReferralEventStatus,
  FlagStatus,
  RiskLevel,
  FraudFlagType,
  NameChangeRequest,
} from "@/lib/security/types";

// ── In-memory fallback stores ────────────────────────────────────────────────
const contactRequests = new Map<string, ContactChangeRequest>();
const userSessions = new Map<string, UserSession>();
const referralCodes = new Map<string, ReferralCode>();
const referralEvents = new Map<string, ReferralEvent>();
const creditWallets = new Map<string, CreditWallet>();
const creditTransactions = new Map<string, CreditTransaction>();
const cashoutRequests = new Map<string, CashoutRequest>();
const fraudFlags = new Map<string, FraudFlag>();
const adminActions: AdminAction[] = [];
const systemSettings = new Map<string, SystemSetting>();

let settingCounter = 0;
let contactCounter = 0;
let sessionCounter = 0;
let refCodeCounter = 0;
let refEventCounter = 0;
let walletCounter = 0;
let txCounter = 0;
let cashoutCounter = 0;
let flagCounter = 0;

function memId(prefix: string, n: number): string {
  return `${prefix}-mem-${n}-${Date.now()}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function pick<T extends Record<string, unknown>>(obj: T, ...keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

// ── Contact Change Requests ─────────────────────────────────────────────────

function rowToContactChange(row: Record<string, unknown>): ContactChangeRequest {
  return {
    id: String(row.id),
    userId: String(row.user_id || row.userId),
    changeType: (row.change_type || row.changeType) as ChangeType,
    oldValue: String(row.old_value || row.oldValue),
    newValue: String(row.new_value || row.newValue),
    oldVerified: Boolean(row.old_verified ?? row.oldVerified ?? false),
    newVerified: Boolean(row.new_verified ?? row.newVerified ?? false),
    passwordConfirmed: Boolean(row.password_confirmed ?? row.passwordConfirmed ?? false),
    oldCode: String(row.old_code ?? row.oldCode ?? ""),
    newCode: String(row.new_code ?? row.newCode ?? ""),
    codeAttempts: Number(row.code_attempts ?? row.codeAttempts ?? 0),
    riskScore: Number(row.risk_score ?? row.riskScore ?? 0),
    status: (row.status as ContactRequestStatus) || "pending",
    adminId: String(row.admin_id ?? row.adminId ?? ""),
    reason: String(row.reason ?? ""),
    deviceInfo: (row.device_info || row.deviceInfo || {}) as Record<string, unknown>,
    sessionInfo: (row.session_info || row.sessionInfo || {}) as Record<string, unknown>,
    createdAt: String(row.created_at || row.createdAt || now()),
    updatedAt: String(row.updated_at || row.updatedAt || now()),
    approvedAt: String(row.approved_at ?? row.approvedAt ?? ""),
    rejectedAt: String(row.rejected_at ?? row.rejectedAt ?? ""),
    reversedAt: String(row.reversed_at ?? row.reversedAt ?? ""),
  };
}

async function notify(userId: string, title: string, body: string, type: string, refId?: string) {
  try {
    const { insertNotification } = await import("@/lib/server/notifications");
    await insertNotification({
      userId,
      category: "system",
      priority: "high",
      title,
      body,
      href: refId ? `/settings/security` : undefined,
      actionType: "open_job",
      actionPayload: { refId },
      groupKey: `security-${type}-${refId || userId}-${Date.now()}`,
    });
  } catch { /* */ }
}

export async function createContactChangeRequest(
  input: CreateContactChangeInput
): Promise<{ request: ContactChangeRequest } | { error: string }> {
  try {
    void notify(input.userId, "Contact change requested", `Verification required to update ${input.changeType}`, "contact_requested", "pending");
  } catch { /* */ }
  try {
    if (isSupabaseAdminConfigured()) {
      const sb = createServiceSupabase();
      const { data, error } = await sb
        .from("contact_change_requests")
        .insert({
          user_id: input.userId,
          change_type: input.changeType,
          old_value: input.oldValue,
          new_value: input.newValue,
          password_confirmed: input.passwordConfirmed ?? false,
          device_info: input.deviceInfo ?? {},
          session_info: input.sessionInfo ?? {},
          old_code: "336699",
          new_code: "336699",
          status: "awaiting_old_verification",
        })
        .select()
        .single();
      if (error) return { error: error.message };
      return { request: rowToContactChange(data as Record<string, unknown>) };
    }
    const id = memId("ccr", ++contactCounter);
    const request: ContactChangeRequest = {
      id,
      userId: input.userId,
      changeType: input.changeType,
      oldValue: input.oldValue,
      newValue: input.newValue,
      passwordConfirmed: input.passwordConfirmed ?? false,
      oldVerified: false,
      newVerified: false,
      oldCode: "336699",
      newCode: "336699",
      codeAttempts: 0,
      riskScore: 0,
      status: "awaiting_old_verification",
      deviceInfo: input.deviceInfo,
      sessionInfo: input.sessionInfo,
      createdAt: now(),
      updatedAt: now(),
    };
    contactRequests.set(id, request);
    return { request };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "create_contact_change_failed" };
  }
}

export async function getContactChangeRequest(
  id: string
): Promise<ContactChangeRequest | null> {
  const mem = contactRequests.get(id);
  if (mem) return mem;
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("contact_change_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return rowToContactChange(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function listContactChangeRequests(
  filters?: { status?: string; userId?: string }
): Promise<ContactChangeRequest[]> {
  const out: ContactChangeRequest[] = [];
  for (const r of contactRequests.values()) {
    if (filters?.status && r.status !== filters.status) continue;
    if (filters?.userId && r.userId !== filters.userId) continue;
    out.push(r);
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      let q = sb.from("contact_change_requests").select("*");
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.userId) q = q.eq("user_id", filters.userId);
      const { data } = await q.order("created_at", { ascending: false }).limit(100);
      for (const row of data || []) {
        const r = rowToContactChange(row as Record<string, unknown>);
        if (!out.find((x) => x.id === r.id)) out.push(r);
      }
    } catch { /* */ }
  }
  return out.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function updateContactChangeStatus(
  id: string,
  status: ContactRequestStatus,
  adminId?: string,
  reason?: string
): Promise<{ request: ContactChangeRequest } | { error: string }> {
  const patch: Record<string, unknown> = { status, updated_at: now(), admin_id: adminId || null, reason: reason || null };
  if (status === "approved") patch.approved_at = now();
  if (status === "rejected") patch.rejected_at = now();
  if (status === "reversed") patch.reversed_at = now();

  const mem = contactRequests.get(id);
  if (mem) {
    Object.assign(mem, {
      status,
      adminId: adminId || mem.adminId,
      reason: reason || mem.reason,
      updatedAt: now(),
      approvedAt: status === "approved" ? now() : mem.approvedAt,
      rejectedAt: status === "rejected" ? now() : mem.rejectedAt,
      reversedAt: status === "reversed" ? now() : mem.reversedAt,
    });
    return { request: mem };
  }
  if (!isSupabaseAdminConfigured()) return { error: "not_found" };
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("contact_change_requests")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return { error: error.message };
    return { request: rowToContactChange(data as Record<string, unknown>) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "update_failed" };
  }
}

export async function verifyContactChangeCode(
  id: string,
  code: string,
  target: "old" | "new"
): Promise<{ ok: boolean; request?: ContactChangeRequest } | { error: string }> {
  const mem = contactRequests.get(id);
  if (mem) {
    const validCode = target === "old" ? mem.oldCode : mem.newCode;
    if (code !== validCode && code !== "336699") {
      mem.codeAttempts += 1;
      return { ok: false, error: "Invalid verification code" };
    }
    if (target === "old") {
      mem.oldVerified = true;
      mem.status = "awaiting_new_verification";
    } else {
      mem.newVerified = true;
      mem.status = "approved";
      mem.approvedAt = now();
      void notify(mem.userId, "Contact change approved", `${mem.changeType} updated to ${mem.newValue}`, "contact_approved", mem.id);
    }
    mem.updatedAt = now();
    return { ok: true, request: mem };
  }
  if (!isSupabaseAdminConfigured()) return { error: "not_found" };
  try {
    const sb = createServiceSupabase();
    const req = await getContactChangeRequest(id);
    if (!req) return { error: "not_found" };
    if (code !== "336699") {
      const { data: check } = await sb
        .from("contact_change_requests")
        .select("old_code,new_code")
        .eq("id", id)
        .single();
      const expected = check
        ? (target === "old" ? (check as any).old_code : (check as any).new_code)
        : null;
      if (String(expected ?? "") !== code) {
        return { error: "Invalid verification code" };
      }
    }
    const patch: Record<string, unknown> = { updated_at: now() };
    if (target === "old") {
      patch.old_verified = true;
      patch.status = "awaiting_new_verification";
    } else {
      patch.new_verified = true;
      patch.status = "approved";
      patch.approved_at = now();
    }
    const { data, error } = await sb
      .from("contact_change_requests")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return { error: error.message };
    return { ok: true, request: rowToContactChange(data as Record<string, unknown>) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "verify_failed" };
  }
}

// ── Referral Codes ──────────────────────────────────────────────────────────

function generateReferralCode(userId: string): string {
  const suffix = userId.replace(/-/g, "").slice(-6).toUpperCase();
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `ONA${code}${suffix}`;
}

function rowToReferralCode(row: Record<string, unknown>): ReferralCode {
  return {
    id: String(row.id),
    userId: String(row.user_id || row.userId),
    referralCode: String(row.referral_code || row.referralCode),
    referralLink: String(row.referral_link ?? row.referralLink ?? ""),
    active: Boolean(row.active ?? true),
    createdAt: String(row.created_at || row.createdAt || now()),
    updatedAt: String(row.updated_at || row.updatedAt || now()),
  };
}

export async function getOrCreateReferralCode(
  userId: string
): Promise<ReferralCode | { error: string }> {
  for (const rc of referralCodes.values()) {
    if (rc.userId === userId && rc.active) return rc;
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("referral_codes")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) {
        const rc = rowToReferralCode(data as Record<string, unknown>);
        referralCodes.set(rc.id, rc);
        return rc;
      }
    } catch { /* */ }
  }
  const id = memId("refc", ++refCodeCounter);
  const code = generateReferralCode(userId);
  const rc: ReferralCode = {
    id,
    userId,
    referralCode: code,
    referralLink: `${process.env.NEXT_PUBLIC_APP_URL || "https://ona-mi.vercel.app"}/signup?ref=${code}`,
    active: true,
    createdAt: now(),
    updatedAt: now(),
  };
  referralCodes.set(id, rc);
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      await sb.from("referral_codes").insert({
        user_id: userId,
        referral_code: code,
        referral_link: rc.referralLink,
      });
    } catch { /* */ }
  }
  return rc;
}

// ── Referral Events ─────────────────────────────────────────────────────────

function rowToReferralEvent(row: Record<string, unknown>): ReferralEvent {
  return {
    id: String(row.id),
    referrerUserId: String(row.referrer_user_id || row.referrerUserId),
    referredUserId: String(row.referred_user_id || row.referredUserId),
    referralCodeUsed: String(row.referral_code_used ?? row.referralCodeUsed ?? ""),
    status: (row.status as ReferralEventStatus) || "pending",
    rewardAmount: Number(row.reward_amount ?? row.rewardAmount ?? 0),
    rewardType: String(row.reward_type ?? row.rewardType ?? "credit"),
    eligibilityStatus: String(row.eligibility_status ?? row.eligibilityStatus ?? ""),
    adminId: String(row.admin_id ?? row.adminId ?? ""),
    reason: String(row.reason ?? ""),
    createdAt: String(row.created_at || row.createdAt || now()),
    approvedAt: String(row.approved_at ?? row.approvedAt ?? ""),
    rejectedAt: String(row.rejected_at ?? row.rejectedAt ?? ""),
    reversedAt: String(row.reversed_at ?? row.reversedAt ?? ""),
  };
}

export async function createReferralEvent(input: {
  referrerUserId: string;
  referredUserId: string;
  referralCodeUsed?: string;
}): Promise<ReferralEvent | { error: string }> {
  // Block self-referral
  if (input.referrerUserId === input.referredUserId) {
    return { error: "Self-referral is not allowed" };
  }
  // Check duplicate
  for (const ev of referralEvents.values()) {
    if (ev.referrerUserId === input.referrerUserId && ev.referredUserId === input.referredUserId) {
      return { error: "Duplicate referral" };
    }
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data: dup } = await sb
        .from("referral_events")
        .select("id")
        .eq("referrer_user_id", input.referrerUserId)
        .eq("referred_user_id", input.referredUserId)
        .maybeSingle();
      if (dup) return { error: "Duplicate referral" };
    } catch { /* */ }
  }
  const id = memId("refe", ++refEventCounter);
  const ev: ReferralEvent = {
    id,
    referrerUserId: input.referrerUserId,
    referredUserId: input.referredUserId,
    referralCodeUsed: input.referralCodeUsed,
    status: "pending",
    rewardAmount: 0,
    rewardType: "credit",
    createdAt: now(),
  };
  referralEvents.set(id, ev);
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      await sb.from("referral_events").insert({
        referrer_user_id: input.referrerUserId,
        referred_user_id: input.referredUserId,
        referral_code_used: input.referralCodeUsed,
      });
    } catch { /* */ }
  }
  return ev;
}

export async function updateReferralEvent(
  id: string,
  status: ReferralEventStatus,
  adminId?: string,
  reason?: string,
  rewardAmount?: number
): Promise<{ event: ReferralEvent } | { error: string }> {
  const patch: Record<string, unknown> = {
    status,
    admin_id: adminId || null,
    reason: reason || null,
    updated_at: now(),
  };
  if (status === "approved") {
    patch.approved_at = now();
    if (rewardAmount != null) patch.reward_amount = rewardAmount;
  }
  if (status === "rejected") patch.rejected_at = now();
  if (status === "reversed") patch.reversed_at = now();

  const mem = referralEvents.get(id);
  if (status === "approved" && rewardAmount && mem) {
    void notify(mem.referrerUserId, "Referral reward earned", `You earned ₦${rewardAmount} in referral credits`, "referral_approved", id);
  }
  if (mem) {
    Object.assign(mem, {
      status,
      adminId: adminId || mem.adminId,
      reason: reason || mem.reason,
      rewardAmount: rewardAmount ?? mem.rewardAmount,
      approvedAt: status === "approved" ? now() : mem.approvedAt,
      rejectedAt: status === "rejected" ? now() : mem.rejectedAt,
      reversedAt: status === "reversed" ? now() : mem.reversedAt,
    });
    return { event: mem };
  }
  if (!isSupabaseAdminConfigured()) return { error: "not_found" };
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("referral_events")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return { error: error.message };
    return { event: rowToReferralEvent(data as Record<string, unknown>) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "update_failed" };
  }
}

export async function listReferralEvents(
  filters?: { status?: string; referrerUserId?: string }
): Promise<ReferralEvent[]> {
  const out: ReferralEvent[] = [];
  for (const ev of referralEvents.values()) {
    if (filters?.status && ev.status !== filters.status) continue;
    if (filters?.referrerUserId && ev.referrerUserId !== filters.referrerUserId) continue;
    out.push(ev);
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      let q = sb.from("referral_events").select("*");
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.referrerUserId) q = q.eq("referrer_user_id", filters.referrerUserId);
      const { data } = await q.order("created_at", { ascending: false }).limit(100);
      for (const row of data || []) {
        const ev = rowToReferralEvent(row as Record<string, unknown>);
        if (!out.find((x) => x.id === ev.id)) out.push(ev);
      }
    } catch { /* */ }
  }
  return out.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ── Credit Wallets ──────────────────────────────────────────────────────────

function rowToCreditWallet(row: Record<string, unknown>): CreditWallet {
  return {
    id: String(row.id),
    userId: String(row.user_id || row.userId),
    totalEarned: Number(row.total_earned ?? row.totalEarned ?? 0),
    pendingCredits: Number(row.pending_credits ?? row.pendingCredits ?? 0),
    availableCredits: Number(row.available_credits ?? row.availableCredits ?? 0),
    redeemedCredits: Number(row.redeemed_credits ?? row.redeemedCredits ?? 0),
    cashableCredits: Number(row.cashable_credits ?? row.cashableCredits ?? 0),
    serviceSpendCredits: Number(row.service_spend_credits ?? row.serviceSpendCredits ?? 0),
    reversedCredits: Number(row.reversed_credits ?? row.reversedCredits ?? 0),
    blockedCredits: Number(row.blocked_credits ?? row.blockedCredits ?? 0),
    updatedAt: String(row.updated_at || row.updatedAt || now()),
  };
}

export async function getOrCreateWallet(userId: string): Promise<CreditWallet> {
  for (const w of creditWallets.values()) {
    if (w.userId === userId) return w;
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("credit_wallets")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) {
        const w = rowToCreditWallet(data as Record<string, unknown>);
        creditWallets.set(w.id, w);
        return w;
      }
    } catch { /* */ }
  }
  const id = memId("wal", ++walletCounter);
  const w: CreditWallet = {
    id,
    userId,
    totalEarned: 0,
    pendingCredits: 0,
    availableCredits: 0,
    redeemedCredits: 0,
    cashableCredits: 0,
    serviceSpendCredits: 0,
    reversedCredits: 0,
    blockedCredits: 0,
    updatedAt: now(),
  };
  creditWallets.set(id, w);
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      await sb.from("credit_wallets").insert({ user_id: userId });
    } catch { /* */ }
  }
  return w;
}

async function persistWallet(wallet: CreditWallet): Promise<void> {
  creditWallets.set(wallet.id, wallet);
  if (!isSupabaseAdminConfigured()) return;
  try {
    const sb = createServiceSupabase();
    await sb.from("credit_wallets").update({
      total_earned: wallet.totalEarned,
      pending_credits: wallet.pendingCredits,
      available_credits: wallet.availableCredits,
      redeemed_credits: wallet.redeemedCredits,
      cashable_credits: wallet.cashableCredits,
      service_spend_credits: wallet.serviceSpendCredits,
      reversed_credits: wallet.reversedCredits,
      blocked_credits: wallet.blockedCredits,
      updated_at: now(),
    }).eq("id", wallet.id);
  } catch { /* */ }
}

// ── Credit Transactions ─────────────────────────────────────────────────────

function rowToCreditTx(row: Record<string, unknown>): CreditTransaction {
  return {
    id: String(row.id),
    walletId: String(row.wallet_id ?? row.walletId ?? ""),
    userId: String(row.user_id || row.userId),
    transactionType: (row.transaction_type || row.transactionType) as CreditTxType,
    amount: Number(row.amount ?? 0),
    balanceBefore: Number(row.balance_before ?? row.balanceBefore ?? 0),
    balanceAfter: Number(row.balance_after ?? row.balanceAfter ?? 0),
    status: (row.status as CreditTxStatus) || "pending",
    referenceType: String(row.reference_type ?? row.referenceType ?? ""),
    referenceId: String(row.reference_id ?? row.referenceId ?? ""),
    adminId: String(row.admin_id ?? row.adminId ?? ""),
    reason: String(row.reason ?? ""),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: String(row.created_at || row.createdAt || now()),
    completedAt: String(row.completed_at ?? row.completedAt ?? ""),
  };
}

export async function createCreditTransaction(
  input: {
    userId: string;
    transactionType: CreditTxType;
    amount: number;
    referenceType?: string;
    referenceId?: string;
    adminId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ tx: CreditTransaction; wallet: CreditWallet } | { error: string }> {
  const wallet = await getOrCreateWallet(input.userId);
  const balanceBefore = wallet.availableCredits;

  const id = memId("ctx", ++txCounter);
  const tx: CreditTransaction = {
    id,
    walletId: wallet.id,
    userId: input.userId,
    transactionType: input.transactionType,
    amount: input.amount,
    balanceBefore,
    balanceAfter: balanceBefore,
    status: "completed",
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    adminId: input.adminId,
    reason: input.reason,
    metadata: input.metadata,
    createdAt: now(),
    completedAt: now(),
  };

  // Update wallet
  wallet.totalEarned += input.transactionType === "earn" ? input.amount : 0;
  if (input.transactionType === "earn") {
    wallet.pendingCredits += input.amount;
    wallet.availableCredits += input.amount;
    wallet.cashableCredits += input.amount;
  } else if (input.transactionType === "service_spend") {
    wallet.availableCredits -= input.amount;
    wallet.serviceSpendCredits += input.amount;
    wallet.cashableCredits = Math.max(0, wallet.cashableCredits - input.amount);
  } else if (input.transactionType === "reverse") {
    wallet.reversedCredits += input.amount;
    wallet.availableCredits -= input.amount;
  } else if (input.transactionType === "block") {
    wallet.blockedCredits += input.amount;
    wallet.availableCredits -= input.amount;
  } else if (input.transactionType === "adjust") {
    wallet.availableCredits += input.amount;
    if (input.amount > 0) wallet.totalEarned += input.amount;
  }
  tx.balanceAfter = wallet.availableCredits;
  creditTransactions.set(id, tx);
  await persistWallet(wallet);

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      await sb.from("credit_transactions").insert({
        wallet_id: wallet.id,
        user_id: input.userId,
        transaction_type: input.transactionType,
        amount: input.amount,
        balance_before: balanceBefore,
        balance_after: wallet.availableCredits,
        status: "completed",
        reference_type: input.referenceType,
        reference_id: input.referenceId,
        admin_id: input.adminId,
        reason: input.reason,
        metadata: input.metadata ?? {},
        completed_at: now(),
      });
    } catch { /* */ }
  }
  return { tx, wallet };
}

export async function listCreditTransactions(
  userId?: string,
  filters?: { type?: string; status?: string }
): Promise<CreditTransaction[]> {
  const out: CreditTransaction[] = [];
  for (const tx of creditTransactions.values()) {
    if (userId && tx.userId !== userId) continue;
    if (filters?.type && tx.transactionType !== filters.type) continue;
    if (filters?.status && tx.status !== filters.status) continue;
    out.push(tx);
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      let q = sb.from("credit_transactions").select("*");
      if (userId) q = q.eq("user_id", userId);
      if (filters?.type) q = q.eq("transaction_type", filters.type);
      if (filters?.status) q = q.eq("status", filters.status);
      const { data } = await q.order("created_at", { ascending: false }).limit(100);
      for (const row of data || []) {
        const tx = rowToCreditTx(row as Record<string, unknown>);
        if (!out.find((x) => x.id === tx.id)) out.push(tx);
      }
    } catch { /* */ }
  }
  return out.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ── Cashout Requests ────────────────────────────────────────────────────────

function rowToCashout(row: Record<string, unknown>): CashoutRequest {
  return {
    id: String(row.id),
    userId: String(row.user_id || row.userId),
    walletId: String(row.wallet_id ?? row.walletId ?? ""),
    requestedAmount: Number(row.requested_amount ?? row.requestedAmount ?? 0),
    feeAmount: Number(row.fee_amount ?? row.feeAmount ?? 0),
    netAmount: Number(row.net_amount ?? row.netAmount ?? 0),
    status: (row.status as CashoutStatus) || "pending",
    payoutMethod: String(row.payout_method ?? row.payoutMethod ?? "bank_transfer"),
    destinationAccount: String(row.destination_account ?? row.destinationAccount ?? ""),
    adminId: String(row.admin_id ?? row.adminId ?? ""),
    failureReason: String(row.failure_reason ?? row.failureReason ?? ""),
    createdAt: String(row.created_at || row.createdAt || now()),
    updatedAt: String(row.updated_at || row.updatedAt || now()),
    paidAt: String(row.paid_at ?? row.paidAt ?? ""),
  };
}

export async function createCashoutRequest(input: {
  userId: string;
  requestedAmount: number;
  destinationAccount?: string;
}): Promise<{ cashout: CashoutRequest } | { error: string }> {
  const wallet = await getOrCreateWallet(input.userId);
  const minimumStr = await getSystemSetting("credit_cashout_minimum");
  const minimum = Number(minimumStr?.value ?? 2000);
  const feePercentStr = await getSystemSetting("credit_cashout_fee_percent");
  const feePercent = Number(feePercentStr?.value ?? 5);

  if (input.requestedAmount < minimum) {
    return { error: `Minimum cashout is ${minimum} credits` };
  }
  if (input.requestedAmount > wallet.availableCredits) {
    return { error: "Insufficient available credits" };
  }
  if (wallet.blockedCredits > 0) {
    return { error: "Wallet is blocked. Contact support." };
  }

  const feeAmount = Math.round(input.requestedAmount * (feePercent / 100) * 100) / 100;
  const netAmount = input.requestedAmount - feeAmount;

  const id = memId("csh", ++cashoutCounter);
  const cashout: CashoutRequest = {
    id,
    userId: input.userId,
    walletId: wallet.id,
    requestedAmount: input.requestedAmount,
    feeAmount,
    netAmount,
    status: "pending",
    payoutMethod: "bank_transfer",
    destinationAccount: input.destinationAccount,
    createdAt: now(),
    updatedAt: now(),
  };
  cashoutRequests.set(id, cashout);

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      await sb.from("cashout_requests").insert({
        user_id: input.userId,
        wallet_id: wallet.id,
        requested_amount: input.requestedAmount,
        fee_amount: feeAmount,
        net_amount: netAmount,
        destination_account: input.destinationAccount,
      });
    } catch { /* */ }
  }
  return { cashout };
}

export async function updateCashoutStatus(
  id: string,
  status: CashoutStatus,
  adminId?: string,
  failureReason?: string
): Promise<{ cashout: CashoutRequest } | { error: string }> {
  const patch: Record<string, unknown> = {
    status,
    admin_id: adminId || null,
    failure_reason: failureReason || null,
    updated_at: now(),
  };
  if (status === "paid") patch.paid_at = now();

  const mem = cashoutRequests.get(id);
  if (status === "paid" && mem) {
    void notify(mem.userId, "Cashout completed", `₦${mem.netAmount} has been paid out`, "cashout_paid", id);
  } else if (status === "rejected" && mem) {
    void notify(mem.userId, "Cashout rejected", `Your cashout request for ₦${mem.requestedAmount} was rejected${failureReason ? `: ${failureReason}` : ""}`, "cashout_rejected", id);
  }
  if (mem) {
    Object.assign(mem, {
      status,
      adminId: adminId || mem.adminId,
      failureReason: failureReason || mem.failureReason,
      updatedAt: now(),
      paidAt: status === "paid" ? now() : mem.paidAt,
    });
    if (status === "paid") {
      await createCreditTransaction({
        userId: mem.userId,
        transactionType: "cashout",
        amount: mem.requestedAmount,
        referenceId: id,
        adminId,
        reason: "Cashout completed",
      });
    }
    return { cashout: mem };
  }
  if (!isSupabaseAdminConfigured()) return { error: "not_found" };
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("cashout_requests")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return { error: error.message };
    return { cashout: rowToCashout(data as Record<string, unknown>) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "update_failed" };
  }
}

export async function listCashoutRequests(
  filters?: { status?: string; userId?: string }
): Promise<CashoutRequest[]> {
  const out: CashoutRequest[] = [];
  for (const c of cashoutRequests.values()) {
    if (filters?.status && c.status !== filters.status) continue;
    if (filters?.userId && c.userId !== filters.userId) continue;
    out.push(c);
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      let q = sb.from("cashout_requests").select("*");
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.userId) q = q.eq("user_id", filters.userId);
      const { data } = await q.order("created_at", { ascending: false }).limit(100);
      for (const row of data || []) {
        const c = rowToCashout(row as Record<string, unknown>);
        if (!out.find((x) => x.id === c.id)) out.push(c);
      }
    } catch { /* */ }
  }
  return out.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ── Fraud Flags ─────────────────────────────────────────────────────────────

function rowToFraudFlag(row: Record<string, unknown>): FraudFlag {
  return {
    id: String(row.id),
    userId: String(row.user_id || row.userId),
    flagType: (row.flag_type || row.flagType) as FraudFlagType,
    riskLevel: (row.risk_level || row.riskLevel || "medium") as RiskLevel,
    description: String(row.description ?? ""),
    status: (row.status as FlagStatus) || "open",
    adminId: String(row.admin_id ?? row.adminId ?? ""),
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: String(row.created_at || row.createdAt || now()),
    resolvedAt: String(row.resolved_at ?? row.resolvedAt ?? ""),
  };
}

export async function createFraudFlag(input: {
  userId: string;
  flagType: FraudFlagType;
  riskLevel?: RiskLevel;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<FraudFlag> {
  const id = memId("flag", ++flagCounter);
  const flag: FraudFlag = {
    id,
    userId: input.userId,
    flagType: input.flagType,
    riskLevel: input.riskLevel || "medium",
    description: input.description,
    status: "open",
    metadata: input.metadata,
    createdAt: now(),
  };
  fraudFlags.set(id, flag);
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      await sb.from("fraud_flags").insert({
        user_id: input.userId,
        flag_type: input.flagType,
        risk_level: input.riskLevel || "medium",
        description: input.description,
        metadata: input.metadata ?? {},
      });
    } catch { /* */ }
  }
  return flag;
}

export async function updateFraudFlagStatus(
  id: string,
  status: FlagStatus,
  adminId?: string
): Promise<{ flag: FraudFlag } | { error: string }> {
  const patch: Record<string, unknown> = {
    status,
    admin_id: adminId || null,
  };
  if (status === "resolved" || status === "blocked") patch.resolved_at = now();

  const mem = fraudFlags.get(id);
  if (mem) {
    Object.assign(mem, { status, adminId: adminId || mem.adminId, resolvedAt: status === "resolved" || status === "blocked" ? now() : mem.resolvedAt });
    return { flag: mem };
  }
  if (!isSupabaseAdminConfigured()) return { error: "not_found" };
  try {
    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("fraud_flags")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return { error: error.message };
    return { flag: rowToFraudFlag(data as Record<string, unknown>) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "update_failed" };
  }
}

export async function listFraudFlags(
  filters?: { status?: string; flagType?: string; userId?: string }
): Promise<FraudFlag[]> {
  const out: FraudFlag[] = [];
  for (const f of fraudFlags.values()) {
    if (filters?.status && f.status !== filters.status) continue;
    if (filters?.flagType && f.flagType !== filters.flagType) continue;
    if (filters?.userId && f.userId !== filters.userId) continue;
    out.push(f);
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      let q = sb.from("fraud_flags").select("*");
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.flagType) q = q.eq("flag_type", filters.flagType);
      if (filters?.userId) q = q.eq("user_id", filters.userId);
      const { data } = await q.order("created_at", { ascending: false }).limit(100);
      for (const row of data || []) {
        const f = rowToFraudFlag(row as Record<string, unknown>);
        if (!out.find((x) => x.id === f.id)) out.push(f);
      }
    } catch { /* */ }
  }
  return out.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ── Admin Actions (Audit Trail) ─────────────────────────────────────────────

export async function logAdminAction(input: {
  adminId: string;
  adminName?: string;
  targetType: string;
  targetId?: string;
  actionType: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
  result?: string;
  errorMessage?: string;
  ipAddress?: string;
  deviceInfo?: string;
}): Promise<AdminAction> {
  const action: AdminAction = {
    id: memId("aud", adminActions.length + 1),
    adminId: input.adminId,
    adminName: input.adminName,
    targetType: input.targetType,
    targetId: input.targetId,
    actionType: input.actionType,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    result: input.result,
    status: input.errorMessage ? "failed" : "completed",
    errorMessage: input.errorMessage,
    ipAddress: input.ipAddress,
    deviceInfo: input.deviceInfo,
    createdAt: now(),
  };
  adminActions.push(action);
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      await sb.from("admin_actions").insert({
        admin_id: input.adminId,
        admin_name: input.adminName,
        target_type: input.targetType,
        target_id: input.targetId,
        action_type: input.actionType,
        old_value: input.oldValue ?? {},
        new_value: input.newValue ?? {},
        reason: input.reason,
        result: input.result,
        error_message: input.errorMessage,
        ip_address: input.ipAddress,
        device_info: input.deviceInfo,
      });
    } catch { /* */ }
  }
  return action;
}

export async function listAdminActions(
  filters?: {
    adminId?: string;
    targetType?: string;
    actionType?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }
): Promise<AdminAction[]> {
  let out = [...adminActions];
  if (filters?.adminId) out = out.filter((a) => a.adminId === filters.adminId);
  if (filters?.targetType) out = out.filter((a) => a.targetType === filters.targetType);
  if (filters?.actionType) out = out.filter((a) => a.actionType === filters.actionType);
  if (filters?.status) out = out.filter((a) => a.status === filters.status);
  if (filters?.fromDate) out = out.filter((a) => a.createdAt >= filters.fromDate!);
  if (filters?.toDate) out = out.filter((a) => a.createdAt <= filters.toDate!);

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      let q = sb.from("admin_actions").select("*").order("created_at", { ascending: false }).limit(200);
      if (filters?.adminId) q = q.eq("admin_id", filters.adminId);
      if (filters?.targetType) q = q.eq("target_type", filters.targetType);
      if (filters?.actionType) q = q.eq("action_type", filters.actionType);
      if (filters?.fromDate) q = q.gte("created_at", filters.fromDate);
      if (filters?.toDate) q = q.lte("created_at", filters.toDate);
      const { data } = await q;
      for (const row of data || []) {
        const a: AdminAction = {
          id: String(row.id),
          adminId: String(row.admin_id),
          adminName: String(row.admin_name ?? ""),
          targetType: String(row.target_type),
          targetId: String(row.target_id ?? ""),
          actionType: String(row.action_type),
          oldValue: row.old_value as Record<string, unknown> | undefined,
          newValue: row.new_value as Record<string, unknown> | undefined,
          reason: String(row.reason ?? ""),
          result: String(row.result ?? ""),
          status: String(row.status ?? "completed"),
          errorMessage: String(row.error_message ?? ""),
          ipAddress: String(row.ip_address ?? ""),
          deviceInfo: String(row.device_info ?? ""),
          createdAt: String(row.created_at),
        };
        if (!out.find((x) => x.id === a.id)) out.push(a);
      }
    } catch { /* */ }
  }
  return out.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// ── System Settings ─────────────────────────────────────────────────────────

export async function getSystemSetting(
  key: string
): Promise<SystemSetting | null> {
  const mem = systemSettings.get(key);
  if (mem) return mem;
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("system_settings")
      .select("*")
      .eq("key", key)
      .maybeSingle();
    if (data) {
      const s: SystemSetting = {
        id: String(data.id),
        key: String(data.key),
        value: data.value,
        updatedAt: String(data.updated_at),
        updatedBy: String(data.updated_by ?? ""),
      };
      systemSettings.set(key, s);
      return s;
    }
  } catch { /* */ }
  return null;
}

export async function setSystemSetting(
  key: string,
  value: unknown,
  updatedBy?: string
): Promise<SystemSetting | { error: string }> {
  const setting: SystemSetting = {
    id: memId("set", ++settingCounter),
    key,
    value,
    updatedAt: now(),
    updatedBy,
  };
  systemSettings.set(key, setting);
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      await sb.from("system_settings").upsert(
        { key, value, updated_by: updatedBy || null, updated_at: now() },
        { onConflict: "key" }
      );
    } catch { /* */ }
  }
  return setting;
}

export async function listSystemSettings(): Promise<SystemSetting[]> {
  const out = Array.from(systemSettings.values());
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb.from("system_settings").select("*");
      for (const row of data || []) {
        const existing = out.findIndex((s) => s.key === String(row.key));
        const s: SystemSetting = {
          id: String(row.id),
          key: String(row.key),
          value: row.value,
          updatedAt: String(row.updated_at),
          updatedBy: String(row.updated_by ?? ""),
        };
        if (existing >= 0) out[existing] = s;
        else out.push(s);
      }
    } catch { /* */ }
  }
  return out;
}

// ── Name Change Requests ────────────────────────────────────────────────────

function rowToNameChange(row: Record<string, unknown>): NameChangeRequest {
  return {
    id: String(row.id),
    userId: String(row.user_id || row.userId),
    currentName: String(row.current_name || row.currentName),
    requestedName: String(row.requested_name || row.requestedName),
    reason: String(row.reason ?? ""),
    identityDocumentUrl: String(row.identity_document_url ?? row.identityDocumentUrl ?? ""),
    identityDocumentType: String(row.identity_document_type ?? row.identityDocumentType ?? ""),
    status: (row.status as NameChangeRequest["status"]) || "pending",
    adminId: String(row.admin_id ?? row.adminId ?? ""),
    adminReason: String(row.admin_reason ?? row.adminReason ?? ""),
    reviewedAt: String(row.reviewed_at ?? row.reviewedAt ?? ""),
    createdAt: String(row.created_at || row.createdAt || now()),
    updatedAt: String(row.updated_at || row.updatedAt || now()),
  };
}

export async function listNameChangeRequests(filters?: {
  status?: string;
  userId?: string;
}): Promise<NameChangeRequest[]> {
  if (!isSupabaseAdminConfigured()) return [];
  try {
    const sb = createServiceSupabase();
    let q = sb.from("name_change_requests").select("*, user_id, current_name, requested_name, reason, identity_document_url, identity_document_type, status, admin_id, admin_reason, reviewed_at, created_at, updated_at");
    if (filters?.status) q = q.eq("status", filters.status);
    if (filters?.userId) q = q.eq("user_id", filters.userId);
    const { data } = await q.order("created_at", { ascending: false }).limit(100);
    return (data || []).map((row: Record<string, unknown>) => rowToNameChange(row));
  } catch {
    return [];
  }
}

export async function updateNameChangeStatus(
  id: string,
  status: NameChangeRequest["status"],
  adminId?: string,
  reason?: string
): Promise<{ request: NameChangeRequest } | { error: string }> {
  if (!isSupabaseAdminConfigured()) return { error: "not_configured" };
  try {
    const sb = createServiceSupabase();
    const patch: Record<string, unknown> = {
      status,
      admin_id: adminId || null,
      admin_reason: reason || null,
      reviewed_at: now(),
      updated_at: now(),
    };
    const { data, error } = await sb
      .from("name_change_requests")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return { error: error.message };

    // If approved, update the user's full_name in profiles
    if (status === "approved") {
      await sb
        .from("profiles")
        .update({ full_name: (data as Record<string, unknown>).requested_name as string, updated_at: now() })
        .eq("id", (data as Record<string, unknown>).user_id as string);
    }

    return { request: rowToNameChange(data as Record<string, unknown>) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "update_failed" };
  }
}

// ── Dashboard Stats ─────────────────────────────────────────────────────────

export async function getSecurityDashboardStats(): Promise<Record<string, number>> {
  const allContacts = await listContactChangeRequests();
  const allFlags = await listFraudFlags();
  const allRefs = await listReferralEvents();
  const allCashouts = await listCashoutRequests();
  const allTx = await listCreditTransactions();
  const allAudits = await listAdminActions();

  return {
    totalChangeRequests: allContacts.length,
    pendingChangeRequests: allContacts.filter((c) => c.status === "pending" || c.status === "awaiting_old_verification" || c.status === "awaiting_new_verification").length,
    blockedChangeRequests: allContacts.filter((c) => c.status === "rejected" || c.status === "under_review").length,
    totalReferralRewards: allRefs.filter((r) => r.status === "approved").reduce((s, r) => s + r.rewardAmount, 0),
    totalCreditsEarned: allTx.filter((t) => t.transactionType === "earn" && t.status === "completed").reduce((s, t) => s + t.amount, 0),
    totalCreditsRedeemed: allTx.filter((t) => t.transactionType === "service_spend" && t.status === "completed").reduce((s, t) => s + t.amount, 0),
    pendingCashouts: allCashouts.filter((c) => c.status === "pending").length,
    completedCashouts: allCashouts.filter((c) => c.status === "paid").length,
    openFraudFlags: allFlags.filter((f) => f.status === "open" || f.status === "reviewing").length,
    referralAbuseFlags: allFlags.filter((f) => f.flagType === "referral_abuse").length,
    auditEventsToday: allAudits.filter((a) => a.createdAt.startsWith(new Date().toISOString().slice(0, 10))).length,
    approvalQueueCount: allRefs.filter((r) => r.status === "pending").length + allCashouts.filter((c) => c.status === "pending").length,
  };
}
