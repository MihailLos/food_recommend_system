import React, { useEffect, useMemo, useState } from "react";
import { ALL_COLUMNS, COLUMN_GROUPS } from "../config/column";
import {
  createServerGroup,
  createServerProduct,
  createServerSubgroup,
  deleteServerProduct,
  fetchAllergens,
  fetchServerProduct,
  updateServerGroup,
  updateServerProduct,
  updateServerSubgroup,
} from "../api/adminCatalog";
import { normalizeProduct } from "../utils/normalize";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1400,
  background: "rgba(0,0,0,0.34)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const modalStyle = {
  width: "min(1040px, 100%)",
  maxHeight: "92dvh",
  overflow: "auto",
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 18px 46px rgba(0,0,0,0.22)",
  padding: 20,
};

const inputStyle = {
  width: "100%",
  border: "1px solid #d8ded8",
  borderRadius: 8,
  padding: "9px 10px",
  fontSize: 14,
  boxSizing: "border-box",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

function uniqById(items) {
  const map = new Map();
  for (const item of items) {
    if (item?.id != null) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function toText(value) {
  return value === null || value === undefined ? "" : String(value);
}

function buildEmptyProductForm() {
  const form = {
    name: "",
    subtypeId: "",
    isComplex: false,
    isChildAllowed: true,
    allergenIds: [],
  };
  for (const column of ALL_COLUMNS) {
    if (column.type === "number") form[column.key] = "";
  }
  return form;
}

function productToForm(product) {
  const form = buildEmptyProductForm();
  form.name = product?.name || "";
  form.subtypeId = product?.subtypeId || "";
  form.isComplex = Boolean(product?.isComplex);
  form.isChildAllowed = Boolean(product?.isChildAllowed);
  form.allergenIds = Array.isArray(product?.allergenIds)
    ? product.allergenIds
    : (product?.allergens || []).map((item) => item.id).filter(Boolean);
  for (const column of ALL_COLUMNS) {
    if (column.type === "number") form[column.key] = toText(product?.[column.key]);
  }
  return form;
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#3f463f" }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      className="btn"
      onClick={onClick}
      style={{
        borderColor: active ? "#2e7d32" : undefined,
        background: active ? "rgba(46,125,50,0.09)" : undefined,
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}

function ProductPicker({ products, groups, subgroups, selectedId, onSelect }) {
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState("");
  const [subgroupId, setSubgroupId] = useState("");

  const availableSubgroups = useMemo(() => {
    if (!groupId) return subgroups;
    return subgroups.filter((item) => String(item.typeId) === String(groupId));
  }, [groupId, subgroups]);

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((item) => !groupId || String(item.typeId) === String(groupId))
      .filter((item) => !subgroupId || String(item.subtypeId) === String(subgroupId))
      .filter((item) => !q || String(item.name || "").toLowerCase().includes(q))
      .slice(0, 80);
  }, [products, groupId, subgroupId, query]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={gridStyle}>
        <Field label="Группа">
          <select style={inputStyle} value={groupId} onChange={(e) => { setGroupId(e.target.value); setSubgroupId(""); }}>
            <option value="">Все группы</option>
            {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Подгруппа">
          <select style={inputStyle} value={subgroupId} onChange={(e) => setSubgroupId(e.target.value)}>
            <option value="">Все подгруппы</option>
            {availableSubgroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Поиск продукта">
          <input style={inputStyle} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Введите часть названия" />
        </Field>
      </div>
      <div style={{ border: "1px solid #e2e7e1", borderRadius: 10, maxHeight: 260, overflow: "auto" }}>
        {visibleProducts.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            style={{
              width: "100%",
              textAlign: "left",
              border: 0,
              borderBottom: "1px solid #eef1ee",
              background: String(selectedId) === String(item.id) ? "#edf6ed" : "#fff",
              padding: "10px 12px",
              cursor: "pointer",
            }}
          >
            <strong>{item.name}</strong>
            <div style={{ color: "#687268", fontSize: 12 }}>
              {item.typeName} / {item.subtypeName}
            </div>
          </button>
        ))}
        {!visibleProducts.length && <div style={{ padding: 12, color: "#777" }}>Продукты не найдены.</div>}
      </div>
    </div>
  );
}

function ProductForm({ form, setForm, groups, subgroups, allergens }) {
  const selectedGroupId = useMemo(() => {
    const subgroup = subgroups.find((item) => String(item.id) === String(form.subtypeId));
    return subgroup?.typeId || "";
  }, [form.subtypeId, subgroups]);

  const [groupId, setGroupId] = useState(selectedGroupId);

  useEffect(() => {
    setGroupId(selectedGroupId);
  }, [selectedGroupId]);

  const availableSubgroups = groupId
    ? subgroups.filter((item) => String(item.typeId) === String(groupId))
    : subgroups;

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const toggleAllergen = (id) => {
    setForm((prev) => {
      const next = new Set(prev.allergenIds || []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, allergenIds: Array.from(next) };
    });
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={gridStyle}>
        <Field label="Название продукта">
          <input style={inputStyle} value={form.name} onChange={(e) => update("name", e.target.value)} />
        </Field>
        <Field label="Группа">
          <select
            style={inputStyle}
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              update("subtypeId", "");
            }}
          >
            <option value="">Выберите группу</option>
            {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Подгруппа">
          <select style={inputStyle} value={form.subtypeId} onChange={(e) => update("subtypeId", e.target.value)}>
            <option value="">Выберите подгруппу</option>
            {availableSubgroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={form.isComplex} onChange={(e) => update("isComplex", e.target.checked)} />
        Продукт общественного питания
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={form.isChildAllowed} onChange={(e) => update("isChildAllowed", e.target.checked)} />
        Подходит для детского питания
      </label>
      <section style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Аллергены продукта</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {allergens.map((item) => (
            <label key={item.id} style={{ border: "1px solid #dfe5dc", borderRadius: 999, padding: "6px 10px", background: "#fff" }}>
              <input
                type="checkbox"
                checked={(form.allergenIds || []).includes(item.id)}
                onChange={() => toggleAllergen(item.id)}
                style={{ marginRight: 6 }}
              />
              {item.name}
            </label>
          ))}
        </div>
      </section>
      <section style={{ display: "grid", gap: 14 }}>
        <div style={{ fontWeight: 800 }}>Пищевые вещества</div>
        {COLUMN_GROUPS.map((group) => (
          <div key={group.id} style={{ border: "1px solid #edf0ed", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 800 }}>{group.label}</div>
            <div style={gridStyle}>
              {group.keys.map((key) => {
                const column = ALL_COLUMNS.find((item) => item.key === key);
                if (!column) return null;
                return (
                  <Field key={key} label={column.label}>
                    <input
                      style={inputStyle}
                      type="number"
                      step="any"
                      value={form[key] ?? ""}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  </Field>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function AdminCatalogModal({ mode, allItems, onClose, onDone }) {
  const isAddMode = mode === "add";
  const isEditMode = mode === "edit";
  const [activeTab, setActiveTab] = useState(isAddMode ? "group" : isEditMode ? "group" : "product");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [allergens, setAllergens] = useState([]);

  const groups = useMemo(() => uniqById(allItems.map((item) => ({ id: item.typeId, name: item.typeName }))).sort((a, b) => String(a.name).localeCompare(String(b.name), "ru")), [allItems]);
  const subgroups = useMemo(() => uniqById(allItems.map((item) => ({ id: item.subtypeId, name: item.subtypeName, typeId: item.typeId }))).sort((a, b) => String(a.name).localeCompare(String(b.name), "ru")), [allItems]);

  const [newGroupName, setNewGroupName] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editGroupName, setEditGroupName] = useState("");
  const [newSubgroupName, setNewSubgroupName] = useState("");
  const [newSubgroupGroupId, setNewSubgroupGroupId] = useState("");
  const [editSubgroupId, setEditSubgroupId] = useState("");
  const [editSubgroupName, setEditSubgroupName] = useState("");
  const [editSubgroupGroupId, setEditSubgroupGroupId] = useState("");
  const [productForm, setProductForm] = useState(buildEmptyProductForm);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllergens()
      .then((rows) => { if (!cancelled) setAllergens(rows || []); })
      .catch(() => { if (!cancelled) setAllergens([]); });
    return () => { cancelled = true; };
  }, []);

  const loadProduct = async (item) => {
    setSelectedProduct(item);
    setError("");
    try {
      setBusy(true);
      const raw = await fetchServerProduct(item.id);
      const normalized = normalizeProduct(raw);
      normalized.allergenIds = raw.allergen_ids || [];
      setProductForm(productToForm(normalized));
    } catch (e) {
      setProductForm(productToForm(item));
      setError(e?.response?.data?.detail || "Не удалось загрузить серверные данные продукта.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError("");
    try {
      setBusy(true);
      if (mode === "add" && activeTab === "group") {
        if (!window.confirm("Добавить новую группу в серверную базу? Изменение увидят все пользователи после обновления локального справочника.")) return;
        await createServerGroup({ name: newGroupName.trim() });
        onDone("Группа добавлена в серверную базу.");
        return;
      }
      if (mode === "add" && activeTab === "subgroup") {
        if (!window.confirm("Добавить новую подгруппу в серверную базу? Проверьте выбранную группу.")) return;
        await createServerSubgroup({ name: newSubgroupName.trim(), product_type: Number(newSubgroupGroupId) });
        onDone("Подгруппа добавлена в серверную базу.");
        return;
      }
      if (mode === "add" && activeTab === "product") {
        if (!window.confirm("Добавить продукт и пищевую ценность в серверную базу? Проверьте источник и единицы измерения значений.")) return;
        await createServerProduct(productForm);
        onDone("Продукт добавлен в серверную базу.");
        return;
      }
      if (mode === "edit" && activeTab === "group") {
        if (!window.confirm("Изменить название группы в серверной базе?")) return;
        await updateServerGroup(editGroupId, { name: editGroupName.trim() });
        onDone("Название группы изменено.");
        return;
      }
      if (mode === "edit" && activeTab === "subgroup") {
        if (!window.confirm("Изменить подгруппу в серверной базе?")) return;
        await updateServerSubgroup(editSubgroupId, { name: editSubgroupName.trim(), product_type: Number(editSubgroupGroupId) });
        onDone("Подгруппа изменена.");
        return;
      }
      if (mode === "edit" && activeTab === "product") {
        if (!selectedProduct?.id) throw new Error("Выберите продукт.");
        if (!window.confirm("Изменить продукт и пищевую ценность в серверной базе? Проверьте источник и единицы измерения значений.")) return;
        await updateServerProduct(selectedProduct.id, productForm);
        onDone("Данные продукта изменены.");
        return;
      }
      if (mode === "delete") {
        if (!selectedProduct?.id) throw new Error("Выберите продукт.");
        if (!window.confirm(`Удалить продукт "${selectedProduct.name}" из серверной базы? Если продукт связан с магазинными продуктами, сервер запретит удаление.`)) return;
        await deleteServerProduct(selectedProduct.id);
        onDone("Продукт удален из серверной базы.");
      }
    } catch (e) {
      const data = e?.response?.data;
      const blockers = Array.isArray(data?.blockers) ? ` ${data.blockers.join("; ")}` : "";
      setError(data?.detail ? `${data.detail}${blockers}` : e?.message || "Не удалось выполнить серверное изменение.");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "add"
    ? "Добавить в серверную базу данных"
    : mode === "edit"
      ? "Изменить серверную базу данных"
      : "Удалить продукт из базы данных";

  return (
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="btn" onClick={onClose}>Закрыть</button>
        </div>
        {mode !== "delete" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <TabButton active={activeTab === "group"} onClick={() => setActiveTab("group")}>
              {mode === "add" ? "Добавить группу" : "Изменить название группы"}
            </TabButton>
            <TabButton active={activeTab === "subgroup"} onClick={() => setActiveTab("subgroup")}>
              {mode === "add" ? "Добавить подгруппу" : "Изменить название подгруппы"}
            </TabButton>
            <TabButton active={activeTab === "product"} onClick={() => setActiveTab("product")}>
              {mode === "add" ? "Добавить продукт" : "Изменить данные продукта"}
            </TabButton>
          </div>
        )}
        {error && <div style={{ color: "crimson", marginBottom: 12 }}>{error}</div>}
        {mode === "add" && activeTab === "group" && (
          <Field label="Название новой группы">
            <input style={inputStyle} value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
          </Field>
        )}
        {mode === "edit" && activeTab === "group" && (
          <div style={gridStyle}>
            <Field label="Группа">
              <select
                style={inputStyle}
                value={editGroupId}
                onChange={(e) => {
                  setEditGroupId(e.target.value);
                  setEditGroupName(groups.find((item) => String(item.id) === e.target.value)?.name || "");
                }}
              >
                <option value="">Выберите группу</option>
                {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Новое название">
              <input style={inputStyle} value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} />
            </Field>
          </div>
        )}
        {mode === "add" && activeTab === "subgroup" && (
          <div style={gridStyle}>
            <Field label="Группа">
              <select style={inputStyle} value={newSubgroupGroupId} onChange={(e) => setNewSubgroupGroupId(e.target.value)}>
                <option value="">Выберите группу</option>
                {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Название новой подгруппы">
              <input style={inputStyle} value={newSubgroupName} onChange={(e) => setNewSubgroupName(e.target.value)} />
            </Field>
          </div>
        )}
        {mode === "edit" && activeTab === "subgroup" && (
          <div style={gridStyle}>
            <Field label="Подгруппа">
              <select
                style={inputStyle}
                value={editSubgroupId}
                onChange={(e) => {
                  const subgroup = subgroups.find((item) => String(item.id) === e.target.value);
                  setEditSubgroupId(e.target.value);
                  setEditSubgroupName(subgroup?.name || "");
                  setEditSubgroupGroupId(subgroup?.typeId || "");
                }}
              >
                <option value="">Выберите подгруппу</option>
                {subgroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Группа">
              <select style={inputStyle} value={editSubgroupGroupId} onChange={(e) => setEditSubgroupGroupId(e.target.value)}>
                <option value="">Выберите группу</option>
                {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Новое название">
              <input style={inputStyle} value={editSubgroupName} onChange={(e) => setEditSubgroupName(e.target.value)} />
            </Field>
          </div>
        )}
        {mode === "add" && activeTab === "product" && (
          <ProductForm form={productForm} setForm={setProductForm} groups={groups} subgroups={subgroups} allergens={allergens} />
        )}
        {mode === "edit" && activeTab === "product" && (
          <div style={{ display: "grid", gap: 16 }}>
            <ProductPicker products={allItems} groups={groups} subgroups={subgroups} selectedId={selectedProduct?.id} onSelect={loadProduct} />
            {selectedProduct && <ProductForm form={productForm} setForm={setProductForm} groups={groups} subgroups={subgroups} allergens={allergens} />}
          </div>
        )}
        {mode === "delete" && (
          <ProductPicker products={allItems} groups={groups} subgroups={subgroups} selectedId={selectedProduct?.id} onSelect={setSelectedProduct} />
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="button" className={mode === "delete" ? "btn btn-danger" : "btn"} disabled={busy} onClick={submit}>
            {busy ? "Сохранение..." : mode === "delete" ? "Удалить" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
