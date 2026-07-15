import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { insertHealthLog } from "@/lib/server/health-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/log-error
 * Accepts client/map/API errors for the ops dashboard.
 * INTEGRATION: call from error boundaries, map onError, API catch blocks.
 *
 * Body: { type, severity?, message, source?, metadata? }
 */
const bodySchema = z.object({
  type: z.enum([
    "Auth Error",
    "Database Storage Low",
    "Map Error",
    "API Error",
    "Frontend Error",
    "Performance Warning",
    "Connection Issue",
  ]),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  message: z.string().min(1).max(2000),
  source: z
    .enum(["frontend", "backend", "database", "maps", "auth", "system"])
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiFail("Invalid error payload", 400, "validation");
  }

  const result = await insertHealthLog({
    type: parsed.data.type,
    severity: parsed.data.severity,
    message: parsed.data.message,
    source: parsed.data.source || "frontend",
    metadata: {
      ...(parsed.data.metadata || {}),
      userAgent:
        typeof req.headers.get === "function"
          ? req.headers.get("user-agent")
          : null,
    },
  });

  if (!result.ok) {
    return apiFail(result.error, 500);
  }

  return apiOk({ id: result.id, logged: true });
}
