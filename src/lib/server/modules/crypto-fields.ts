/**
 * Field-level encryption helpers for NIN, BVN, bank details.
 * Uses AES-256-GCM with ADMIN_FIELD_ENCRYPTION_KEY (32-byte hex or base64)
 * or a derived key from SENSITIVE_ACTION_PASSWORD + salt in dev only.
 *
 * Production: set ADMIN_FIELD_ENCRYPTION_KEY in Vercel env.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const env = process.env.ADMIN_FIELD_ENCRYPTION_KEY?.trim();
  if (env) {
    if (/^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex");
    try {
      const b = Buffer.from(env, "base64");
      if (b.length === 32) return b;
    } catch {
      /* fall through */
    }
    return createHash("sha256").update(env).digest();
  }
  const salt = process.env.ADMIN_SENSITIVE_PASSWORD;
  if (!salt)
    throw new Error(
      "ADMIN_SENSITIVE_PASSWORD environment variable is required",
    );
  return createHash("sha256").update(`ogamecho-field-v1:${salt}`).digest();
}

/** Encrypt plaintext → `v1:<iv_b64>:<tag_b64>:<cipher_b64>` */
export function encryptField(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

/** Decrypt `v1:...` payload; returns null if invalid */
export function decryptField(
  payload: string | null | undefined,
): string | null {
  if (!payload || !payload.startsWith("v1:")) return null;
  try {
    const parts = payload.split(":");
    if (parts.length !== 4) return null;
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const data = Buffer.from(parts[3], "base64url");
    const key = getKey();
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}

/** Store only last 4 for display; full value encrypted if provided */
export function maskIdentity(value: string | null | undefined): string {
  if (!value) return "Not set";
  const d = value.replace(/\D/g, "");
  if (d.length < 4) return "••••";
  return `••••${d.slice(-4)}`;
}

export function isEncryptedPayload(v: string | null | undefined): boolean {
  return !!v && v.startsWith("v1:");
}
