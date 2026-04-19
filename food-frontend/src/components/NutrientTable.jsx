import React, { useMemo, useState } from "react";
import { fmt, parseRuNumber } from "../utils/number";
import { ALL_COLUMNS, COLUMN_GROUPS } from "../config/column";

const th = { padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #eee", whiteSpace: "nowrap", position: "sticky", top: 0, background: "#fafafa", zIndex: 1 };
const td = { padding: "8px 12px", borderBottom: "1px solid #f3f3f3", whiteSpace: "nowrap" };
const btn = { padding: "6px 10px", border: "1px solid #ddd", background: "#fff", borderRadius: 6, cursor: "pointer" };

function Chevron({ open }) {
  return <span style={{ fontSize: 12 }}>{open ? "▼" : "►"}</span>;
}

export default function NutrientTable({ items, columns, onSaveRow = async () => {} }) {
  // columns — это «видимые пользователем» столбцы (из ColumnPicker)
  // группами будем управлять локально
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(COLUMN_GROUPS.map(g => [g.id, false]))
  );

  if (process.env.NODE_ENV !== "production") {
    const ids = items.map(x => x?.id);
    const uniq = new Set(ids);
    if (ids.length !== uniq.size) {
      console.warn("NutrientTable: duplicate row ids", { total: ids.length, uniq: uniq.size });
    }
    if (ids.some(id => id == null)) {
      console.warn("NutrientTable: rows with null/undefined id exist");
    }
  }

  // вычислим: какие ключи вообще видимы (по ColumnPicker)
  const visibleKeys = useMemo(() => new Set(columns.map(c => c.key)), [columns]);

  // состав групп с учётом выбранных пользователем столбцов
  const groups = useMemo(() => {
    return COLUMN_GROUPS.map(g => {
      const groupCols = g.keys.filter(k => visibleKeys.has(k));
      return { ...g, keys: groupCols };
    }).filter(g => g.keys.length > 0);
  }, [visibleKeys]);

  // колонка «Продукт» — всегда первая
  const nameColumn = ALL_COLUMNS.find(c => c.key === "name");

  const startEdit = (row) => {
    setEditingId(row.id);
    const d = {};
    // редактируем только видимые и раскрытые колонки + name
    d[nameColumn.key] = row[nameColumn.key] ?? "";
    for (const g of groups) if (openGroups[g.id]) {
      for (const key of g.keys) d[key] = row[key] ?? "";
    }
    setDraft(d);
  };

  const cancelEdit = () => { setEditingId(null); setDraft({}); };

  const saveEdit = async () => {
    const patch = {};
    for (const [key, val] of Object.entries(draft)) {
      if (key === "name") patch.name = val;
      else patch[key] = parseRuNumber(val);
    }
    await onSaveRow(editingId, patch);
    cancelEdit();
  };

  const toggleGroup = (id) => setOpenGroups(s => ({ ...s, [id]: !s[id] }));

  // строим список колонок к отрисовке: name + все раскрытые группы
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          {/* строка 1: кнопки-группы */}
          <tr>
            <th style={{ ...th, width: 140 }} /> {/* колонка кнопок */}
            <th style={th}>{nameColumn.label}</th>
            {groups.map(g => (
              <th
                key={g.id}
                colSpan={openGroups[g.id] ? Math.max(1, g.keys.length) : 1}
                style={{ ...th, textAlign: "center", cursor: "pointer", background: "#f3f5f7" }}
                onClick={() => toggleGroup(g.id)}
                title={g.label}
              >
                <Chevron open={openGroups[g.id]} /> {g.label}
              </th>
            ))}
          </tr>

          {/* строка 2: заголовки раскрытых столбцов (если группа свернута — один "пустой" заголовок) */}
          <tr>
          <th style={th} />
          <th style={th}>{nameColumn.label}</th>
          {groups.map(g => (
            openGroups[g.id]
              ? g.keys.map(key => {
                  const col = ALL_COLUMNS.find(c => c.key === key);
                  const label = col?.shortLabel || col?.label || key;
                  const title = col?.tooltip || col?.label || key;
                  return (
                    <th
                      key={`${g.id}:${key}`}
                      style={th}
                      title={title}
                    >
                      {label}
                    </th>
                  );
                })
              : (
                <th
                  key={`${g.id}:placeholder`}
                  style={{ ...th, color: "#999", fontWeight: 400 }}
                >
                  —
                </th>
              )
          ))}
        </tr>
        </thead>

        <tbody>
          {items.map(r => {
            const isEdit = editingId === r.id;

            return (
              <tr key={r.id}>
                {/* ячейка с кнопками */}
                <td style={{ ...td, minWidth: 140 }}>
	                  {!isEdit ? (
	                    <button type="button" style={btn} onClick={() => startEdit(r)} title="Изменить локально">
	                      ✏️ Изменить локально
	                    </button>
	                  ) : (
	                    <div style={{ display: "flex", gap: 6 }}>
	                      <button type="button" style={btn} onClick={saveEdit} title="Сохранить локально">💾 Сохранить локально</button>
	                      <button type="button" style={btn} onClick={cancelEdit} title="Отмена">↩︎ Отмена</button>
	                    </div>
	                  )}
                </td>

                {/* колонка «Продукт» */}
                <td style={td}>
                  {!isEdit ? (
                    <span>
                      {r.name}
                      {r.isComplex && (
                        <span
                          style={{ marginLeft: 6, cursor: "help" }}
                          title="Продукт общественного питания"
                          aria-label="Продукт общественного питания"
                        >
                          🍽️
                        </span>
                      )}
                      {r.isAllergen && (
                        <span
                          style={{ marginLeft: 6, cursor: "help" }}
                          title="Содержит аллерген(ы)"
                          aria-label="Содержит аллерген(ы)"
                        >
                          🦠
                        </span>
                      )}
                      {r.isChildAllowed && (
                        <span
                          style={{ marginLeft: 6, cursor: "help" }}
                          title="Может применяться при организации питания детей"
                          aria-label="Может применяться при организации питания детей"
                        >
                          👶
                        </span>
                      )}
                    </span>
                  ) : (
                    <input
                      type="text"
                      value={draft.name ?? ""}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      style={{ width: 220, padding: 6, border: "1px solid #ddd", borderRadius: 6 }}
                    />
                  )}
                </td>

                {/* группы */}
                {groups.map(g => (
                  openGroups[g.id]
                    ? g.keys.map(key => (
                        <td key={`${r.id}:${key}`} style={td}>
                          {!isEdit ? (
                            (() => {
                              const base = r[key];
                              const shown = base
                              return fmt(shown);
                            })()
                          ) : (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={draft[key] ?? ""}
                              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                              placeholder="число"
                              style={{ width: 100, padding: 6, border: "1px solid #ddd", borderRadius: 6 }}
                            />
                          )}
                        </td>

                      ))
                    : <td key={`${r.id}:${g.id}:placeholder`} style={{ ...td, color: "#999" }}>—</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
