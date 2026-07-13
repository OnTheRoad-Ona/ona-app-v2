import { NextResponse } from "next/server";
import { verifyBvnWithPrembly } from "@/lib/server/prembly";

export const runtime = "nodejs";

/**
 * POST /api/verify/bvn
 * Body: { bvn: string }
 * Verifies Nigeria BVN via Prembly when PREMBLY_API_KEY is set;
 * otherwise runs local 11-digit format validation for development.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { bvn?: string };
    const bvn = String(body.bvn ?? "").trim();
    if (!bvn) {
      return NextResponse.json(
        { ok: false, message: "BVN is required." },
        { status: 400 }
      );
    }
    const result = await verifyBvnWithPrembly(bvn);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch {
    return NextResponse.json(
      { ok: false, message: "BVN verification request failed." },
      { status: 500 }
    );
  }
}
