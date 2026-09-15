"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";

export default function PaymentControlCenter() {
  const { adminName, adminRole, ready, api } = useAdminGate();

  return (
    <AdminShell>
      <AdminGuideBanner pageId="payments-control-center" />
      <div className="p-4">
        <h2 className="text-lg font-medium mb-4">Payment Control Center</h2>
        <p className="text-sm text-muted-foreground">
          Payment management dashboard. Use the admin API routes for payment operations.
        </p>
      </div>
    </AdminShell>
  );
}