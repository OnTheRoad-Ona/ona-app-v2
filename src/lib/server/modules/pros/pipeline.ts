/**
 * Repair Pro pipeline — DB-backed states (Phase A columns; Phase B full wire).
 */

export type ProPipelineStatus =
  | "draft"
  | "submitted"
  | "pending_verification"
  | "pending_document_review"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "suspended"
  | "blocked"
  | "archived";

const ALLOWED: Record<ProPipelineStatus, ProPipelineStatus[]> = {
  draft: ["submitted", "archived"],
  submitted: ["pending_verification", "draft", "rejected"],
  pending_verification: ["pending_document_review", "rejected", "submitted"],
  pending_document_review: ["pending_approval", "rejected", "pending_verification"],
  pending_approval: ["approved", "rejected", "pending_document_review"],
  approved: ["suspended", "blocked", "pending_verification"],
  rejected: ["draft", "submitted"],
  suspended: ["approved", "blocked", "archived"],
  blocked: ["archived", "suspended"],
  archived: ["draft"],
};

export function canTransitionPipeline(
  from: ProPipelineStatus,
  to: ProPipelineStatus
): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function pipelineLabel(s: ProPipelineStatus): string {
  return s.replace(/_/g, " ");
}
