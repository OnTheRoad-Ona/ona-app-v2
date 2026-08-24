import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Ona Control Centre",
  description:
    "Super Admin full control of Customer, Repair Pro, jobs, payments, content & features",
};

/**
 * Admin shell is full-width desktop UI (not the phone frame).
 * Root layout still wraps PhoneShell; admin.css + AdminShell break out.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="om-admin-root">{children}</div>;
}
