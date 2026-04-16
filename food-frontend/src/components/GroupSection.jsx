import React from "react";
import NutrientTable from "./NutrientTable";

export default function GroupSection({ title, items, columns, onSaveRow }) {
  return (
    <section
      style={{
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
        marginBottom: 24,
      }}
    >
      <header
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #eee",
        }}
      >
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div style={{ fontSize: 12, color: "#666" }}>Найдено: {items.length}</div>
      </header>

      {/* 🔹 пояснение перед таблицей */}
      <div
        style={{
          padding: "10px 20px",
          fontSize: 13,
          color: "#666",
          fontStyle: "italic",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        Пищевая ценность указана на 100 г продукта
      </div>

      <NutrientTable items={items} columns={columns} onSaveRow={onSaveRow} />
    </section>
  );
}
