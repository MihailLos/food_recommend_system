import React, { useMemo, useState } from "react";
import useRetailProducts from "./useRetailProducts";
import RetailProductList from "./RetailProductList";
import RetailProductModal from "./RetailProductModal";

const box = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
};

const input = {
  padding: 10,
  border: "1px solid #d9dfe6",
  borderRadius: 10,
  boxSizing: "border-box",
  width: "100%",
  font: "inherit",
};

const btn = {
  padding: "9px 12px",
  border: "1px solid #d5dbe3",
  background: "#fff",
  borderRadius: 10,
  cursor: "pointer",
  font: "inherit",
};

export default function RetailProductsPage({ catalogProducts }) {
  const { products, loading, error, saveProduct, removeProduct } = useRetailProducts();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingProduct, setEditingProduct] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    const needle = String(search || "").trim().toLowerCase();
    return products.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (needle && !String(item.name || "").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [products, search, statusFilter]);

  const stats = useMemo(() => {
    const total = products.length;
    const ready = products.filter((item) => item.is_ready_for_recommendation).length;
    const drafts = products.filter((item) => item.status === "draft").length;
    return { total, ready, drafts };
  }, [products]);

  const openCreate = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const openEdit = (product) => {
    setEditingProduct(product);
    setModalOpen(true);
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Удалить продукт «${product.name}»?`)) return;
    try {
      await removeProduct(product.id);
    } catch (requestError) {
      window.alert(
        requestError?.response?.data?.detail ||
        requestError?.response?.data?.error ||
        requestError?.message ||
        "Не удалось удалить продукт."
      );
    }
  };

  const handleSave = async (draft) => {
    await saveProduct(draft);
  };

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ ...box, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 22 }}>Каталог магазинных продуктов</div>
            <div style={{ color: "#555", lineHeight: 1.55, marginTop: 6 }}>
              Здесь хранятся ваши продукты с упаковки. Они не попадают в общий справочник и используются
              только в рамках вашего аккаунта.
            </div>
          </div>
          <button type="button" style={{ ...btn, borderColor: "#2e7d32", color: "#1f5f26", fontWeight: 700 }} onClick={openCreate}>
            Добавить продукт
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Всего продуктов</div>
            <div style={{ fontWeight: 700, fontSize: 22 }}>{stats.total}</div>
          </div>
          <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Готовы к рекомендациям</div>
            <div style={{ fontWeight: 700, fontSize: 22 }}>{stats.ready}</div>
          </div>
          <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Черновики</div>
            <div style={{ fontWeight: 700, fontSize: 22 }}>{stats.drafts}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 260px)", gap: 10 }}>
          <input
            style={input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию"
          />
          <select style={input} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Все статусы</option>
            <option value="ready">Готовы к рекомендациям</option>
            <option value="matched">Требуют уточнения</option>
            <option value="draft">Черновики</option>
          </select>
        </div>
      </div>

      {loading && <div style={{ padding: 16 }}>Загрузка…</div>}
      {error && <div style={{ color: "crimson" }}>{error}</div>}
      {!loading && !error && (
        <RetailProductList
          products={filteredProducts}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      <RetailProductModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialProduct={editingProduct}
        catalogProducts={catalogProducts}
      />
    </div>
  );
}
