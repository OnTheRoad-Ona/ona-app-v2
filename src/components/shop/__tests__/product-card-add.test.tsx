// @vitest-environment jsdom
/**
 * The + button must call add-to-cart when the product is purchasable,
 * open the sign-in/product sheet when unauthenticated, and do nothing
 * when out of stock.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShopProductCard } from "@/components/shop/product-card";

const hoisted = vi.hoisted(() => ({
  addToCart: vi.fn(async () => ({ cart: { itemCount: 1 } })),
  state: { isAuthenticated: true },
}));

vi.mock("@/lib/shop/client", () => ({
  shopAddToCart: hoisted.addToCart,
}));

vi.mock("@/lib/store", () => ({
  useApp: () => ({
    theme: "dark",
    isAuthenticated: hoisted.state.isAuthenticated,
    accountType: "motorist",
  }),
}));

vi.mock("@/components/shop/product-sheet", () => ({
  ProductSheet: () => <div data-testid="product-sheet" />,
}));

const product = {
  id: "p1",
  slug: "p1",
  name: "5W-30 1 Litre Premium",
  subtitle: "Fits most vehicles",
  fromPriceMinor: 1300000,
  inStock: true,
  defaultVariantId: "v1",
  priceOnRequest: false,
};

describe("ShopProductCard + button", () => {
  beforeEach(() => {
    hoisted.addToCart.mockClear();
    hoisted.state.isAuthenticated = true;
  });

  it("calls add-to-cart when + is clicked (signed in)", async () => {
    render(<ShopProductCard product={product} />);
    const btn = screen.getByLabelText("Add to cart");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => {
      expect(hoisted.addToCart).toHaveBeenCalledWith({
        variantId: "v1",
        qty: 1,
        accountContext: "motorist",
      });
    });
  });

  it("shows success check after adding", async () => {
    render(<ShopProductCard product={product} />);
    fireEvent.click(screen.getByLabelText("Add to cart"));
    await waitFor(() => {
      expect(screen.getByTitle("Added to cart")).toBeTruthy();
    });
  });

  it("opens the product sheet instead when NOT authenticated", async () => {
    hoisted.state.isAuthenticated = false;
    render(<ShopProductCard product={product} />);
    fireEvent.click(screen.getByLabelText("Add to cart"));
    await waitFor(() => {
      expect(screen.getByTestId("product-sheet")).toBeTruthy();
    });
    expect(hoisted.addToCart).not.toHaveBeenCalled();
    hoisted.state.isAuthenticated = true;
  });

  it("is disabled and does nothing when out of stock", () => {
    render(
      <ShopProductCard product={{ ...product, inStock: false }} />,
    );
    const btn = screen.getByLabelText("Out of stock");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(hoisted.addToCart).not.toHaveBeenCalled();
  });
});
