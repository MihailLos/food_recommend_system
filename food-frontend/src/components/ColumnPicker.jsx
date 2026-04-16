import React from "react";
import { ALL_COLUMNS, COLUMN_GROUPS } from "../config/column";

export default function ColumnPicker({ visibleKeys, onToggle, onSelectAll, onClearAll }) {
  // справочник key → column meta
  const byKey = React.useMemo(() => {
    const m = new Map();
    ALL_COLUMNS.forEach(c => m.set(c.key, c));
    return m;
  }, []);

  const baseSection = {
    id: "base",
    label: "Общее",
    keys: ["name"], // колонка «Продукт» — базовая
  };

  return (
    <div style={{ padding: 12, borderBottom: "1px solid #eee" }}>
      {/* Заголовок и кнопки управления */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 600 }}>Отображаемые столбцы</div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={onSelectAll}
            style={btnStyle}
            title="Показать все столбцы"
          >
            Оставить все
          </button>

          <button
            type="button"
            onClick={onClearAll}
            style={{ ...btnStyle, borderColor: "#f4b0b0", color: "#c62828" }}
            title="Скрыть все столбцы"
          >
            Убрать все
          </button>
        </div>
      </div>

      {/* Секция: Общее */}
      <Section
        title={baseSection.label}
        keys={baseSection.keys}
        byKey={byKey}
        visibleKeys={visibleKeys}
        onToggle={onToggle}
      />

      {/* Секции по категориям */}
      {COLUMN_GROUPS.map(group => (
        <Section
          key={group.id}
          title={group.label}
          keys={group.keys}
          byKey={byKey}
          visibleKeys={visibleKeys}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

// Общий стиль кнопок
const btnStyle = {
  padding: "6px 10px",
  border: "1px solid #ddd",
  background: "#fff",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
};

// Отдельная секция чекбоксов
function Section({ title, keys, byKey, visibleKeys, onToggle }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: "#666", margin: "6px 0" }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {keys.map(k => {
          const col = byKey.get(k);
          if (!col) return null;
          const checked = visibleKeys.has(k);
          return (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 8 }} title={col.tooltip || col.label}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(k)}
              />
              <span>{col.shortLabel || col.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
