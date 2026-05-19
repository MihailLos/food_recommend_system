import React, { useEffect, useMemo, useState } from "react";
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
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 640 : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
  const hasOpenGroups = Object.values(openGroups).some(Boolean);
  const mobileOpenGroups = isMobile && !hasOpenGroups
    ? { ...openGroups, macros: groups.some((g) => g.id === "macros") }
    : openGroups;

  // колонка «Продукт» — всегда первая
  const nameColumn = ALL_COLUMNS.find(c => c.key === "name");

  const startEdit = (row) => {
    setEditingId(row.id);
    const d = {};
    // редактируем только видимые и раскрытые колонки + name
    d[nameColumn.key] = row[nameColumn.key] ?? "";
    for (const g of groups) {
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

  if (isMobile) {
    return (
      <div style={{ display: "grid", gap: 10, padding: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {groups.map((g) => {
            const active = Boolean(mobileOpenGroups[g.id]);
            return (
              <button
                key={g.id}
                type="button"
                style={{
                  ...btn,
                  borderRadius: 999,
                  borderColor: active ? "#2e7d32" : "#ddd",
                  background: active ? "rgba(46,125,50,0.08)" : "#fff",
                  fontSize: 12,
                }}
                onClick={() => toggleGroup(g.id)}
              >
                <Chevron open={active} /> {g.label}
              </button>
            );
          })}
        </div>

        {items.map((r) => {
          const isEdit = editingId === r.id;
          return (
            <div
              key={r.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                background: "#fff",
                padding: 12,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, lineHeight: 1.35 }}>
                    {r.name}
                    {r.isComplex && <span title="Продукт общественного питания" style={{ marginLeft: 6 }}>🍽️</span>}
                    {r.isAllergen && <span title="Содержит аллерген(ы)" style={{ marginLeft: 6 }}>🦠</span>}
                    {r.isChildAllowed && <span title="Подходит для детского питания" style={{ marginLeft: 6 }}>👶</span>}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: "#888" }}>ID: {r.id}</div>
                </div>
                {!isEdit ? (
                  <button type="button" style={btn} onClick={() => startEdit(r)} title="Изменить локально" aria-label="Изменить локально">✏️</button>
                ) : (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" style={btn} onClick={saveEdit}>💾 Сохранить</button>
                    <button type="button" style={btn} onClick={cancelEdit}>↩︎ Отмена</button>
                  </div>
                )}
              </div>

              {groups.map((g) => {
                if (!mobileOpenGroups[g.id]) return null;
                return (
                  <div key={`${r.id}:${g.id}`} style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 600, color: "#444" }}>{g.label}</div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {g.keys.map((key) => {
                        const col = ALL_COLUMNS.find((c) => c.key === key);
                        return (
                          <div
                            key={`${r.id}:${key}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(0, 1fr) auto",
                              gap: 10,
                              padding: "6px 0",
                              borderBottom: "1px solid #f3f3f3",
                              alignItems: "center",
                            }}
                          >
                            <div style={{ color: "#555", fontSize: 13 }}>{col?.label || key}</div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>
                              {!isEdit ? (
                                fmt(r[key])
                              ) : (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={draft[key] ?? ""}
                                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                                  placeholder="число"
                                  style={{ width: 92, padding: 6, border: "1px solid #ddd", borderRadius: 6 }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  // строим список колонок к отрисовке: name + все раскрытые группы
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          {/* строка 1: кнопки-группы */}
          <tr>
            <th style={{ ...th, width: 72 }} /> {/* колонка кнопок */}
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
                <td style={{ ...td, minWidth: 72, width: 72 }}>
	                  {!isEdit ? (
	                    <button type="button" style={btn} onClick={() => startEdit(r)} title="Изменить локально" aria-label="Изменить локально">
	                      ✏️
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
                    <div>
                      <div>
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
                      </div>
                      <div style={{ marginTop: 2, fontSize: 12, color: "#888" }}>ID: {r.id}</div>
                    </div>
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
