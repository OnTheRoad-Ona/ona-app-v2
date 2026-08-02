/**
 * Artisan verification helpers — real OTP + ID checks + status labels.
 * NIN/BVN hit /api/verify/* (Prembly when keys set, format sandbox otherwise).
 */

import {
  DEMO_OTP_CODE,
  isDemoOtp,
  isDemoOtpAllowed,
} from "@/lib/auth/demo-otp";
import { verifyBvnApi, verifyNinApi } from "@/lib/ng-id-verify-client";

export type VerifyStatus =
  | "idle"
  | "pending"
  | "checking"
  | "verified"
  | "failed";

export type OtpSession = {
  phone: string;
  /** hashed or plain for demo storage — never log in production */
  code: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
};

const OTP_KEY = "ona-artisan-otp-v2";
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
/** Resend cooldown only after this many failed verifies */
const OTP_FAILS_BEFORE_COOLDOWN = 4;
const OTP_RESEND_MS = 45_000;

function digits(v: string): string {
  return v.replace(/\D/g, "");
}

function normalizePhoneKey(phone: string): string {
  const d = digits(phone);
  if (d.startsWith("234") && d.length >= 13) return d.slice(-10);
  if (d.startsWith("0") && d.length === 11) return d.slice(1);
  return d.slice(-10);
}

export function verifyStatusLabel(s: VerifyStatus): string {
  switch (s) {
    case "idle":
      return "Not started";
    case "pending":
      return "Waiting";
    case "checking":
      return "Checking…";
    case "verified":
      return "Verified";
    case "failed":
      return "Failed";
    default:
      return s;
  }
}

export function readOtpSession(): OtpSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OTP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OtpSession;
  } catch {
    return null;
  }
}

function writeOtpSession(s: OtpSession | null) {
  try {
    if (!s) localStorage.removeItem(OTP_KEY);
    else localStorage.setItem(OTP_KEY, JSON.stringify(s));
  } catch {
    /* */
  }
}

/** Create a real 6-digit OTP (not a fixed demo code). */
export function createOtpCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

/**
 * Send OTP for artisan phone verification.
 * Returns the code in `demoCode` so you can complete the flow without SMS keys.
 * In production, wire Africa's Talking and stop returning the code to the client.
 */
export function sendArtisanOtp(phone: string): {
  ok: true;
  demoCode: string;
  expiresInSec: number;
  resendInSec: number;
} | { ok: false; error: string; waitSec?: number } {
  const p = phone.trim();
  if (digits(p).length < 10) {
    return { ok: false, error: "Enter a valid phone number first." };
  }
  const existing = readOtpSession();
  if (existing && existing.phone === normalizePhoneKey(p)) {
    const age = Date.now() - existing.sentAt;
    // Cooldown only after 4 failed attempts (not on every resend)
    if (
      existing.attempts >= OTP_FAILS_BEFORE_COOLDOWN &&
      age < OTP_RESEND_MS
    ) {
      const wait = Math.ceil((OTP_RESEND_MS - age) / 1000);
      return {
        ok: false,
        error: `Please wait ${wait}s before requesting another code.`,
        waitSec: wait,
      };
    }
  }
  // When demo OTP is allowed, store 336699 so Send → Verify works without SMS.
  const code = isDemoOtpAllowed() ? DEMO_OTP_CODE : createOtpCode();
  const now = Date.now();
  writeOtpSession({
    phone: normalizePhoneKey(p),
    code,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    sentAt: now,
  });
  return {
    ok: true,
    demoCode: code,
    expiresInSec: Math.floor(OTP_TTL_MS / 1000),
    resendInSec: Math.floor(OTP_RESEND_MS / 1000),
  };
}

export function verifyArtisanOtp(
  phone: string,
  code: string
): { ok: true } | { ok: false; error: string } {
  const entered = code.replace(/\D/g, "").trim();
  /**
   * Demo 336699: always pass when allowed (local or NEXT_PUBLIC_OTP_DEMO_MODE),
   * even if Send stored a random code, session missing, or phone key mismatch.
   * Send OTP still required only for non-demo codes.
   */
  if (isDemoOtp(entered) && isDemoOtpAllowed()) {
    writeOtpSession(null);
    return { ok: true };
  }
  const session = readOtpSession();
  if (!session) {
    return {
      ok: false,
      error: isDemoOtpAllowed()
        ? `No code sent. Tap Send OTP, then enter ${DEMO_OTP_CODE} (demo).`
        : "No code sent. Tap Send OTP first.",
    };
  }
  if (session.phone !== normalizePhoneKey(phone)) {
    return { ok: false, error: "Phone does not match the number that received the code." };
  }
  if (Date.now() > session.expiresAt) {
    writeOtpSession(null);
    return { ok: false, error: "Code expired. Send a new OTP." };
  }
  if (session.attempts >= OTP_MAX_ATTEMPTS) {
    writeOtpSession(null);
    return { ok: false, error: "Too many attempts. Send a new OTP." };
  }
  // Also accept session code === demo when allowed (belt + suspenders)
  if (
    entered === session.code ||
    (isDemoOtpAllowed() && session.code === DEMO_OTP_CODE && isDemoOtp(entered))
  ) {
    writeOtpSession(null);
    return { ok: true };
  }
  session.attempts += 1;
  writeOtpSession(session);
  const left = OTP_MAX_ATTEMPTS - session.attempts;
  return {
    ok: false,
    error:
      left > 0
        ? isDemoOtpAllowed()
          ? `Wrong code. Use demo ${DEMO_OTP_CODE}, or ${left} attempt${left === 1 ? "" : "s"} left.`
          : `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "Too many attempts. Send a new OTP.",
  };
}

export type IdVerifyOutcome = {
  ok: boolean;
  message: string;
  provider?: string;
  mode?: string;
  fullName?: string;
  reference?: string;
};

/** Real NIN check via /api/verify/nin */
export async function runNinVerification(nin: string): Promise<IdVerifyOutcome> {
  const d = digits(nin);
  if (d.length !== 11) {
    return { ok: false, message: "NIN must be exactly 11 digits." };
  }
  const r = await verifyNinApi(d);
  if (!r.ok) {
    return {
      ok: false,
      message: r.message || "NIN verification failed.",
      provider: r.provider,
      mode: r.mode,
    };
  }
  const modeNote =
    r.mode === "sandbox_format"
      ? " (format check — add PREMBLY_API_KEY for live NIMC)"
      : " via Prembly";
  return {
    ok: true,
    message: r.fullName
      ? `NIN verified${modeNote}: ${r.fullName}`
      : `NIN verified${modeNote}.`,
    provider: r.provider,
    mode: r.mode,
    fullName: r.fullName,
    reference: r.reference,
  };
}

/** Real BVN check via /api/verify/bvn */
export async function runBvnVerification(bvn: string): Promise<IdVerifyOutcome> {
  const d = digits(bvn);
  if (d.length !== 11) {
    return { ok: false, message: "BVN must be exactly 11 digits." };
  }
  const r = await verifyBvnApi(d);
  if (!r.ok) {
    return {
      ok: false,
      message: r.message || "BVN verification failed.",
      provider: r.provider,
      mode: r.mode,
    };
  }
  const modeNote =
    r.mode === "sandbox_format"
      ? " (format check — add PREMBLY_API_KEY for live NIBSS)"
      : " via Prembly";
  return {
    ok: true,
    message: r.fullName
      ? `BVN verified${modeNote}: ${r.fullName}`
      : `BVN verified${modeNote}.`,
    provider: r.provider,
    mode: r.mode,
    fullName: r.fullName,
    reference: r.reference,
  };
}
