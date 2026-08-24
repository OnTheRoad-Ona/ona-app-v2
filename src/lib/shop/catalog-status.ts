/**
 * ONA Shop product lifecycle + availability model (Phase 2).
 *
 * Shared server + client (no "use client") so catalog APIs can import it.
 *
 * Availability is SEPARATE from catalog existence:
 * - a product can exist in the catalog but be "unavailable" (no stock/price)
 * - "unavailable" is never presented as "product does not exist"
 */

export const PRODUCT_STATUSES = [
  "active",
  "inactive",
  "unavailable",
  "discontinued",
  "pending_verification",
  "source_pending",
  "future_product",
  "draft",
  "archived",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  unavailable: "Currently unavailable",
  discontinued: "Discontinued",
  pending_verification: "Pending verification",
  source_pending: "Awaiting source",
  future_product: "Coming soon",
  draft: "Draft",
  archived: "Archived",
};

export const PRODUCT_STATUS_ORDER: ProductStatus[] = [
  "active",
  "inactive",
  "unavailable",
  "discontinued",
  "pending_verification",
  "source_pending",
  "future_product",
  "draft",
  "archived",
];

/** Statuses that still mean the product exists in the catalog. */
export const CATALOG_EXISTING_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "inactive",
  "unavailable",
  "discontinued",
  "pending_verification",
  "source_pending",
  "future_product",
]);

/** Statuses a buyer can actually add to cart today. */
export const PURCHASABLE_STATUSES: ReadonlySet<string> = new Set(["active"]);

export type AvailabilityState = {
  /** Does the product exist in the Ona catalog at all? */
  exists: boolean;
  /** Is the product intended for sale (active lifecycle)? */
  purchasable: boolean;
  /** Is there an active price row? */
  priced: boolean;
  /** Is there positive sellable stock? */
  inStock: boolean;
  /** purchasable && priced && inStock */
  available: boolean;
  /** Display label never "does not exist" for a cataloged product. */
  label: string;
};

export function availabilityState(input: {
  status?: string | null;
  priced?: boolean;
  inStock?: boolean;
}): AvailabilityState {
  const status = input.status || "active";
  const exists = CATALOG_EXISTING_STATUSES.has(status);
  const purchasable = PURCHASABLE_STATUSES.has(status);
  const priced = Boolean(input.priced);
  const inStock = Boolean(input.inStock);
  const available = purchasable && priced && inStock;

  let label: string;
  if (!exists) label = "Unavailable";
  else if (!purchasable)
    label = PRODUCT_STATUS_LABELS[status as ProductStatus] ?? status;
  else if (!priced) label = "Currently unavailable";
  else if (!inStock) label = "Currently unavailable";
  else label = "In stock";

  return { exists, purchasable, priced, inStock, available, label };
}

/** Fine-grained reason why a cataloged product is not available. */
export function unavailableReason(input: {
  status?: string | null;
  priced?: boolean;
  inStock?: boolean;
}): string | null {
  const a = availabilityState(input);
  if (a.available || !a.exists) return null;
  if (!a.purchasable)
    return (
      PRODUCT_STATUS_LABELS[input.status as ProductStatus] ?? "Unavailable"
    );
  if (!a.priced) return "No price has been set yet";
  if (!a.inStock) return "Out of stock restocking soon";
  return "Currently unavailable";
}
