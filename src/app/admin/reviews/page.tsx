"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type Review = {
  id: string;
  request_id: string;
  motorist_id: string;
  repair_pro_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export default function AdminReviewsPage() {
  const { adminName, ready, api } = useAdminGate();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = await api<{ reviews: Review[] }>("/api/admin/reviews");
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setReviews(res.data.reviews);
    })();
  }, [ready, api]);

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Reviews</h1>
      <p className="om-admin-sub">
        Ratings and reviews after completed jobs. Spot spam or abuse and support quality on the marketplace.
      </p>
      {error ? <div className="om-admin-error">{error}</div> : null}
      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <strong>{reviews.length} review(s)</strong>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Rating</th>
              <th>Comment</th>
              <th>Pro</th>
              <th>Customer</th>
            </tr>
          </thead>
          <tbody>
            {reviews.length === 0 ? (
              <tr>
                <td colSpan={5} className="om-admin-muted">
                  No reviews yet.
                </td>
              </tr>
            ) : (
              reviews.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    <span className="om-admin-badge approved">{r.rating}★</span>
                  </td>
                  <td>{r.comment || "—"}</td>
                  <td className="om-admin-muted">
                    {r.repair_pro_id.slice(0, 8)}…
                  </td>
                  <td className="om-admin-muted">
                    {r.motorist_id.slice(0, 8)}…
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
