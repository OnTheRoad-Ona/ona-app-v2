"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { DetailDrawer } from "@/components/admin/admin-ui";
import { getTradeAttributeSchema } from "@/lib/shop/trade-attributes";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";

type ShopOrderRow = {
  id: string;
  order_number: string;
  user_id: string;
  status: string;
  total_minor: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  delivery: {
    id?: string;
    status?: string;
    courier_name?: string | null;
    courier_phone?: string | null;
    tracking_code?: string | null;
    notes?: string | null;
  } | null;
};

type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  trade_key: string;
  category_id: string;
  status: string;
  condition_type: string | null;
  primary_image_url: string | null;
  created_at: string;
  updated_at: string;
  stock_qty?: number;
  availability?: string;
  listing_override?: string | null;
  attributes?: Record<string, unknown> | null;
};

type CategoryRow = {
  id: string;
  trade_key: string;
  slug: string;
  name: string;
  depth: number;
};

const DELIVERY_STATUSES = [
  "pending",
  "assigned",
  "picked_up",
  "in_transit",
  "delivered",
  "failed",
  "cancelled",
] as const;

type Tab = "catalog" | "orders";

/** Stock availability bucket for the admin drawer (pure). */
function availabilityFor(qty: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (qty <= 0)
    return { label: "Out of Stock", color: "#b91c1c", bg: "#fee2e2" };
  if (qty <= 4)
    return { label: "Low Stock", color: "#92400e", bg: "#fef3c7" };
  return { label: "In Stock", color: "#166534", bg: "#dcfce7" };
}

export default function AdminShopPage() {
  const { adminName, ready, api } = useAdminGate();
  const [tab, setTab] = useState<Tab>("catalog");

  // Orders state
  const [orders, setOrders] = useState<ShopOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Courier provider registry, managed list, no more free-text guessing
  const [couriers, setCouriers] = useState<
    { id: string; name: string; phone?: string; active: boolean }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/shop/couriers");
        const json = await res.json();
        if (!cancelled && json?.ok) setCouriers(json.data.providers || []);
      } catch {
        /* registry optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [draft, setDraft] = useState<
    Record<
      string,
      {
        status: string;
        courierName: string;
        courierPhone: string;
        trackingCode: string;
      }
    >
  >({});

  // Catalog state
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogQ, setCatalogQ] = useState("");
  const [catalogTrade, setCatalogTrade] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDetail, setEditDetail] = useState<{
    product: CatalogProduct & Record<string, unknown>;
    variants: Array<Record<string, unknown>>;
    prices: Array<Record<string, unknown>>;
    inventory: Array<Record<string, unknown>>;
    images: Array<Record<string, unknown>>;
  } | null>(null);

  const [form, setForm] = useState({
    name: "",
    subtitle: "",
    description: "",
    tradeKey: "mechanic",
    categoryId: "",
    sku: "",
    oemNumber: "",
    priceMajor: "",
    stockQty: "10",
    status: "active" as "draft" | "active" | "archived",
    conditionType: "original",
  });
  const [priceMajorEdit, setPriceMajorEdit] = useState("");
  const [stockEdit, setStockEdit] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [catalogListing, setCatalogListing] = useState("");

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setError(null);
    const res = await api<{
      orders: ShopOrderRow[];
      setupRequired?: boolean;
      message?: string;
    }>("/api/admin/shop/orders?limit=80");
    if (!res.ok) {
      setError(res.message);
      setOrders([]);
      setOrdersLoading(false);
      return;
    }
    setSetupRequired(Boolean(res.data.setupRequired));
    if (res.data.message) setMessage(res.data.message);
    const list = res.data.orders ?? [];
    setOrders(list);
    const d: typeof draft = {};
    for (const o of list) {
      d[o.id] = {
        status: o.delivery?.status || "pending",
        courierName: o.delivery?.courier_name || "",
        courierPhone: o.delivery?.courier_phone || "",
        trackingCode: o.delivery?.tracking_code || "",
      };
    }
    setDraft(d);
    setOrdersLoading(false);
  }, [api]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "100" });
    if (catalogQ.trim()) params.set("q", catalogQ.trim());
    if (catalogTrade) params.set("trade", catalogTrade);
    if (catalogListing) params.set("listing", catalogListing);
    const res = await api<{
      products: CatalogProduct[];
      categories: CategoryRow[];
      setupRequired?: boolean;
      message?: string;
    }>(`/api/admin/shop/products?${params.toString()}`);
    if (!res.ok) {
      setError(res.message);
      setProducts([]);
      setCatalogLoading(false);
      return;
    }
    if (res.data.setupRequired) setSetupRequired(true);
    setProducts(res.data.products ?? []);
    setCategories(res.data.categories ?? []);
    setCatalogLoading(false);
  }, [api, catalogQ, catalogTrade]);

  useEffect(() => {
    if (!ready) return;
    if (tab === "orders") void loadOrders();
    else void loadCatalog();
  }, [ready, tab, loadOrders, loadCatalog]);

  const tradeOptions = useMemo(() => {
    const keys = new Set(categories.map((c) => c.trade_key));
    return [...keys].sort();
  }, [categories]);

  const categoriesForTrade = useMemo(() => {
    return categories.filter(
      (c) => !form.tradeKey || c.trade_key === form.tradeKey,
    );
  }, [categories, form.tradeKey]);

  const saveDelivery = async (orderId: string) => {
    const d = draft[orderId];
    if (!d) return;
    setBusyId(orderId);
    setMessage(null);
    setError(null);
    const res = await api<{ delivery: unknown }>("/api/admin/shop/deliveries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        status: d.status,
        courierName: d.courierName || null,
        courierPhone: d.courierPhone || null,
        trackingCode: d.trackingCode || null,
      }),
    });
    if (!res.ok) {
      setError(res.message);
      setBusyId(null);
      return;
    }
    setMessage("Delivery updated");
    setBusyId(null);
    await loadOrders();
  };

  const runOrderAction = async (
    orderId: string,
    status: string,
    action: "cancel" | "refund",
  ) => {
    setBusyId(`action-${orderId}`);
    setMessage(null);
    setError(null);
    const res = await api(`/api/admin/shop/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: `admin ${action} (${status})` }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMessage(action === "refund" ? "Order refunded" : "Order cancelled");
    await loadOrders();
  };

  const createProduct = async () => {
    setCreateBusy(true);
    setError(null);
    setMessage(null);
    const res = await api<{ product: CatalogProduct }>(
      "/api/admin/shop/products",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          subtitle: form.subtitle || null,
          description: form.description || null,
          tradeKey: form.tradeKey,
          categoryId: form.categoryId,
          sku: form.sku,
          oemNumber: form.oemNumber || null,
          priceMajor: Number(form.priceMajor),
          stockQty: Number(form.stockQty || 0),
          status: form.status,
          conditionType: form.conditionType || null,
        }),
      },
    );
    setCreateBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMessage(`Created: ${res.data.product?.name || form.name}`);
    setShowCreate(false);
    setForm((f) => ({
      ...f,
      name: "",
      subtitle: "",
      description: "",
      sku: "",
      oemNumber: "",
      priceMajor: "",
      stockQty: "10",
    }));
    await loadCatalog();
  };

  const openEdit = async (id: string) => {
    setEditId(id);
    setEditDetail(null);
    setError(null);
    const res = await api<{
      product: CatalogProduct & Record<string, unknown>;
      variants: Array<Record<string, unknown>>;
      prices: Array<Record<string, unknown>>;
      inventory: Array<Record<string, unknown>>;
      images: Array<Record<string, unknown>>;
    }>(`/api/admin/shop/products/${id}`);
    if (!res.ok) {
      setError(res.message);
      setEditId(null);
      return;
    }
    setEditDetail(res.data);
    const price = res.data.prices?.[0];
    const inv = res.data.inventory?.[0];
    setPriceMajorEdit(price ? String(Number(price.amount_minor) / 100) : "");
    setStockEdit(inv ? String(inv.qty_on_hand ?? 0) : "0");
    setImageDataUrl(null);
  };

  const saveProductMeta = async () => {
    if (!editId || !editDetail) return;
    setBusyId(editId);
    setError(null);
    const p = editDetail.product;
    const res = await api(`/api/admin/shop/products/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: p.name,
        subtitle: p.subtitle,
        description: p.description,
        status: p.status,
        conditionType: p.condition_type,
        tradeKey: p.trade_key,
        categoryId: p.category_id,
        listingOverride: p.listing_override ?? null,
        attributes: p.attributes ?? {},
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMessage("Product updated");
    await loadCatalog();
  };

  const savePrice = async () => {
    if (!editId || !editDetail?.variants?.[0]) return;
    const variantId = String(editDetail.variants[0].id);
    setBusyId(`price-${editId}`);
    const res = await api(`/api/admin/shop/products/${editId}/price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId,
        priceMajor: Number(priceMajorEdit),
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMessage("Price updated");
    await openEdit(editId);
  };

  const saveStock = async () => {
    if (!editId || !editDetail?.variants?.[0]) return;
    const variantId = String(editDetail.variants[0].id);
    setBusyId(`stock-${editId}`);
    const res = await api(`/api/admin/shop/products/${editId}/stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId,
        qtyOnHand: Number(stockEdit),
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMessage("Stock updated");
    await openEdit(editId);
  };

  /** One Save saves every section: details, availability, attributes, price, stock */
  const saveAll = async () => {
    if (!editId) return;
    setBusyId(editId);
    setError(null);
    const results = await Promise.allSettled([
      saveProductMeta(),
      savePrice(),
      saveStock(),
    ]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) {
      setError(
        failed.reason instanceof Error ? failed.reason.message : "Save failed",
      );
    } else {
      setMessage("Product saved");
      await openEdit(editId);
    }
  };

  const uploadImage = async () => {
    if (!editId || !imageDataUrl) return;
    setBusyId(`img-${editId}`);
    const res = await api(`/api/admin/shop/products/${editId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl,
        setPrimary: true,
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMessage("Image uploaded");
    setImageDataUrl(null);
    await openEdit(editId);
    await loadCatalog();
  };

  const onFile = (file: File | null) => {
    if (!file) {
      setImageDataUrl(null);
      return;
    }
    if (file.size > 3_000_000) {
      setError("Image max 3 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  };

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">ONA Shop control</h1>
      <p className="om-admin-sub">
        Manage catalog, prices, stock & images in one place then track retail
        orders. Ona is the only seller (not job escrow).
      </p>
      <AdminGuideBanner pageId="shop" />

      <div
        className="om-admin-toolbar"
        style={{
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 12,
          padding: "10px 12px",
          borderRadius: 12,
          background: "var(--om-admin-chip-bg, rgba(255,107,53,0.08))",
          border: "1px solid rgba(255,107,53,0.2)",
        }}
      >
        <button
          type="button"
          className="om-admin-btn"
          style={
            tab === "catalog"
              ? {
                  background: "#FF6B35",
                  color: "#fff",
                  boxShadow: "0 4px 14px rgba(255,107,53,0.35)",
                  fontWeight: 700,
                }
              : { fontWeight: 600 }
          }
          onClick={() => setTab("catalog")}
        >
          📦 Catalog
        </button>
        <button
          type="button"
          className="om-admin-btn"
          style={
            tab === "orders"
              ? {
                  background: "#FF6B35",
                  color: "#fff",
                  boxShadow: "0 4px 14px rgba(255,107,53,0.35)",
                  fontWeight: 700,
                }
              : { fontWeight: 600 }
          }
          onClick={() => setTab("orders")}
        >
          🚚 Orders & delivery
        </button>
        {tab === "catalog" ? (
          <>
            <button
              type="button"
              className="om-admin-btn"
              onClick={() => void loadCatalog()}
            >
              Refresh
            </button>
            <button
              type="button"
              className="om-admin-btn"
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? "Cancel create" : "+ New product"}
            </button>
            <strong>{products.length} product(s)</strong>
          </>
        ) : (
          <>
            <button
              type="button"
              className="om-admin-btn"
              onClick={() => void loadOrders()}
            >
              Refresh
            </button>
            <strong>{orders.length} order(s)</strong>
          </>
        )}
      </div>

      {error ? <div className="om-admin-error">{error}</div> : null}
      {message ? <p className="om-admin-muted">{message}</p> : null}
      {setupRequired ? (
        <p className="om-admin-muted">
          Run migrations <code>20260809_050_ona_shop_core.sql</code> and{" "}
          <code>20260809_051_shop_media_and_permission.sql</code>, then seed.
        </p>
      ) : null}

      {tab === "catalog" ? (
        <>
          <div
            className="om-admin-toolbar"
            style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}
          >
            <input
              className="om-admin-input"
              placeholder="Search name / slug…"
              value={catalogQ}
              onChange={(e) => setCatalogQ(e.target.value)}
              style={{ minWidth: 180 }}
            />
            <select
              className="om-admin-input"
              value={catalogTrade}
              onChange={(e) => setCatalogTrade(e.target.value)}
            >
              <option value="">All trades</option>
              {tradeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className="om-admin-input"
              value={catalogListing}
              onChange={(e) => setCatalogListing(e.target.value)}
            >
              <option value="">All availability</option>
              <option value="available">Available</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="pre_order">Pre-order</option>
              <option value="coming_soon">Coming Soon</option>
            </select>
            <button
              type="button"
              className="om-admin-btn"
              onClick={() => void loadCatalog()}
            >
              Filter
            </button>
          </div>

          {showCreate ? (
            <div className="om-admin-panel" style={{ marginTop: 12 }}>
              <h2 style={{ marginTop: 0 }}>New product</h2>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <input
                  className="om-admin-input"
                  placeholder="Name *"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
                <input
                  className="om-admin-input"
                  placeholder="Subtitle"
                  value={form.subtitle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subtitle: e.target.value }))
                  }
                />
                <select
                  className="om-admin-input"
                  value={form.tradeKey}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tradeKey: e.target.value,
                      categoryId: "",
                    }))
                  }
                >
                  {tradeOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  className="om-admin-input"
                  value={form.categoryId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categoryId: e.target.value }))
                  }
                >
                  <option value="">Category *</option>
                  {categoriesForTrade.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.slug})
                    </option>
                  ))}
                </select>
                <input
                  className="om-admin-input"
                  placeholder="SKU *"
                  value={form.sku}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sku: e.target.value }))
                  }
                />
                <input
                  className="om-admin-input"
                  placeholder="OEM number"
                  value={form.oemNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, oemNumber: e.target.value }))
                  }
                />
                <input
                  className="om-admin-input"
                  placeholder="Price ₦ major *"
                  value={form.priceMajor}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priceMajor: e.target.value }))
                  }
                />
                <input
                  className="om-admin-input"
                  placeholder="Stock qty"
                  value={form.stockQty}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, stockQty: e.target.value }))
                  }
                />
                <select
                  className="om-admin-input"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      status: e.target.value as typeof form.status,
                    }))
                  }
                >
                  <option value="active">active</option>
                  <option value="draft">draft</option>
                  <option value="archived">archived</option>
                </select>
                <select
                  className="om-admin-input"
                  value={form.conditionType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, conditionType: e.target.value }))
                  }
                >
                  <option value="original">original</option>
                  <option value="aftermarket">aftermarket</option>
                  <option value="used">used</option>
                </select>
                <textarea
                  className="om-admin-input"
                  placeholder="Description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  style={{ gridColumn: "1 / -1", minHeight: 72 }}
                />
              </div>
              <button
                type="button"
                className="om-admin-btn"
                style={{ marginTop: 10, background: "#FF6B35", color: "#fff" }}
                disabled={
                  createBusy ||
                  !form.name ||
                  !form.sku ||
                  !form.categoryId ||
                  !form.priceMajor
                }
                onClick={() => void createProduct()}
              >
                {createBusy ? "Creating…" : "Create product"}
              </button>
            </div>
          ) : null}

          {catalogLoading ? (
            <p className="om-admin-muted">Loading catalog…</p>
          ) : products.length === 0 ? (
            <p className="om-admin-muted">No products yet. Create one above.</p>
          ) : (
            <div className="om-admin-panel" style={{ marginTop: 12 }}>
              <table className="om-admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Trade</th>
                    <th>Stock</th>
                    <th>Availability</th>
                    <th>Status</th>
                    <th>Image</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, idx) => (
                    <tr
                      key={p.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => void openEdit(p.id)}
                    >
                      <td className="om-admin-muted">{idx + 1}</td>
                      <td>
                        <strong>{p.name}</strong>
                        <div className="om-admin-muted">{p.slug}</div>
                        {p.subtitle ? (
                          <div className="om-admin-muted">{p.subtitle}</div>
                        ) : null}
                      </td>
                      <td>{p.trade_key}</td>
                      <td>
                        <strong>{Number(p.stock_qty ?? 0)}</strong>
                      </td>
                      <td>
                        {(() => {
                          const av = String(p.availability ?? "available");
                          const map: Record<string, { c: string; b: string }> = {
                            available: { c: "#166534", b: "#dcfce7" },
                            low_stock: { c: "#92400e", b: "#fef3c7" },
                            out_of_stock: { c: "#b91c1c", b: "#fee2e2" },
                            pre_order: { c: "#1d4ed8", b: "#dbeafe" },
                            coming_soon: { c: "#5b21b6", b: "#ede9fe" },
                          };
                          const v = map[av] || map.available;
                          return (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: v.c,
                                background: v.b,
                                borderRadius: 999,
                                padding: "2px 10px",
                              }}
                            >
                              {av.replace(/_/g, " ")}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        <span className="om-admin-badge">{p.status}</span>
                      </td>
                      <td>
                        {p.primary_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            loading="lazy"
                            decoding="async"
                            src={p.primary_image_url}
                            alt=""
                            width={40}
                            height={40}
                            style={{
                              objectFit: "cover",
                              borderRadius: 6,
                            }}
                          />
                        ) : (
                          ""
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="om-admin-btn"
                          onClick={() => void openEdit(p.id)}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editId && editDetail ? (
            <DetailDrawer
              open
              title="Edit product"
              subtitle="Full control: details, price, stock, image"
              width={480}
              onClose={() => {
                setEditId(null);
                setEditDetail(null);
              }}
              headerAction={
                <button
                  type="button"
                  style={{
                    background: "#323231",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "0.45rem 0.9rem",
                    fontWeight: 700,
                    fontSize: "0.8rem",
                    cursor: busyId === editId ? "wait" : "pointer",
                    fontFamily: "inherit",
                  }}
                  disabled={busyId === editId}
                  onClick={() => void saveAll()}
                >
                  {busyId === editId ? "Saving…" : "Save"}
                </button>
              }
            >
            <div>
              {/* Availability + tips */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {(() => {
                  const a = availabilityFor(Number(stockEdit) || 0);
                  return (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: a.color,
                        background: a.bg,
                        borderRadius: 999,
                        padding: "4px 12px",
                      }}
                    >
                      {a.label}
                    </span>
                  );
                })()}
                <span className="om-admin-muted" style={{ fontSize: 11 }}>
                  Changes go live immediately after each save
                </span>
              </div>

              {/* ── Availability (backend-controlled storefront state) ── */}
              <div
                style={{
                  border: "1px solid var(--om-border, #e2e3e7)",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--om-text-muted, #64748b)",
                    marginBottom: 8,
                  }}
                >
                  Availability
                </div>
                <select
                  className="om-admin-input"
                  value={String(
                    editDetail.product.listing_override ?? "auto",
                  )}
                  onChange={(e) =>
                    setEditDetail((d) =>
                      d
                        ? {
                            ...d,
                            product: {
                              ...d.product,
                              listing_override:
                                e.target.value === "auto"
                                  ? null
                                  : e.target.value,
                            },
                          }
                        : d,
                    )
                  }
                >
                  <option value="auto">Auto, from stock count</option>
                  <option value="available">Available</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                  <option value="pre_order">Pre-order</option>
                  <option value="coming_soon">Coming Soon</option>
                </select>
                <p className="om-admin-muted" style={{ fontSize: 11, marginTop: 6 }}>
                  Auto derives from the stock number. A forced state overrides
                  stock on the storefront instantly after save.
                </p>
              </div>

              {/* ── Details ── */}
              <div
                style={{
                  border: "1px solid var(--om-border, #e2e3e7)",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--om-text-muted, #64748b)",
                    marginBottom: 8,
                  }}
                >
                  Details
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    className="om-admin-input"
                    value={String(editDetail.product.name || "")}
                    onChange={(e) =>
                      setEditDetail((d) =>
                        d
                          ? { ...d, product: { ...d.product, name: e.target.value } }
                          : d,
                      )
                    }
                    placeholder="Product name"
                  />
                  <input
                    className="om-admin-input"
                    value={String(editDetail.product.subtitle || "")}
                    onChange={(e) =>
                      setEditDetail((d) =>
                        d
                          ? {
                              ...d,
                              product: { ...d.product, subtitle: e.target.value },
                            }
                          : d,
                      )
                    }
                    placeholder="Short subtitle"
                  />
                  <textarea
                    className="om-admin-input"
                    value={String(editDetail.product.description || "")}
                    onChange={(e) =>
                      setEditDetail((d) =>
                        d
                          ? {
                              ...d,
                              product: {
                                ...d.product,
                                description: e.target.value,
                              },
                            }
                          : d,
                      )
                    }
                    placeholder="Description"
                    style={{ minHeight: 72 }}
                  />
                  <select
                    className="om-admin-input"
                    value={String(editDetail.product.status || "active")}
                    onChange={(e) =>
                      setEditDetail((d) =>
                        d
                          ? { ...d, product: { ...d.product, status: e.target.value } }
                          : d,
                      )
                    }
                  >
                    <option value="active">Active, visible in shop</option>
                    <option value="draft">Draft, hidden</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* ── Attribute profiling (per-trade schema) ── */}
              {(() => {
                const tradeKey = String(editDetail.product.trade_key || "");
                const schema = getTradeAttributeSchema(tradeKey);
                if (!schema || !schema.attributes.length) return null;
                const current = (editDetail.product.attributes || {}) as Record<
                  string,
                  unknown
                >;
                const setAttr = (key: string, value: unknown) => {
                  setEditDetail((d) =>
                    d
                      ? {
                          ...d,
                          product: {
                            ...d.product,
                            attributes: { ...(d.product.attributes || {}), [key]: value },
                          },
                        }
                      : d,
                  );
                };
                return (
                  <div
                    style={{
                      border: "1px solid var(--om-border, #e2e3e7)",
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--om-text-muted, #64748b)",
                        marginBottom: 8,
                      }}
                    >
                      Attributes, {tradeKey}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "10px 10px",
                      }}
                    >
                      {schema.attributes.map((a) => {
                        const val = current[a.key];
                        const wide =
                          a.type === "enum" && (a.options?.length ?? 0) > 6;
                        return (
                          <label
                            key={a.key}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                              gridColumn: wide ? "1 / -1" : "auto",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                color: "var(--om-text-muted, #64748b)",
                              }}
                            >
                              {a.label}
                              {a.required ? " *" : ""}
                              {a.unit ? ` · ${a.unit}` : ""}
                            </span>
                            {a.type === "enum" && a.options ? (
                              <select
                                className="om-admin-input"
                                value={String(val ?? "")}
                                onChange={(e) => setAttr(a.key, e.target.value)}
                              >
                                <option value=""> </option>
                                {a.options.map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            ) : a.type === "boolean" ? (
                              <input
                                type="checkbox"
                                checked={Boolean(val)}
                                onChange={(e) => setAttr(a.key, e.target.checked)}
                                style={{ width: 16, height: 16 }}
                              />
                            ) : (
                              <input
                                className="om-admin-input"
                                type={a.type === "number" ? "number" : "text"}
                                value={val === undefined || val === null ? "" : String(val)}
                                onChange={(e) =>
                                  setAttr(
                                    a.key,
                                    a.type === "number"
                                      ? e.target.value === ""
                                        ? ""
                                        : Number(e.target.value)
                                      : e.target.value,
                                  )
                                }
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                    <p className="om-admin-muted" style={{ fontSize: 11, marginTop: 6 }}>
                      Saved with &quot;Save details&quot;, these power the filters and
                      details shown on the storefront product.
                    </p>
                  </div>
                );
              })()}

              {/* ── Pricing ── */}
              <div
                style={{
                  border: "1px solid var(--om-border, #e2e3e7)",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--om-text-muted, #64748b)",
                    marginBottom: 8,
                  }}
                >
                  Price
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="om-admin-input"
                    value={priceMajorEdit}
                    onChange={(e) => setPriceMajorEdit(e.target.value)}
                    placeholder="e.g. 28500"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              {/* ── Stock & availability ── */}
              <div
                style={{
                  border: "1px solid var(--om-border, #e2e3e7)",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--om-text-muted, #64748b)",
                    }}
                  >
                    Stock
                  </div>
                  {(() => {
                    const a = availabilityFor(Number(stockEdit) || 0);
                    return (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: a.color,
                          background: a.bg,
                          borderRadius: 999,
                          padding: "2px 10px",
                        }}
                      >
                        {a.label}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="om-admin-input"
                    value={stockEdit}
                    onChange={(e) => setStockEdit(e.target.value)}
                    placeholder="Quantity on hand"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              {/* ── Image ── */}
              <div
                style={{
                  border: "1px solid var(--om-border, #e2e3e7)",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--om-text-muted, #64748b)",
                    marginBottom: 8,
                  }}
                >
                  Image
                </div>
                {editDetail.product.primary_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={String(editDetail.product.primary_image_url)}
                    alt=""
                    style={{
                      width: "100%",
                      height: 140,
                      objectFit: "cover",
                      borderRadius: 8,
                      marginBottom: 8,
                    }}
                  />
                ) : (
                  <p className="om-admin-muted" style={{ marginTop: 0 }}>
                    No image yet
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => onFile(e.target.files?.[0] || null)}
                    style={{ fontSize: 12, flex: 1 }}
                  />
                  <button
                    type="button"
                    style={{
                      background: "#323231",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "0.55rem 0.9rem",
                      fontWeight: 700,
                      fontSize: "0.82rem",
                      cursor:
                        !imageDataUrl || busyId === `img-${editId}`
                          ? "wait"
                          : "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                    disabled={!imageDataUrl || busyId === `img-${editId}`}
                    onClick={() => void uploadImage()}
                  >
                    {busyId === `img-${editId}` ? "…" : "Upload"}
                  </button>
                </div>
                {editDetail.images?.length ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    {editDetail.images.map((img) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        decoding="async"
                        key={String(img.id)}
                        src={String(img.url)}
                        alt=""
                        width={56}
                        height={56}
                        style={{ objectFit: "cover", borderRadius: 6 }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              {/* ── Danger zone ── */}
              <div
                style={{
                  border: "1px solid #fecaca",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fef2f2",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#b91c1c",
                    marginBottom: 8,
                  }}
                >
                  Danger zone
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={{
                      background: "#fff",
                      color: "#92400e",
                      border: "1px solid #fcd34d",
                      borderRadius: 8,
                      padding: "0.5rem 0.9rem",
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    onClick={async () => {
                      if (!editId) return;
                      if (
                        !window.confirm(
                          "Archive this product? Customers will no longer see it.",
                        )
                      ) {
                        return;
                      }
                      const res = await api(
                        `/api/admin/shop/products/${editId}`,
                        { method: "DELETE" },
                      );
                      if (!res.ok) {
                        setError(res.message);
                        return;
                      }
                      setMessage("Product archived");
                      setEditId(null);
                      setEditDetail(null);
                      await loadCatalog();
                    }}
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    style={{
                      background: "#fff",
                      color: "#b91c1c",
                      border: "1px solid #fca5a5",
                      borderRadius: 8,
                      padding: "0.5rem 0.9rem",
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    onClick={async () => {
                      if (!editId) return;
                      const first = window.confirm(
                        "Permanently DELETE this product, its prices, stock and images? This cannot be undone.",
                      );
                      if (!first) return;
                      const typed = window.prompt('Type "DELETE" to confirm');
                      if (typed !== "DELETE") return;
                      const res = await api(
                        `/api/admin/shop/products/${editId}?hard=1`,
                        { method: "DELETE" },
                      );
                      if (!res.ok) {
                        setError(res.message);
                        return;
                      }
                      setMessage("Product permanently deleted");
                      setEditId(null);
                      setEditDetail(null);
                      await loadCatalog();
                    }}
                  >
                    Delete permanently
                  </button>
                </div>
              </div>
            </div>
            </DetailDrawer>
          ) : null}
        </>
      ) : ordersLoading ? (
        <p className="om-admin-muted">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="om-admin-muted">No shop orders yet.</p>
      ) : (
        <div className="om-admin-panel">
          <div
            className="om-admin-muted"
            style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}
          >
            💡 <b>Tips:</b> paid orders appear here with delivery <b>pending</b>.
            Pick a courier (from your registry, manage it under the Courier
            providers box), set a status, save. Status drives the order:{" "}
            <b>assigned/picked_up → fulfilling</b>, <b>in_transit → out for
            delivery</b>, <b>delivered → done</b>. The buyer sees courier +
            tracking live on their order page.
          </div>
          <datalist id="courier-providers">
            {couriers
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.name}>
                  {c.phone || ""}
                </option>
              ))}
          </datalist>
          <table className="om-admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Total</th>
                <th>Delivery</th>
                <th>Assign / update</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const d = draft[o.id] || {
                  status: "pending",
                  courierName: "",
                  courierPhone: "",
                  trackingCode: "",
                };
                return (
                  <tr key={o.id}>
                    <td>
                      <div>
                        <strong>{o.order_number}</strong>
                      </div>
                      <div className="om-admin-muted">
                        {new Date(o.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <span className="om-admin-badge">{o.status}</span>
                    </td>
                    <td>
                      ₦
                      {Math.round(Number(o.total_minor) / 100).toLocaleString(
                        "en-NG",
                      )}
                    </td>
                    <td>
                      <div>{o.delivery?.status || ""}</div>
                      <div className="om-admin-muted">
                        {o.delivery?.courier_name || "No courier"}
                      </div>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          minWidth: 200,
                        }}
                      >
                        <select
                          value={d.status}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [o.id]: { ...d, status: e.target.value },
                            }))
                          }
                          className="om-admin-input"
                        >
                          {DELIVERY_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <input
                          className="om-admin-input"
                          placeholder="Courier name"
                          list="courier-providers"
                          value={d.courierName}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [o.id]: { ...d, courierName: e.target.value },
                            }))
                          }
                        />
                        <input
                          className="om-admin-input"
                          placeholder="Courier phone"
                          value={d.courierPhone}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [o.id]: { ...d, courierPhone: e.target.value },
                            }))
                          }
                        />
                        <input
                          className="om-admin-input"
                          placeholder="Tracking code"
                          value={d.trackingCode}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [o.id]: { ...d, trackingCode: e.target.value },
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="om-admin-btn"
                          disabled={busyId === o.id}
                          onClick={() => void saveDelivery(o.id)}
                        >
                          {busyId === o.id ? "Saving…" : "Save delivery"}
                        </button>
                        {o.status === "pending_payment" ? (
                          <button
                            type="button"
                            className="om-admin-btn"
                            style={{ color: "#d33" }}
                            disabled={busyId === `action-${o.id}`}
                            onClick={() =>
                              void runOrderAction(o.id, o.status, "cancel")
                            }
                          >
                            Cancel (unpaid)
                          </button>
                        ) : null}
                        {o.status === "paid" || o.status === "fulfilling" ? (
                          <button
                            type="button"
                            className="om-admin-btn"
                            style={{ color: "#d33" }}
                            disabled={busyId === `action-${o.id}`}
                            onClick={() =>
                              void runOrderAction(o.id, o.status, "refund")
                            }
                          >
                            Refund
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
          {/* Courier provider registry */}
      <CourierRegistry />
</AdminShell>
  );
}

/**
 * Courier provider registry: add/edit/toggle couriers. The deliveries board
 * pulls names from here, no more free-text guessing.
 */
function CourierRegistry() {
  const [providers, setProviders] = useState<
    { id: string; name: string; phone?: string; active: boolean }[]
  >([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/shop/couriers");
      const json = await res.json();
      if (json?.ok) setProviders(json.data.providers || []);
    } catch {
      /* */
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/shop/couriers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      const json = await res.json();
      if (!json?.ok) setErr(json?.error?.message || "Failed");
      else {
        setName("");
        setPhone("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p: { id: string; active: boolean }) => {
    await fetch("/api/admin/shop/couriers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    await load();
  };

  return (
    <div className="om-admin-panel" style={{ marginTop: 16 }}>
      <div className="om-admin-toolbar">
        <strong>Courier providers</strong>
      </div>
      <div style={{ padding: "0.75rem" }}>
        <p className="om-admin-muted" style={{ fontSize: 12, marginTop: 0 }}>
          💡 Tips: add your delivery partners here once, they appear as
          selectable suggestions on every order&apos;s Courier name field.
          Deactivate instead of deleting to keep history.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            className="om-admin-input"
            placeholder="Courier name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ maxWidth: 220 }}
          />
          <input
            className="om-admin-input"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ maxWidth: 180 }}
          />
          <button
            type="button"
            className="om-admin-btn"
            disabled={busy || !name.trim()}
            onClick={() => void add()}
          >
            {busy ? "Adding…" : "Add provider"}
          </button>
        </div>
        {err ? <p className="om-admin-error">{err}</p> : null}
        <table className="w-full text-left text-[12px]">
          <tbody>
            {providers.map((p) => (
              <tr key={p.id}>
                <td style={{ padding: "4px 8px 4px 0" }}>
                  <strong>{p.name}</strong>
                </td>
                <td className="om-admin-muted" style={{ padding: 4 }}>
                  {p.phone || " "}
                </td>
                <td style={{ padding: 4 }}>
                  <span className="om-admin-badge">
                    {p.active ? "active" : "inactive"}
                  </span>
                </td>
                <td style={{ padding: 4, textAlign: "right" }}>
                  <button
                    type="button"
                    className="om-admin-btn"
                    onClick={() => void toggle(p)}
                  >
                    {p.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
            {providers.length === 0 && (
              <tr>
                <td className="om-admin-muted" style={{ padding: 8 }}>
                  No providers yet, add your first courier above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
