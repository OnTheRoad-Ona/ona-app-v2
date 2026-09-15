import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  createContactChangeRequest,
  getContactChangeRequest,
  listContactChangeRequests,
  updateContactChangeStatus,
  verifyContactChangeCode,
} from "@/lib/server/security/contact-changes";
import { requireAdmin, AdminAuthError } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, changeType, oldValue, newValue, passwordConfirmed } = body;
    if (!userId || !changeType || !oldValue || !newValue) {
      return apiFail("Missing required fields", 400);
    }
    const result = await createContactChangeRequest({
      userId,
      changeType,
      oldValue,
      newValue,
      passwordConfirmed: !!passwordConfirmed,
      deviceInfo: { userAgent: req.headers.get("user-agent") || "" },
    });
    if ("error" in result) return apiFail(result.error, 400);
    return apiOk({ request: result.request });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");
    if (id) {
      const request = await getContactChangeRequest(id);
      if (!request) return apiFail("Not found", 404);
      return apiOk({ request });
    }
    const requests = await listContactChangeRequests({
      status: status || undefined,
      userId: userId || undefined,
    });
    return apiOk({ requests });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}

export async function PATCH(req: Request) {
  try {
    let admin;
    try {
      admin = await requireAdmin();
    } catch (err) {
      if (err instanceof AdminAuthError)
        return apiFail(err.message, err.status);
      return apiFail("Admin auth required", 401);
    }
    const body = await req.json();
    const { id, status, reason, action } = body;
    if (!id) return apiFail("Missing id", 400);
    if (action === "verify") {
      const { code, target } = body;
      if (!code || !target) return apiFail("Missing code or target", 400);
      const result = await verifyContactChangeCode(id, code, target);
      if ("error" in result) return apiFail(result.error, 400);
      return apiOk({ request: result.request });
    }
    if (!status) return apiFail("Missing status", 400);
    const result = await updateContactChangeStatus(
      id,
      status,
      admin.session.userId,
      reason,
    );
    if ("error" in result) return apiFail(result.error, 400);
    return apiOk({ request: result.request });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
