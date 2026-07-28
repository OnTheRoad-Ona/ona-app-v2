import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireAdmin, AdminAuthError } from "@/lib/server/admin-auth";
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
} from "@/lib/server/security/security-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminId(): string {
  // Called inside try/catch that catches AdminAuthError
  return "";
}

async function auth() {
  try { return await requireAdmin(); } catch (err) {
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
        const statusMap: Record<string, string> = {
          "approve-contact-change": "approved",
          "reject-contact-change": "rejected",
          "hold-contact-change": "under_review",
          "reverse-contact-change": "reversed",
        };
        const result = await updateContactChangeStatus(id, statusMap[action] as any, adminId, reason);
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({ adminId, adminName, targetType: "contact_change", targetId: id, actionType: action, reason });
        return apiOk({ request: result.request });
      }

      // Referral actions
      case "approve-referral":
      case "reject-referral":
      case "reverse-referral": {
        const { id, reason, rewardAmount } = body;
        if (!id) return apiFail("Missing id", 400);
        const statusMap: Record<string, string> = {
          "approve-referral": "approved",
          "reject-referral": "rejected",
          "reverse-referral": "reversed",
        };
        const result = await updateReferralEvent(id, statusMap[action] as any, adminId, reason, rewardAmount);
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
        await logAdminAction({ adminId, adminName, targetType: "referral", targetId: id, actionType: action, reason });
        return apiOk({ event: result.event });
      }

      // Cashout actions
      case "approve-cashout":
      case "reject-cashout":
      case "pay-cashout":
      case "fail-cashout": {
        const { id, reason } = body;
        if (!id) return apiFail("Missing id", 400);
        const statusMap: Record<string, string> = {
          "approve-cashout": "approved",
          "reject-cashout": "rejected",
          "pay-cashout": "paid",
          "fail-cashout": "failed",
        };
        const result = await updateCashoutStatus(id, statusMap[action] as any, adminId, reason);
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({ adminId, adminName, targetType: "cashout", targetId: id, actionType: action, reason });
        return apiOk({ cashout: result.cashout });
      }

      // Fraud actions
      case "resolve-fraud":
      case "block-fraud": {
        const { id } = body;
        if (!id) return apiFail("Missing id", 400);
        const statusMap: Record<string, string> = {
          "resolve-fraud": "resolved",
          "block-fraud": "blocked",
        };
        const result = await updateFraudFlagStatus(id, statusMap[action] as any, adminId);
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({ adminId, adminName, targetType: "fraud_flag", targetId: id, actionType: action });
        return apiOk({ flag: result.flag });
      }

      // Settings
      case "update-setting": {
        const { key, value } = body;
        if (!key) return apiFail("Missing key", 400);
        const result = await setSystemSetting(key, value, adminId);
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({ adminId, adminName, targetType: "system_settings", targetId: key, actionType: "update-setting", reason: `Updated ${key}=${JSON.stringify(value)}` });
        return apiOk({ setting: result });
      }

      // Adjust wallet balance
      case "adjust-balance": {
        const { userId, amount, reason } = body;
        if (!userId || amount == null) return apiFail("Missing userId or amount", 400);
        const result = await createCreditTransaction({
          userId,
          transactionType: "adjust",
          amount,
          adminId,
          reason: reason || "Admin adjustment",
        });
        if ("error" in result) return apiFail(result.error, 400);
        await logAdminAction({ adminId, adminName, targetType: "credit_wallet", targetId: userId, actionType: "adjust-balance", reason, newValue: { amount } });
        return apiOk({ wallet: result.wallet, tx: result.tx });
      }

      default:
        return apiFail(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
