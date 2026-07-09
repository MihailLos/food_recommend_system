import React from "react";

const btn = {
  padding: "8px 12px",
  border: "1px solid #ddd",
  background: "#fff",
  borderRadius: 8,
  cursor: "pointer",
};

const statusMeta = {
  ready: { label: "Готов к рекомендациям", bg: "rgba(46,125,50,0.12)", border: "#66a36f", color: "#1f5f26" },
  matched: { label: "Требует уточнения", bg: "rgba(240,178,75,0.14)", border: "#e0b14d", color: "#8a6d1d" },
  draft: { label: "Черновик", bg: "#f3f5f7", border: "#d6dce2", color: "#52606d" },
};

function fmt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number % 1 === 0 ? String(number) : number.toFixed(1);
}

export default function RetailProductCard({ product, onEdit, onDelete }) {
  const meta = statusMeta[product?.status] || statusMeta.draft;

  return (
    <div
      style={{
        border: "1px solid #e7eaee",
        borderRadius: 14,
        background: "#fff",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
        padding: 14,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.35 }}>
            {product?.name || "Без названия"}
            {product?.is_allergen && (
              <span
                style={{ marginLeft: 6, cursor: "help" }}
                title="Содержит аллерген(ы)"
                aria-label="Содержит аллерген(ы)"
              >
                🦠
              </span>
            )}
            {product?.is_child_allowed && (
              <span
                style={{ marginLeft: 6, cursor: "help" }}
                title="Может применяться при организации питания детей"
                aria-label="Может применяться при организации питания детей"
              >
                👶
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            {product?.related_food_product_name
              ? `Эталонный продукт: ${product.related_food_product_name}`
              : "Эталонный продукт пока не выбран"}
          </div>
        </div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: `1px solid ${meta.border}`,
            background: meta.bg,
            color: meta.color,
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {meta.label}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Энергетическая ценность</div>
          <div style={{ fontWeight: 700 }}>{fmt(product?.energy_kcal)} ккал</div>
        </div>
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Белки</div>
          <div style={{ fontWeight: 700 }}>{fmt(product?.protein_g)} г</div>
        </div>
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Жиры</div>
          <div style={{ fontWeight: 700 }}>{fmt(product?.fats_g)} г</div>
        </div>
        <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Углеводы</div>
          <div style={{ fontWeight: 700 }}>{fmt(product?.carbs_g)} г</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {product?.is_ready_for_recommendation && (
          <span style={{ padding: "5px 10px", borderRadius: 999, background: "rgba(46,125,50,0.09)", color: "#1f5f26", fontSize: 12 }}>
            Участвует в рекомендациях
          </span>
        )}
        {product?.nutrition_fill_mode && product?.nutrition_fill_mode !== "label_only" && (
          <span style={{ padding: "5px 10px", borderRadius: 999, background: "#f5f7fa", color: "#4a5560", fontSize: 12 }}>
            Часть нутриентов заполнена из эталона
          </span>
        )}
        {product?.is_allergen && (
          <span style={{ padding: "5px 10px", borderRadius: 999, background: "rgba(220,53,69,0.08)", color: "#a23442", fontSize: 12 }}>
            Есть аллергенные ограничения
          </span>
        )}
        {product?.is_child_allowed && (
          <span style={{ padding: "5px 10px", borderRadius: 999, background: "rgba(30,96,217,0.08)", color: "#1f3b67", fontSize: 12 }}>
            Подходит для детского питания
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={btn} onClick={() => onEdit(product)}>Редактировать</button>
        <button
          type="button"
          style={{ ...btn, borderColor: "#d87b7b", color: "#a33" }}
          onClick={() => onDelete(product)}
        >
          Удалить
        </button>
      </div>
    </div>
  );
}
