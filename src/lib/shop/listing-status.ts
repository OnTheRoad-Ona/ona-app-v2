/**
 * Six mandatory seller-listing statuses for Mechanic Shop.
 * "all" is a UI convenience filter only — not a stored status.
 */

export const LISTING_STATUSES = [
  "available",
  "low_stock",
  "out_of_stock",
  "pre_order",
  "coming_soon",
  "discontinued",
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type ListingFilterKey = "all" | ListingStatus;

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  available: "Available",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
  pre_order: "Pre-order",
  coming_soon: "Coming Soon",
  discontinued: "Discontinued",
};

export const LISTING_FILTER_CHIPS: { key: ListingFilterKey; label: string }[] =
  [
    { key: "all", label: "ALL" },
    { key: "available", label: "Available" },
    { key: "low_stock", label: "Low Stock" },
    { key: "out_of_stock", label: "Out of Stock" },
    { key: "pre_order", label: "Pre-order" },
    { key: "coming_soon", label: "Coming Soon" },
    { key: "discontinued", label: "Discontinued" },
  ];

export function isListingStatus(v: string | null | undefined): v is ListingStatus {
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
  return status === "available" || status === "low_stock" || status === "pre_order";
}
