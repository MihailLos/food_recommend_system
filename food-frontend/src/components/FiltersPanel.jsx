import React from "react";

export default function FiltersPanel({ filters, onChange, types, visibleColumns }) {
  const reset = () => onChange({}); // полный сброс

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>Фильтры</div>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "6px 10px",
            border: "1px solid #ddd",
            background: "#fff",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
          }}
          title="Сбросить все фильтры"
        >
          Сбросить фильтры
        </button>
      </div>

      {/* Фильтр по группе продукта */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#666" }}>Группа продукта</div>
        <select
          value={filters.typeId || ""}
          onChange={(e) => onChange({ ...filters, typeId: e.target.value || null })}
          style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
        >
          <option value="">Все</option>
          {types.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Числовые фильтры только для отображаемых веществ */}
      {visibleColumns.filter((column) => column.type === "number").map(col => (
        <div key={col.key} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>{col.label}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="number"
              step="any"
              value={(filters[col.key]?.min ?? "")}
              onChange={(e) => onChange({
                ...filters,
                [col.key]: { ...filters[col.key], min: e.target.value === "" ? null : Number(e.target.value) }
              })}
              placeholder="мин"
              style={{ width: "50%", padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
            />
            <input
              type="number"
              step="any"
              value={(filters[col.key]?.max ?? "")}
              onChange={(e) => onChange({
                ...filters,
                [col.key]: { ...filters[col.key], max: e.target.value === "" ? null : Number(e.target.value) }
              })}
              placeholder="макс"
              style={{ width: "50%", padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
