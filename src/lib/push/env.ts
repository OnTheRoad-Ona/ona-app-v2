/**
 * Web-push (VAPID) env helpers. The public key may reach the browser (needed
 * to subscribe); the private key and subject are server-only.
 */
export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY || "";
}

export function getVapidPrivateKey(): string {
  return process.env.VAPID_PRIVATE_KEY || "";
}

export function getVapidSubject(): string {
  return process.env.VAPID_SUBJECT || "mailto:oasis@ona.app";
}

export function isVapidConfigured(): boolean {
  return Boolean(getVapidPublicKey() && getVapidPrivateKey());
}
