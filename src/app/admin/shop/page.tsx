"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
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
      (c) => !form.tradeKey || c.trade_key === form.tradeKey
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
    action: "cancel" | "refund"
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
    const res = await api<{ product: CatalogProduct }>("/api/admin/shop/products", {
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
    });
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
    setPriceMajorEdit(
      price ? String(Number(price.amount_minor) / 100) : ""
    );
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
        Manage catalog, prices, stock & images in one place — then track retail
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
                    <th>Product</th>
                    <th>Trade</th>
                    <th>Status</th>
                    <th>Image</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                        <div className="om-admin-muted">{p.slug}</div>
                        {p.subtitle ? (
                          <div className="om-admin-muted">{p.subtitle}</div>
                        ) : null}
                      </td>
                      <td>{p.trade_key}</td>
                      <td>
                        <span className="om-admin-badge">{p.status}</span>
                      </td>
                      <td>
                        {p.primary_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img loading="lazy" decoding="async"
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
                          "—"
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
            <div className="om-admin-panel" style={{ marginTop: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h2 style={{ margin: 0 }}>Edit product</h2>
                <button
                  type="button"
                  className="om-admin-btn"
                  onClick={() => {
                    setEditId(null);
                    setEditDetail(null);
                  }}
                >
                  Close
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <input
                  className="om-admin-input"
                  value={String(editDetail.product.name || "")}
                  onChange={(e) =>
                    setEditDetail((d) =>
                      d
                        ? {
                            ...d,
                            product: { ...d.product, name: e.target.value },
                          }
                        : d
                    )
                  }
                />
                <input
                  className="om-admin-input"
                  value={String(editDetail.product.subtitle || "")}
                  onChange={(e) =>
                    setEditDetail((d) =>
                      d
                        ? {
                            ...d,
                            product: {
                              ...d.product,
                              subtitle: e.target.value,
                            },
                          }
                        : d
                    )
                  }
                  placeholder="Subtitle"
                />
                <select
                  className="om-admin-input"
                  value={String(editDetail.product.status || "active")}
                  onChange={(e) =>
                    setEditDetail((d) =>
                      d
                        ? {
                            ...d,
                            product: { ...d.product, status: e.target.value },
                          }
                        : d
                    )
                  }
                >
                  <option value="active">active</option>
                  <option value="draft">draft</option>
                  <option value="archived">archived</option>
                </select>
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
                        : d
                    )
                  }
                  placeholder="Description"
                  style={{ gridColumn: "1 / -1", minHeight: 64 }}
                />
              </div>
              <button
                type="button"
                className="om-admin-btn"
                style={{ marginTop: 8 }}
                disabled={busyId === editId}
                onClick={() => void saveProductMeta()}
              >
                Save strings / status
              </button>

              <h3 style={{ marginTop: 16 }}>Price (₦)</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="om-admin-input"
                  value={priceMajorEdit}
                  onChange={(e) => setPriceMajorEdit(e.target.value)}
                  placeholder="e.g. 28500"
                />
                <button
                  type="button"
                  className="om-admin-btn"
                  disabled={busyId === `price-${editId}`}
                  onClick={() => void savePrice()}
                >
                  Update price
                </button>
              </div>

              <h3 style={{ marginTop: 16 }}>Stock</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="om-admin-input"
                  value={stockEdit}
                  onChange={(e) => setStockEdit(e.target.value)}
                  placeholder="qty on hand"
                />
                <button
                  type="button"
                  className="om-admin-btn"
                  disabled={busyId === `stock-${editId}`}
                  onClick={() => void saveStock()}
                >
                  Update stock
                </button>
              </div>

              <h3 style={{ marginTop: 16 }}>Primary image</h3>
              {editDetail.product.primary_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async"
                  src={String(editDetail.product.primary_image_url)}
                  alt=""
                  width={96}
                  height={96}
                  style={{ objectFit: "cover", borderRadius: 8 }}
                />
              ) : (
                <p className="om-admin-muted">No image yet</p>
              )}
              <div style={{ marginTop: 8 }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => onFile(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  className="om-admin-btn"
                  style={{ marginLeft: 8 }}
                  disabled={!imageDataUrl || busyId === `img-${editId}`}
                  onClick={() => void uploadImage()}
                >
                  Upload image
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
                    <img loading="lazy" decoding="async"
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
          ) : null}
        </>
      ) : ordersLoading ? (
        <p className="om-admin-muted">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="om-admin-muted">No shop orders yet.</p>
      ) : (
        <div className="om-admin-panel">
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
                        "en-NG"
                      )}
                    </td>
                    <td>
                      <div>{o.delivery?.status || "—"}</div>
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
                              void runOrderAction(
                                o.id,
                                o.status,
                                "cancel"
                              )
                            }
                          >
                            Cancel (unpaid)
                          </button>
                        ) : null}
                        {o.status === "paid" ||
                        o.status === "fulfilling" ? (
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
    </AdminShell>
  );
}
