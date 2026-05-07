import React, { useState } from "react";
import ProductsPage from "./components/ProductsPage";
import ConsumerPage from "./components/ConsumerModule/ConsumerPage";
import "./styles/header.css";

const tabBtn = (active) => ({
  padding: "10px 12px",
  border: "1px solid #ddd",
  background: active ? "#fff" : "#f6f7f9",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: active ? 700 : 500,
});

export default function App() {
  const [tab, setTab] = useState("catalog"); // catalog | consumer

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f9" }}>
      {/* Верхние вкладки */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#f6f7f9",
          borderBottom: "1px solid #eee",
          padding: 12,
          display: "flex",
          gap: 8,
        }}
      >
        <button style={tabBtn(tab === "catalog")} onClick={() => setTab("catalog")}>
          📚 Справочник хим. состава пищевых продуктов
        </button>
        <button style={tabBtn(tab === "consumer")} onClick={() => setTab("consumer")}>
          🧑‍⚕️ Модуль потребителя
        </button>
      </div>

      {/* Контент */}
      {tab === "catalog" ? <ProductsPage /> : <ConsumerPage />}
    </div>
  );
}
