import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchFoodProductSubtypes,
  fetchFoodProductTypes,
  fetchRecommendations,
} from "../../api/consumer";

const box = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
};

const btn = {
  padding: "8px 12px",
  border: "1px solid #ddd",
  background: "#fff",
  borderRadius: 8,
  cursor: "pointer",
};

const input = {
  padding: 8,
  border: "1px solid #ddd",
  borderRadius: 8,
};

const colorMeta = {
  green: {
    title: "Наиболее подходит",
    border: "#2e7d32",
    bg: "rgba(46,125,50,0.08)",
  },
  yellow: {
    title: "Подходит с ограничениями",
    border: "#f9a825",
    bg: "rgba(249,168,37,0.10)",
  },
  red: {
    title: "Не рекомендуется",
    border: "#e53935",
    bg: "rgba(229,57,53,0.10)",
  },
  blocked: {
    title: "Исключено",
    border: "#616161",
    bg: "rgba(97,97,97,0.10)",
  },
};

const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1000,
};

const modalCard = {
  width: "min(980px, 100%)",
  maxHeight: "88vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
  padding: 20,
  display: "grid",
  gap: 14,
};

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function fmt(value, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function fmtPct(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function score100(item) {
  const value = item?.score_components?.score_percent_100 ?? item?.explain?.score_percent_100;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function groupLabel(item) {
  const group = item?.explain?.comparison_group;
  if (group?.name) return group.name;
  return item?.product?.subtype_name || item?.product?.type_name || "—";
}

function SignalTable({ signals }) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return <div style={{ color: "#666", fontSize: 13 }}>Для этого продукта не удалось сформировать активные нутриенты расчёта.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["Нутриент", "Направление", "В 100 г", "Суточная цель", "Доля нормы", "Q", "A", "Источник"].map((head) => (
              <th key={head} style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 6px" }}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => (
            <tr key={signal.code}>
              <td style={{ borderBottom: "1px solid #f2f2f2", padding: "8px 6px" }}>
                <div style={{ fontWeight: 600 }}>{signal.ru_name}</div>
                <div style={{ color: "#666", fontSize: 12 }}>{signal.code}</div>
              </td>
              <td style={{ borderBottom: "1px solid #f2f2f2", padding: "8px 6px" }}>
                {signal.direction === "preferred" ? "Предпочтительный" : "Ограничиваемый"}
              </td>
              <td style={{ borderBottom: "1px solid #f2f2f2", padding: "8px 6px" }}>
                {fmt(signal.value_100g)} {signal.unit || ""}
              </td>
              <td style={{ borderBottom: "1px solid #f2f2f2", padding: "8px 6px" }}>
                {signal.target_day == null ? "—" : `${fmt(signal.target_day)} ${signal.unit || ""}`}
              </td>
              <td style={{ borderBottom: "1px solid #f2f2f2", padding: "8px 6px" }}>{fmtPct(signal.daily_share_pct)}</td>
              <td style={{ borderBottom: "1px solid #f2f2f2", padding: "8px 6px" }}>{fmt(signal.percentile_q, 3)}</td>
              <td style={{ borderBottom: "1px solid #f2f2f2", padding: "8px 6px" }}>{fmt(signal.correspondence_a, 3)}</td>
              <td style={{ borderBottom: "1px solid #f2f2f2", padding: "8px 6px" }}>
                {signal.source === "user" ? "Пользователь" : "Система"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailsModal({ item, onClose }) {
  if (!item) return null;
  const meta = colorMeta[item.color] || colorMeta.red;
  const explain = item.explain || {};
  const quartiles = explain.quartiles || {};
  const score = item.score_components || {};

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{item.product?.name}</div>
            <div style={{ color: "#666", marginTop: 4 }}>
              Подгруппа сравнения: {groupLabel(item)}
            </div>
          </div>
          <button type="button" style={btn} onClick={onClose}>Закрыть</button>
        </div>

        <div
          style={{
            border: `1px solid ${meta.border}`,
            background: meta.bg,
            borderRadius: 12,
            padding: 14,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18 }}>{item.class_label || meta.title}</div>
          <div style={{ color: "#444", lineHeight: 1.5 }}>
            {explain?.summary?.text_explanation || "Подробное пояснение отсутствует."}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <div style={{ ...box, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Итоговый балл</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {score.score_percent_100 == null ? "—" : `${score.score_percent_100.toFixed(1)} / 100`}
            </div>
            <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
              Это процентиль итогового индекса S среди аналогов своей подгруппы.
            </div>
          </div>

          <div style={{ ...box, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Индекс соответствия</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(score.index_s, 3)}</div>
            <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
              S = median(Aₙ)
            </div>
          </div>

          <div style={{ ...box, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Квартили подгруппы</div>
            <div>Qua1: {fmt(quartiles.qua1, 3)}</div>
            <div>Qua2: {fmt(quartiles.qua2, 3)}</div>
            <div>Qua3: {fmt(quartiles.qua3, 3)}</div>
          </div>
        </div>

        <div style={{ ...box, padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Ключевые причины рекомендации</div>
          <div>
            <strong>Сильные стороны:</strong>{" "}
            {Array.isArray(explain?.summary?.positive_reasons) && explain.summary.positive_reasons.length > 0
              ? explain.summary.positive_reasons.join("; ")
              : "не выделены"}
          </div>
          <div>
            <strong>Ограничивающие факторы:</strong>{" "}
            {Array.isArray(explain?.summary?.limiting_reasons) && explain.summary.limiting_reasons.length > 0
              ? explain.summary.limiting_reasons.join("; ")
              : "не выделены"}
          </div>
        </div>

        <div style={{ ...box, padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Активные нутриенты расчёта</div>
          <SignalTable signals={explain.signals || explain.base_signals || []} />
        </div>

        <div style={{ ...box, padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Формулы алгоритма</div>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>
            <div>Процентиль нутриента: {explain?.method?.percentile_formula || "—"}</div>
            <div>Для предпочтительных нутриентов: {explain?.method?.preferred_formula || "—"}</div>
            <div>Для ограничиваемых нутриентов: {explain?.method?.restricted_formula || "—"}</div>
            <div>Итоговый индекс: {explain?.method?.score_formula || "—"}</div>
            <div>Классификация: {explain?.method?.class_formula || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RecommendationsTab({ profileId }) {
  const [searchText, setSearchText] = useState("");
  const [typeId, setTypeId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");
  const [types, setTypes] = useState([]);
  const [subtypes, setSubtypes] = useState([]);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);

  const items = useMemo(() => normalizeList(payload?.items ?? payload), [payload]);
  const profileIdNum = useMemo(() => {
    const x = Number(profileId);
    return Number.isFinite(x) && x > 0 ? x : null;
  }, [profileId]);

  const filteredSubtypes = useMemo(() => {
    if (!typeId) return subtypes;
    return subtypes.filter((item) => Number(item.product_type) === Number(typeId));
  }, [subtypes, typeId]);

  const grouped = useMemo(() => {
    const map = { green: [], yellow: [], red: [], blocked: [] };
    for (const item of items) {
      const key = item?.color || "red";
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [items]);

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true);
    setError("");
    try {
      const [typesRaw, subtypesRaw] = await Promise.all([
        fetchFoodProductTypes(),
        fetchFoodProductSubtypes(),
      ]);
      setTypes(normalizeList(typesRaw));
      setSubtypes(normalizeList(subtypesRaw));
    } catch (e) {
      setError(e?.message || "Ошибка загрузки справочников.");
    } finally {
      setFiltersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  const load = useCallback(async () => {
    if (!profileIdNum) return;

    setLoading(true);
    setError("");
    try {
      const data = await fetchRecommendations({
        profileId: profileIdNum,
        mode: "catalog",
        q: searchText,
        typeId: typeId || null,
        subtypeId: subtypeId || null,
        limit: 300,
      });
      setPayload(data);
    } catch (e) {
      const detail =
        e?.response?.data?.error ||
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        "Ошибка загрузки рекомендаций.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, [profileIdNum, searchText, subtypeId, typeId]);

  const clearFilters = () => {
    setSearchText("");
    setTypeId("");
    setSubtypeId("");
    setPayload(null);
    setSelectedItem(null);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ ...box, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Рекомендации по продуктам</div>
        <div style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>
          В текущей версии алгоритм работает только в режиме просмотра продуктов. Каждый продукт оценивается
          на 100 г и сравнивается с аналогами своей подгруппы.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1.4fr) repeat(2, minmax(180px, 1fr)) auto auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <label>Поиск по названию</label>
            <input
              style={input}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Например: говядина"
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Группа</label>
            <select
              style={input}
              value={typeId}
              onChange={(e) => {
                setTypeId(e.target.value);
                setSubtypeId("");
              }}
            >
              <option value="">Все группы</option>
              {types.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Подгруппа</label>
            <select
              style={input}
              value={subtypeId}
              onChange={(e) => setSubtypeId(e.target.value)}
              disabled={!typeId}
            >
              <option value="">Все подгруппы</option>
              {filteredSubtypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <button type="button" style={{ ...btn, borderColor: "#2e7d32" }} onClick={load} disabled={loading || filtersLoading}>
            {loading ? "Загрузка..." : "Рассчитать"}
          </button>

          <button type="button" style={btn} onClick={clearFilters}>
            Сбросить
          </button>
        </div>

        {error && <div style={{ color: "crimson" }}>{error}</div>}
      </div>

      {items.length > 0 && (
        <div style={{ ...box, padding: 16, display: "grid", gap: 14 }}>
          <div style={{ fontWeight: 700 }}>
            Найдено продуктов: {items.length}
          </div>

          {Object.entries(grouped).map(([color, groupItems]) => {
            if (!groupItems.length) return null;
            const meta = colorMeta[color] || colorMeta.red;
            return (
              <div key={color} style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 700, color: meta.border }}>{meta.title}: {groupItems.length}</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {groupItems.map((item) => (
                    <div
                      key={item.product.id}
                      style={{
                        border: `1px solid ${meta.border}`,
                        background: meta.bg,
                        borderRadius: 12,
                        padding: 14,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.product.name}</div>
                          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                            {item.product.subtype_name || item.product.type_name || "—"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, color: "#666" }}>Балл среди аналогов</div>
                          <div style={{ fontSize: 20, fontWeight: 700 }}>
                            {score100(item) == null ? "—" : `${score100(item).toFixed(1)} / 100`}
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                        {item.explain?.summary?.text_explanation || item.reasons?.[0] || "Пояснение отсутствует."}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ color: "#555", fontSize: 12 }}>
                          Индекс S: {fmt(item.score_components?.index_s, 3)} · Qua1: {fmt(item.score_components?.qua1, 3)} · Qua3: {fmt(item.score_components?.qua3, 3)}
                        </div>
                        <button type="button" style={btn} onClick={() => setSelectedItem(item)}>
                          Подробно
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && items.length === 0 && payload && (
        <div style={{ ...box, padding: 16, color: "#666" }}>
          По выбранным фильтрам рекомендации не найдены.
        </div>
      )}

      {selectedItem && <DetailsModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
