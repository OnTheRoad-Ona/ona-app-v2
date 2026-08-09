/**
 * Identify demo/audit (synthetic) accounts so real customers are never paired
 * with them during search/dispatch. The seed + audit harness always use these
 * markers (scripts/synthetic-seed.mjs, scripts/audit-harness.mjs):
 * - email contains "synthetic.ona.audit" AND ends with "@ona-local.test"
 * - full_name starts with "SYN "
 * - business_name starts with "SYN "
 */
export function isSyntheticAccount(input: {
  email?: string | null;
  fullName?: string | null;
  businessName?: string | null;
}): boolean {
  const email = String(input.email || "").toLowerCase();
  if (
    email.includes("synthetic.ona.audit") &&
    email.endsWith("@ona-local.test")
  ) {
    return true;
  }
  if (String(input.fullName || "").startsWith("SYN ")) return true;
  if (String(input.businessName || "").startsWith("SYN ")) return true;
  return false;
}
