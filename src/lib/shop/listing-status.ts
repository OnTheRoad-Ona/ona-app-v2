/**
 * Six mandatory seller-listing statuses for Mechanic Shop.
 * "all" is a UI convenience filter only not a stored status.
 */

import type { ProductStatus } from "@/lib/shop/catalog-status";

export const LISTING_STATUSES = [
  "available",
  "low_stock",
  "out_of_stock",
  "pre_order",
  "coming_soon",
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type ListingFilterKey = "all" | ListingStatus;

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  available: "Available",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
  pre_order: "Pre-order",
  coming_soon: "Coming Soon",
};

export const LISTING_FILTER_CHIPS: { key: ListingFilterKey; label: string }[] =
  [
    { key: "all", label: "ALL" },
    { key: "available", label: "Available" },
    { key: "low_stock", label: "Low Stock" },
    { key: "out_of_stock", label: "Out of Stock" },
    { key: "pre_order", label: "Pre-order" },
    { key: "coming_soon", label: "Coming Soon" },
  ];

export function isListingStatus(
  v: string | null | undefined,
): v is ListingStatus {
  return Boolean(v && (LISTING_STATUSES as readonly string[]).includes(v));
}

/** Derive listing status from inventory when seller is platform. */
export function deriveListingStatus(input: {
  qty: number;
  reorderLevel: number;
  force?: ListingStatus | null;
}): ListingStatus {
  if (input.force && isListingStatus(input.force)) return input.force;
  if (input.qty <= 0) return "out_of_stock";
  if (input.qty <= Math.max(0, input.reorderLevel)) return "low_stock";
  return "available";
}

/** Purchasable today from a listing. */
export function listingIsPurchasable(status: ListingStatus): boolean {
  return (
    status === "available" || status === "low_stock" || status === "pre_order"
  );
}

/**
 * Product-status set that a listing filter maps to when querying the catalog.
 * - all / available / low_stock / out_of_stock → `active` (availability is
 * stock-derived, so filtering happens per-card)
 * - pre_order → future purchased-from-ahead products
 * - coming_soon → future / pending products
 * Returns null for "all" (no status constraint).
 */
export function productStatusesForListing(
  key: ListingFilterKey,
): readonly ProductStatus[] | null {
  if (key === "all") return null;
  if (key === "available" || key === "low_stock" || key === "out_of_stock") {
    return ["active"];
  }
  if (key === "pre_order") return ["future_product"];
  if (key === "coming_soon") {
    return ["future_product", "source_pending", "pending_verification"];
  }
  return null;
}

/** Client-side matcher for a product card against a listing filter chip. */
export function listingMatchesCard(
  card: {
    inStock: boolean;
    status?: string | null;
    availabilityLabel?: string | null;
  },
  key: ListingFilterKey,
): boolean {
  if (key === "all") return true;
  const st = (card.availabilityLabel || card.status || "").toLowerCase();
  if (key === "available")
    return Boolean(card.inStock) || st.includes("available");
  if (key === "low_stock") return st.includes("low");
  if (key === "out_of_stock") {
    return (
      !card.inStock &&
      !st.includes("discontinued") &&
      !st.includes("coming") &&
      !st.includes("pre") &&
      card.status !== "future_product"
    );
  }
  if (key === "pre_order") return st.includes("pre");
  if (key === "coming_soon")
    return st.includes("coming") || card.status === "future_product";
  return true;
}
