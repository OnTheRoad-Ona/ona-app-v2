"use client";

import { BankSetupGate } from "@/components/auth/bank-setup-gate";

/** Forced bank setup after Tier 1 also reachable from settings deep link */
export default function BankSetupPage() {
  return <BankSetupGate />;
}
