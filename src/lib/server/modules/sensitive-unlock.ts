/**
 * Temporary unlock for sensitive Customer Care actions.
 * Password 336699 (or ADMIN_SENSITIVE_PASSWORD) grants a short-lived unlock cookie.
 */

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import {
  SENSITIVE_UNLOCK_COOKIE,
  SENSITIVE_UNLOCK_TTL_MS,
  isSensitivePasswordValid,
} from "./security";

export type UnlockPayload = {
  adminId: string;
  exp: number;
  sig: string;
};

function signingSecret(): string {
  return (
    process.env.ADMIN_UNLOCK_SIGNING_SECRET ||
    process.env.ADMIN_FIELD_ENCRYPTION_KEY ||
    process.env.ADMIN_SENSITIVE_PASSWORD ||
    "336699-ogamecho-unlock"
  );
}

function sign(adminId: string, exp: number): string {
  return createHmac("sha256", signingSecret())
    .update(`${adminId}:${exp}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function createUnlockToken(adminId: string): string {
  const exp = Date.now() + SENSITIVE_UNLOCK_TTL_MS;
  const sig = sign(adminId, exp);
  return Buffer.from(JSON.stringify({ adminId, exp, sig }), "utf8").toString(
    "base64url"
  );
}

export function parseUnlockToken(raw: string | undefined | null): UnlockPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as UnlockPayload;
    if (!parsed?.adminId || !parsed?.exp || !parsed?.sig) return null;
    if (Date.now() > parsed.exp) return null;
    const expect = sign(parsed.adminId, parsed.exp);
    if (!safeEqual(expect, parsed.sig)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readUnlockFromCookies(
  adminId: string
): Promise<{ unlocked: boolean; expiresAt: number | null }> {
  const jar = await cookies();
  const raw = jar.get(SENSITIVE_UNLOCK_COOKIE)?.value;
  const parsed = parseUnlockToken(raw);
  if (!parsed || parsed.adminId !== adminId) {
    return { unlocked: false, expiresAt: null };
  }
  return { unlocked: true, expiresAt: parsed.exp };
}

export async function setUnlockCookie(adminId: string): Promise<number> {
  const token = createUnlockToken(adminId);
  const exp = Date.now() + SENSITIVE_UNLOCK_TTL_MS;
  const jar = await cookies();
  jar.set(SENSITIVE_UNLOCK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SENSITIVE_UNLOCK_TTL_MS / 1000),
  });
  return exp;
}

export async function clearUnlockCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SENSITIVE_UNLOCK_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function verifyPasswordAndCreateToken(
  password: string,
  adminId: string
): { ok: true; token: string; exp: number } | { ok: false } {
  if (!isSensitivePasswordValid(password)) return { ok: false };
  const token = createUnlockToken(adminId);
  const exp = Date.now() + SENSITIVE_UNLOCK_TTL_MS;
  return { ok: true, token, exp };
}
