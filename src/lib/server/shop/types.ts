/** Shared Shop domain types (server + API contracts). */

export type ShopAccountContext = "motorist" | "professional";

export type FitmentStatus =
  | "direct_fit"
  | "compatible"
  | "conditional"
  | "unknown"
  | "not_compatible";

export type ShopOrderStatus =
  | "pending_payment"
  | "paid"
  | "fulfilling"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export type ShopPaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded"
  | "cancelled";

export type ShopDeliveryStatus =
  | "pending"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "failed"
  | "cancelled";

export type ShopCategory = {
  id: string;
  parentId: string | null;
  tradeKey: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  depth: number;
  path: string;
  /** Count of non-empty descendant categories that contain products. */
  productCount?: number;
};

export type ShopProductCard = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  tradeKey: string;
  brandName: string | null;
  primaryImageUrl: string | null;
  conditionType: string | null;
  fromPriceMinor: number | null;
  currency: string;
  inStock: boolean;
  /** Phase 2: availability separated from catalog existence. */
  status?: string | null;
  availabilityLabel?: string | null;
  attributes?: Record<string, unknown>;
  /** First active, in-stock variant — enables quick add-to-cart from a card. */
  defaultVariantId?: string | null;
  vehicleTags?: string[];
  priceOnRequest?: boolean;
  stockLabel?: string;
};

export type ShopSearchIntent = {
  rawQuery: string;
  normalizedQuery: string;
  tradeKey: string | null;
  productHints: string[];
  make: string | null;
  model: string | null;
  year: number | null;
  position: string | null;
  specs: Record<string, string | number>;
  /** Canonical tyre size when the query carries one, e.g. "205/55R16". */
  tyreSize?: string | null;
  /** True when the query matched tyre/tire or vulcanizer/vulcaniser synonyms. */
  tyreSynonymExpanded?: boolean;
};
