import { NextResponse } from "next/server";
import { verifyNinWithPrembly } from "@/lib/server/prembly";

export const runtime = "nodejs";

/**
 * POST /api/verify/nin
 * Body: { nin: string }
 * Verifies Nigeria NIN via Prembly when PREMBLY_API_KEY is set;
 * otherwise runs local 11-digit format validation for development.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { nin?: string };
    const nin = String(body.nin ?? "").trim();
    if (!nin) {
      return NextResponse.json(
        { ok: false, message: "NIN is required." },
        { status: 400 }
      );
    }
    const result = await verifyNinWithPrembly(nin);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch {
    return NextResponse.json(
      { ok: false, message: "NIN verification request failed." },
      { status: 500 }
    );
  }
}
