/**
 * Ona production backend modules (modular monolith)
 * ─────────────────────────────────────────────────
 * Auth · Users · Pros · Bookings · Escrow · Disputes · Verification
 * Messaging · Notifications · Support · Admin/Care · Security · Settings
 *
 * Import from here for a stable public surface; keep domain logic inside each module.
 * Phase A: foundation exports. Phase B wires routes fully to DB.
 */

export * from "./security";
export * from "./admin-roles";
export * from "./rbac-service";
export * from "./audit";
export * from "./platform-audit";
export * from "./sensitive-unlock";
export * from "./rate-limit";
export * from "./crypto-fields";
export * from "./care-service";
export * from "./settings/platform-settings";
export * from "./support/tickets";
export * from "./pros/pipeline";
