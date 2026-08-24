import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { isExpressTrade } from "@/lib/express/pricing";
import { computeExpressQuote } from "@/lib/server/express/quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  trade: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  urgency: z.string().optional(),
});

/** Express price preview: base fee (₦20k/₦15k) + ₦350/km road-route call-out. */
export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success || !isExpressTrade(parsed.data.trade)) {
      return apiFail("Invalid express quote request", 400, "validation");
    }
    const { trade, lat, lng } = parsed.data;
    const quote = await computeExpressQuote(trade, lat, lng, parsed.data.urgency ?? "normal");
    return apiOk(quote);
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Quote failed", 500);
  }
}
