import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  requireAdmin,
  requireSensitiveAction,
  AdminAuthError,
} from "@/lib/server/admin-auth";
import {
  listContactChangeRequests,
  updateContactChangeStatus,
  listReferralEvents,
  updateReferralEvent,
  listCreditTransactions,
  listCashoutRequests,
  updateCashoutStatus,
  listFraudFlags,
  updateFraudFlagStatus,
  getOrCreateWallet,
  logAdminAction,
  listAdminActions,
  getSecurityDashboardStats,
  setSystemSetting,
  listSystemSettings,
  createCreditTransaction,
  listNameChangeRequests,
  updateNameChangeStatus,
} from "@/lib/server/security/security-store";
import {
  attemptCashoutTransfer,
  forceFailCashout,
  processDueCashoutRetries,
  verifyPendingCashouts,
} from "@/lib/server/security/cashout-engine";
import type {
  CashoutStatus,
  ContactRequestStatus,
  FlagStatus,
  ReferralEventStatus,
} from "@/lib/security/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminId(): string {
  // Called inside try/catch that catches AdminAuthError
  return "";
}

async function auth() {
  try {
    return await requireAdmin();
  } catch (err) {
    if (err instanceof AdminAuthError) return null;
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const admin = await auth();
    if (!admin) return apiFail("Admin auth required", 401);
    const { searchParams } = new URL(req.url);
    const section = searchParams.get("section") || "overview";
    const adminId = admin.session.userId;
    const adminName = admin.profile.full_name || "";

    switch (section) {
      case "overview": {
        const stats = await getSecurityDashboardStats();
        return apiOk({ stats });
      }
      case "name-changes": {
        const status = searchParams.get("status") || undefined;
        const requests = await listNameChangeRequests({ status });
        return apiOk({ requests });
      }
      case "contact-changes": {
        const status = searchParams.get("status") || undefined;
        const requests = await listContactChangeRequests({ status });
        return apiOk({ requests });
      }
      case "referrals": {
        const status = searchParams.get("status") || undefined;
        const events = await listReferralEvents({ status });
        return apiOk({ events });
      }
      case "credits": {
        const userId = searchParams.get("userId") || undefined;
        const txs = await listCreditTransactions(userId);
        return apiOk({ transactions: txs });
      }
      case "cashouts": {
        const status = searchParams.get("status") || undefined;
        const requests = await listCashoutRequests({ status });
        return apiOk({ requests });
      }
      case "fraud": {
        const status = searchParams.get("status") || "open";
        const flags = await listFraudFlags({ status });
        return apiOk({ flags });
      }
      case "audit": {
        const filters: Record<string, string> = {};
        const adminIdFilter = searchParams.get("adminId");
        const targetType = searchParams.get("targetType");
        const actionType = searchParams.get("actionType");
        if (adminIdFilter) filters.adminId = adminIdFilter;
        if (targetType) filters.targetType = targetType;
        if (actionType) filters.actionType = actionType;
        const actions = await listAdminActions(filters);
        return apiOk({ actions });
      }
      case "settings": {
        const settings = await listSystemSettings();
        return apiOk({ settings });
      }
      default:
        return apiFail("Unknown section", 400);
    }
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await auth();
    if (!admin) return apiFail("Admin auth required", 401);
    const body = await req.json();
    const { action } = body;
    const adminId = admin.session.userId;
    const adminName = admin.profile.full_name || "";

    switch (action) {
      // Contact change actions
      case "approve-contact-change":
      case "reject-contact-change":
      case "hold-contact-change":
      case "reverse-contact-change": {
        const { id, reason } = body;
        if (!id) return apiFail("Missing id", 400);
        const statusMap: Record<string, ContactRequestStatus> = {
          "approve-contact-change": "approved",
          "reject-contact-change": "rejected",
          "hold-contact-change": "under_review",
          "reverse-contact-change": "reversed",
        };
        const result = await updateContactChangeStatus(
          id,
          statusMap[action],
          adminId,
          reason,
        );
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({
          adminId,
          adminName,
          targetType: "contact_change",
          targetId: id,
          actionType: action,
          reason,
        });
        return apiOk({ request: result.request });
      }

      // Name change actions
      case "approve-name-change":
      case "reject-name-change":
      case "review-name-change": {
        const { id, reason } = body;
        if (!id) return apiFail("Missing id", 400);
        const statusMap: Record<
          string,
          "approved" | "rejected" | "under_review"
        > = {
          "approve-name-change": "approved",
          "reject-name-change": "rejected",
          "review-name-change": "under_review",
        };
        const result = await updateNameChangeStatus(
          id,
          statusMap[action],
          adminId,
          reason,
        );
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({
          adminId,
          adminName,
          targetType: "name_change",
          targetId: id,
          actionType: action,
          reason,
        });
        return apiOk({ request: result.request });
      }

      // Referral actions
      case "approve-referral":
      case "reject-referral":
      case "reverse-referral": {
        const { id, reason, rewardAmount } = body;
        if (!id) return apiFail("Missing id", 400);
        const statusMap: Record<string, ReferralEventStatus> = {
          "approve-referral": "approved",
          "reject-referral": "rejected",
          "reverse-referral": "reversed",
        };
        const result = await updateReferralEvent(
          id,
          statusMap[action],
          adminId,
          reason,
          rewardAmount,
        );
        if ("error" in result) return apiFail(result.error, 400);
        if (action === "approve-referral" && rewardAmount) {
          await createCreditTransaction({
            userId: result.event.referrerUserId,
            transactionType: "earn",
            amount: rewardAmount,
            referenceType: "referral",
            referenceId: id,
            adminId,
            reason: reason || "Referral reward",
          });
        }
        await logAdminAction({
          adminId,
          adminName,
          targetType: "referral",
          targetId: id,
          actionType: action,
          reason,
        });
        return apiOk({ event: result.event });
      }

      // Cashout actions
      case "approve-cashout":
      case "reject-cashout":
      case "pay-cashout":
      case "fail-cashout": {
        const { id, reason } = body;
        if (!id) return apiFail("Missing id", 400);
        // Manual money movement needs temporary unlock (same as escrow release)
        if (action === "pay-cashout" || action === "fail-cashout") {
          try {
            await requireSensitiveAction("escrow_release", req);
          } catch (e) {
            return apiFail(
              e instanceof Error ? e.message : "Sensitive action required",
              403,
            );
          }
        }
        const statusMap: Record<string, CashoutStatus> = {
          "approve-cashout": "approved",
          "reject-cashout": "rejected",
          "pay-cashout": "paid",
          "fail-cashout": "failed",
        };
        const result = await updateCashoutStatus(
          id,
          statusMap[action],
          adminId,
          reason,
        );
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({
          adminId,
          adminName,
          targetType: "cashout",
          targetId: id,
          actionType: action,
          reason,
        });
        return apiOk({ cashout: result.cashout });
      }

      // Cashout engine: auto-transfer + retries
      case "transfer-cashout":
      case "retry-cashout": {
        const { id } = body;
        if (!id) return apiFail("Missing id", 400);
        const result = await attemptCashoutTransfer(id);
        await logAdminAction({
          adminId,
          adminName,
          targetType: "cashout",
          targetId: id,
          actionType: action,
          reason: body.reason,
          newValue: { status: result.status, message: result.message },
        });
        if (!result.ok) return apiFail(result.message || "Transfer failed", 400);
        return apiOk({ status: result.status });
      }
      case "force-fail-cashout": {
        const { id, reason } = body;
        if (!id) return apiFail("Missing id", 400);
        try {
          await requireSensitiveAction("escrow_release", req);
        } catch (e) {
          return apiFail(
            e instanceof Error ? e.message : "Sensitive action required",
            403,
          );
        }
        const result = await forceFailCashout(id, adminId, reason);
        if (!result.ok) return apiFail(result.message || "Failed", 400);
        await logAdminAction({
          adminId,
          adminName,
          targetType: "cashout",
          targetId: id,
          actionType: "force-fail-cashout",
          reason,
        });
        return apiOk({ status: "failed" });
      }
      case "verify-cashouts": {
        const result = await verifyPendingCashouts();
        const retries = await processDueCashoutRetries();
        return apiOk({ verified: result, retries });
      }

      // Fraud actions
      case "resolve-fraud":
      case "block-fraud": {
        const { id } = body;
        if (!id) return apiFail("Missing id", 400);
        const statusMap: Record<string, FlagStatus> = {
          "resolve-fraud": "resolved",
          "block-fraud": "blocked",
        };
        const result = await updateFraudFlagStatus(
          id,
          statusMap[action],
          adminId,
        );
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({
          adminId,
          adminName,
          targetType: "fraud_flag",
          targetId: id,
          actionType: action,
        });
        return apiOk({ flag: result.flag });
      }

      // Settings
      case "update-setting": {
        const { key, value } = body;
        if (!key) return apiFail("Missing key", 400);
        // Cashout money knobs are clamped, no arbitrary values
        if (key.startsWith("credit_cashout_")) {
          const n = Number(value);
          if (!Number.isFinite(n) || n < 0) {
            return apiFail("Value must be a positive number", 400);
          }
          if (key === "credit_cashout_fee_percent" && n > 50) {
            return apiFail("Fee percent cannot exceed 50", 400);
          }
          if (
            (key === "credit_cashout_max_per_day" ||
              key === "credit_cashout_min_account_age_days") &&
            n > 100
          ) {
            return apiFail("Value too large", 400);
          }
          const result0 = await setSystemSetting(key, String(n), adminId);
          if ("error" in result0) return apiFail(result0.error, 400);
          await logAdminAction({
            adminId,
            adminName,
            targetType: "system_settings",
            targetId: key,
            actionType: "update-setting",
            reason: `Updated ${key}=${n}`,
          });
          return apiOk({ setting: result0 });
        }
        const result = await setSystemSetting(key, value, adminId);
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({
          adminId,
          adminName,
          targetType: "system_settings",
          targetId: key,
          actionType: "update-setting",
          reason: `Updated ${key}=${JSON.stringify(value)}`,
        });
        return apiOk({ setting: result });
      }

      // Adjust wallet balance
      case "adjust-balance": {
        const { userId, amount, reason } = body;
        if (!userId || amount == null)
          return apiFail("Missing userId or amount", 400);
        const result = await createCreditTransaction({
          userId,
          transactionType: "adjust",
          amount,
          adminId,
          reason: reason || "Admin adjustment",
        });
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({
          adminId,
          adminName,
          targetType: "credit_wallet",
          targetId: userId,
          actionType: "adjust-balance",
          reason,
          newValue: { amount },
        });
        return apiOk({ wallet: result.wallet, tx: result.tx });
      }

      default:
        return apiFail(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
