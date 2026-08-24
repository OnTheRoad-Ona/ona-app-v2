/**
 * ONA Shop catalog normalization (Phase 2).
 * Deterministic ids, normalized brand/manufacturer/model/SKU/part-number keys,
 * and dedup keys. All pure functions unit-testable without a database.
 */

import { createHash } from "node:crypto";

/** Deterministic UUID (name-based, SHA-256) from a canonical key. */
export function deterministicId(
  ...parts: (string | number | null | undefined)[]
): string {
  const joined = parts
    .filter((p) => p !== null && p !== undefined)
    .join("::")
    .toLowerCase();
  const hex = createHash("sha256").update(joined).digest("hex").slice(0, 32);
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    "5" +
    hex.slice(13, 16) +
    "-" +
    ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) +
    hex.slice(17, 20) +
    "-" +
    hex.slice(20, 32)
  );
}

/** Normalize a brand/manufacturer/model name: case, spacing, common tokens. */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/["'“”‘’]/g, "")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company)\b\.?$/g, "")
    .trim();
}

export function brandSlug(input: string): string {
  return normalizeName(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Normalize a manufacturer part number (MPN). */
export function normalizePartNumber(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .trim()
    .toUpperCase()
    .replace(/[\s]+/g, "")
    .replace(/["'“”‘’`~!@#$%^&*()_=+\[\]{}\\|;:,.<>?]/g, "");
}

/** Canonical part identity alphanumerics only, for dedup/fuzzy matching. */
export function canonicalPart(input: string | null | undefined): string {
  return String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Normalize a SKU. */
export function normalizeSku(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalize a vehicle model name. */
export function normalizeModel(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/**
 * Deterministic canonical dedup key for a variant.
 * Multiple sources listing the same part produce the SAME key, so the import
 * pipeline merges rather than creating five copies.
 *
 * Priority: sku > oem > mpn. Vehicle fitment attributes are folded in so the
 * same part for different vehicles stays distinct where required.
 */
export function dedupKeyForVariant(input: {
  tradeKey: string;
  brand?: string | null;
  sku?: string | null;
  oemNumber?: string | null;
  mpn?: string | null;
  attributes?: Record<string, unknown> | null;
}): string | null {
  const sku = normalizeSku(input.sku);
  if (sku) {
    return deterministicId("sku", sku, input.tradeKey);
  }
  const oem = normalizePartNumber(input.oemNumber);
  if (oem) {
    const attrs = input.attributes ?? {};
    const fit = [
      attrs.vehicleMake,
      attrs.vehicleModel,
      attrs.vehicleYear,
      attrs.position,
    ]
      .filter((v) => v != null && v !== "")
      .join("|");
    return deterministicId(
      "oem",
      canonicalPart(oem),
      input.tradeKey,
      fit || "",
    );
  }
  const mpn = normalizePartNumber(input.mpn);
  if (mpn) {
    return deterministicId("mpn", canonicalPart(mpn), input.tradeKey);
  }
  return null;
}

/** Deterministic slug from a product name. */
export function slugify(input: string): string {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Map an external category path to Ona trade/category/subcategory/product-type.
 * externalCategory may be e.g. "Automotive > Brakes > Brake Pads" or
 * "PV Modules". Returns null when unmappable (record is still imported as a
 * product of the source's declared trade, just flagged unmapped).
 */
export function mapExternalCategory(input: {
  externalCategory?: string | null;
  tradeKey: string;
}): {
  categorySlug?: string;
  subcategorySlug?: string;
  productType?: string;
} {
  const raw = (input.externalCategory || "").replace(/\s*>\s*/g, "/").trim();
  if (!raw) return {};
  const segments = raw
    .split("/")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!segments.length) return {};

  const productType = segments[0];
  const categorySlug = segments[0];
  const subcategorySlug = segments[1];

  return {
    categorySlug: slugify(categorySlug),
    subcategorySlug: subcategorySlug ? slugify(subcategorySlug) : undefined,
    productType: slugify(productType),
  };
}

export function checksum(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(input ?? {}))
    .digest("hex");
}
