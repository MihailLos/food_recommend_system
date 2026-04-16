import React from "react";
import { ALL_COLUMNS } from "../config/column";

export default function SortControl({ sort, onChange }) {
  const { key, dir } = sort;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <select
        value={key}
        onChange={(e) => onChange({ key: e.target.value, dir })}
        style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6 }}
      >
        <option value="name">Продукт (А→Я)</option>
        {ALL_COLUMNS.filter(c => c.key !== "name").map(c => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </select>
      <button
        onClick={() => onChange({ key, dir: dir === "asc" ? "desc" : "asc" })}
        style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}
        title="Сменить направление"
      >
        {dir === "asc" ? "▲" : "▼"}
      </button>
    </div>
  );
}
