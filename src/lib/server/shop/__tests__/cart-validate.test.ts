import { describe, expect, it } from "vitest";
import {
  validateCartForCheckout,
  type CartView,
} from "@/lib/server/shop/cart";

function sampleCart(over: Partial<CartView> = {}): CartView {
  return {
    id: "c1",
    userId: "u1",
    accountContext: "motorist",
    currency: "NGN",
    items: [
      {
        id: "i1",
        variantId: "v1",
        productId: "p1",
        productName: "Brake Pads",
        productSlug: "brake-pads",
        variantTitle: "Standard",
        sku: "SKU-1",
        qty: 1,
        unitPriceMinor: 1000_00,
        lineTotalMinor: 1000_00,
        inStock: true,
        availableQty: 5,
      },
    ],
    subtotalMinor: 1000_00,
    itemCount: 1,
    ...over,
  };
}

describe("validateCartForCheckout", () => {
  it("accepts a valid cart", () => {
    const r = validateCartForCheckout(sampleCart());
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejects empty cart", () => {
    const r = validateCartForCheckout(
      sampleCart({ items: [], subtotalMinor: 0, itemCount: 0 })
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/empty/i);
  });

  it("rejects out of stock lines", () => {
    const base = sampleCart();
    const r = validateCartForCheckout({
      ...base,
      items: [{ ...base.items[0], inStock: false }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/stock/i);
  });
});
