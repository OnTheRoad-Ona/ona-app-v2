/**
 * Artisan verification profile (mock).
 * TODO(api): Persist to Supabase artisan_profiles + storage; auth via session.
 */

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  // Client uses localStorage via browser helpers; this route documents the contract.
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "userId required" },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    data: {
      source: "client_local_store",
      message:
        "Browser reads/writes ona-artisan-profiles-v1. Replace with Supabase.",
      userId,
    },
  });
}

export async function PATCH() {
  return NextResponse.json({
    ok: true,
    data: {
      source: "client_local_store",
      message: "PATCH body applied client-side until Supabase is wired.",
    },
  });
}
