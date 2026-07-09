import React from "react";
import RetailProductCard from "./RetailProductCard";

export default function RetailProductList({ products, onEdit, onDelete }) {
  if (!products.length) {
    return (
      <div
        style={{
          border: "1px dashed #ccd5df",
          borderRadius: 14,
          padding: 20,
          background: "#fff",
          color: "#666",
          lineHeight: 1.6,
        }}
      >
        Пока нет магазинных продуктов. Добавь первый продукт вручную, заполни состав и пищевую ценность,
        после чего он сможет участвовать в рекомендациях.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {products.map((product) => (
        <RetailProductCard
          key={product.id}
          product={product}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
