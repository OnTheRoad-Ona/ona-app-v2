/**
 * Automedics Mechanic Shop taxonomy 17 live categories.
 * Seeds shop_trade_categories for trade_key = mechanic.
 */

import { AUTOMEDICS_CATEGORIES } from "@/lib/shop/automedics-catalog";

export type MechCat = {
  slug: string;
  name: string;
  children?: MechCat[];
};

export const MECHANIC_CATEGORY_TREE: MechCat[] = AUTOMEDICS_CATEGORIES.map(
  (c) => ({ slug: c.slug, name: c.name }),
);

/** Flat walk for seeding: depth 0 roots then depth 1 children. */
export function walkMechanicCategories(): Array<{
  slug: string;
  name: string;
  parentSlug: string | null;
  depth: number;
  sortOrder: number;
}> {
  const out: Array<{
    slug: string;
    name: string;
    parentSlug: string | null;
    depth: number;
    sortOrder: number;
  }> = [];
  MECHANIC_CATEGORY_TREE.forEach((root, i) => {
    out.push({
      slug: root.slug,
      name: root.name,
      parentSlug: null,
      depth: 0,
      sortOrder: i + 1,
    });
    (root.children || []).forEach((c, j) => {
      out.push({
        slug: c.slug,
        name: c.name,
        parentSlug: root.slug,
        depth: 1,
        sortOrder: j + 1,
      });
    });
  });
  return out;
}
