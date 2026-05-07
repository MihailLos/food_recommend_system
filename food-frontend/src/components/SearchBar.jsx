import React from "react";

export default function SearchBar({ value, onChange }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Поиск по названию продукта…"
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #d9d9d9",
        minWidth: 0,
        width: "100%",
        boxSizing: "border-box",
        outline: "none",
      }}
    />
  );
}
