import { NextResponse } from "next/server";

export function apiOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true as const, data }, init);
}

export function apiFail(
  message: string,
  status = 400,
  code = "error",
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { ok: false as const, error: { code, message, ...extra } },
    { status },
  );
}
