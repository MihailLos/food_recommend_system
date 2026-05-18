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
  boxSizing: "border-box",
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

function getRecommendationErrorDetail(error) {
  const detail =
    error?.response?.data?.error ||
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.message ||
    "Ошибка загрузки рекомендаций.";

  if (String(detail).includes("активная цель питания")) {
    return "Сначала создайте и активируйте цель питания для выбранного профиля.";
  }

  return detail;
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

function getSubtypeTypeId(item) {
  const raw =
    item?.product_type?.id ??
    item?.product_type_id ??
    item?.product_type ??
    item?.type?.id ??
    item?.type_id ??
    null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function getAlternativeItems(item, allItems) {
  if (!item || !Array.isArray(allItems)) return [];
  const currentSubtypeId = item?.product?.subtype_id;
  const currentProductId = item?.product?.id;

  return allItems
    .filter((candidate) =>
      candidate?.product?.id !== currentProductId &&
      candidate?.color === "green" &&
      candidate?.product?.subtype_id === currentSubtypeId
    )
    .sort((a, b) => (score100(b) || 0) - (score100(a) || 0))
    .slice(0, 3);
}

function ReasonList({ title, items, emptyText = "не выделены" }) {
  return (
    <div>
      <strong>{title}</strong>
      {Array.isArray(items) && items.length > 0 ? (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#444", lineHeight: 1.55 }}>
          {items.map((reason, index) => (
            <li key={`${title}-${index}`}>{reason}</li>
          ))}
        </ul>
      ) : (
        <div style={{ marginTop: 6, color: "#666", lineHeight: 1.5 }}>{emptyText}</div>
      )}
    </div>
  );
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
            {["Нутриент", "Роль в рекомендации", "В 100 г", "Суточная цель", "Доля нормы", "Положение среди аналогов", "Частная оценка", "Источник"].map((head) => (
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
  const positiveReasons = Array.isArray(explain?.summary?.positive_reasons) ? explain.summary.positive_reasons : [];
  const limitingReasons = Array.isArray(explain?.summary?.limiting_reasons) ? explain.summary.limiting_reasons : [];
  const classText = item.class_label || meta.title;

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} className="app-modal-shell" onClick={(e) => e.stopPropagation()}>
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
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18 }}>{classText}</div>
          <div style={{ color: "#444", lineHeight: 1.5 }}>
            Продукт получил класс «{classText}» после сравнения с аналогами своей подгруппы.
            Ниже показаны ключевые сильные стороны и ограничивающие факторы в раздельных списках.
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
              Это положение продукта среди аналогов своей подгруппы по итоговой оценке.
            </div>
          </div>

          <div style={{ ...box, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Итоговая оценка продукта</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(score.index_s, 3)}</div>
            <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
              Устойчивый итог по всем активным нутриентам продукта.
            </div>
          </div>

          <div style={{ ...box, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Границы классов в подгруппе</div>
            <div>Нижняя граница: {fmt(quartiles.qua1, 3)}</div>
            <div>Срединная граница: {fmt(quartiles.qua2, 3)}</div>
            <div>Верхняя граница: {fmt(quartiles.qua3, 3)}</div>
          </div>
        </div>

        <div style={{ ...box, padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Ключевые причины рекомендации</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            <ReasonList title="Сильные стороны" items={positiveReasons} />
            <ReasonList title="Ограничивающие факторы" items={limitingReasons} />
          </div>
        </div>

        <details style={{ ...box, padding: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Показать детали расчёта</summary>
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Активные нутриенты расчёта</div>
              <SignalTable signals={explain.signals || explain.base_signals || []} />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Технические детали расчёта</div>
              <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                <div>Положение по нутриенту среди аналогов: {explain?.method?.percentile_formula || "—"}</div>
                <div>Преобразование для предпочтительных нутриентов: {explain?.method?.preferred_formula || "—"}</div>
                <div>Преобразование для ограничиваемых нутриентов: {explain?.method?.restricted_formula || "—"}</div>
                <div>Итоговая оценка продукта: {explain?.method?.score_formula || "—"}</div>
                <div>Правило присвоения класса: {explain?.method?.class_formula || "—"}</div>
              </div>
            </div>
          </div>
        </details>
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
  const [hasCalculated, setHasCalculated] = useState(false);

  const items = useMemo(() => normalizeList(payload?.items ?? payload), [payload]);
  const profileIdNum = useMemo(() => {
    const x = Number(profileId);
    return Number.isFinite(x) && x > 0 ? x : null;
  }, [profileId]);

  const filteredSubtypes = useMemo(() => {
    if (!typeId) return subtypes;
    return subtypes.filter((item) => getSubtypeTypeId(item) === Number(typeId));
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

  const enrichedItems = useMemo(
    () => items.map((item) => ({ ...item, explain: { ...(item.explain || {}), all_items_context: items } })),
    [items]
  );

  const stats = useMemo(() => {
    const counts = {
      green: grouped.green.length,
      yellow: grouped.yellow.length,
      red: grouped.red.length,
      blocked: grouped.blocked.length,
    };

    const subtypeMap = new Map();
    const groupPreferredMap = new Map();

    for (const item of items) {
      const subtypeName = item?.product?.subtype_name || "Без подгруппы";
      const typeName = item?.product?.type_name || "Без группы";

      const subtypeEntry = subtypeMap.get(subtypeName) || { green: 0, total: 0 };
      subtypeEntry.total += 1;
      if (item.color === "green") subtypeEntry.green += 1;
      subtypeMap.set(subtypeName, subtypeEntry);

      const groupEntry = groupPreferredMap.get(typeName) || { green: 0, total: 0 };
      groupEntry.total += 1;
      if (item.color === "green") groupEntry.green += 1;
      groupPreferredMap.set(typeName, groupEntry);
    }

    const topSubtypes = Array.from(subtypeMap.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.green - a.green || b.total - a.total || a.name.localeCompare(b.name, "ru"))
      .slice(0, 3);

    const topGroupsByPreferred = Array.from(groupPreferredMap.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.green - a.green || b.total - a.total || a.name.localeCompare(b.name, "ru"))
      .slice(0, 3);

    return { counts, topSubtypes, topGroupsByPreferred };
  }, [grouped, items]);

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

  useEffect(() => {
    if (!profileIdNum) return;
    setHasCalculated(false);
    setSearchText("");
    setTypeId("");
    setSubtypeId("");
  }, [profileIdNum]);

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
      setHasCalculated(true);
    } catch (e) {
      setPayload(null);
      setError(getRecommendationErrorDetail(e));
    } finally {
      setLoading(false);
    }
  }, [profileIdNum, searchText, subtypeId, typeId]);

  const clearFilters = () => {
    setSearchText("");
    setTypeId("");
    setSubtypeId("");
    setSelectedItem(null);
    setHasCalculated(false);
    loadOverview();
  };

  const loadOverview = useCallback(async () => {
    if (!profileIdNum) return;

    setLoading(true);
    setError("");
    try {
      const data = await fetchRecommendations({
        profileId: profileIdNum,
        mode: "catalog",
        q: "",
        typeId: null,
        subtypeId: null,
        limit: 5000,
      });
      setPayload(data);
    } catch (e) {
      setPayload(null);
      setError(getRecommendationErrorDetail(e));
    } finally {
      setLoading(false);
    }
  }, [profileIdNum]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const statsTitle = hasCalculated ? "Распределение по классам" : "Обзор по всем группам и подгруппам";
  const showItems = hasCalculated && items.length > 0;
  const showEmptyResult = hasCalculated && !loading && !error && items.length === 0 && payload;

  const statsSourceLabel = hasCalculated
    ? "Статистика по текущей выборке."
    : "Статистика по всем доступным группам и подгруппам для активного профиля.";

  const topPreferredLabel = "Топ-3 подгруппы по наиболее предпочтительным продуктам";
  const topGroupPreferredLabel = "Топ-3 группы по наиболее предпочтительным продуктам";
  const hasSubtypeOptions = filteredSubtypes.length > 0;

  const resultCountLabel = hasCalculated
    ? `Найдено продуктов: ${items.length}`
    : `Для обзора учтены все ${items.length} продуктов текущего профиля`;

  const showSubtypeStats = !subtypeId;
  const showGroupStats = !typeId;

  return (
    <div className="app-page">
      <div style={{ ...box, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Рекомендации по продуктам</div>
        <div style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>
          В текущей версии алгоритм работает только в режиме просмотра продуктов. Каждый продукт оценивается
          на 100 г и сравнивается с аналогами своей подгруппы.
        </div>

        <div className="app-filters-grid">
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
              disabled={!typeId || !hasSubtypeOptions}
            >
              <option value="">
                {!typeId
                  ? "Сначала выберите группу"
                  : hasSubtypeOptions
                    ? "Все подгруппы"
                    : "Для выбранной группы подгруппы не заданы"}
              </option>
              {filteredSubtypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {typeId && !hasSubtypeOptions && (
              <div style={{ fontSize: 12, color: "#666", lineHeight: 1.4 }}>
                Для этой группы в справочнике нет отдельных подгрупп: продукты относятся напрямую к группе.
              </div>
            )}
          </div>

          <div className="app-header-actions">
            <button type="button" style={{ ...btn, borderColor: "#2e7d32" }} onClick={load} disabled={loading || filtersLoading}>
              {loading ? "Загрузка..." : "Рассчитать"}
            </button>

            <button type="button" style={btn} onClick={clearFilters}>
              Сбросить
            </button>
          </div>
        </div>

        {error && <div style={{ color: "crimson" }}>{error}</div>}
      </div>

      {items.length > 0 && (
        <div style={{ ...box, padding: 16, display: "grid", gap: 14 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 700 }}>Легенда классов</div>
            <div style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #2e7d32", background: "rgba(46,125,50,0.08)", fontSize: 13 }}>
              Наиболее подходит
            </div>
            <div style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #f9a825", background: "rgba(249,168,37,0.10)", fontSize: 13 }}>
              Подходит с ограничениями
            </div>
            <div style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #e53935", background: "rgba(229,57,53,0.10)", fontSize: 13 }}>
              Не рекомендуется
            </div>
            <div style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #616161", background: "rgba(97,97,97,0.10)", fontSize: 13 }}>
              Исключено
            </div>
          </div>

          <div className="app-cards-grid">
            <div style={{ ...box, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{statsTitle}</div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                <div>Наиболее подходит: {stats.counts.green}</div>
                <div>Подходит с ограничениями: {stats.counts.yellow}</div>
                <div>Не рекомендуется: {stats.counts.red}</div>
                <div>Исключено: {stats.counts.blocked}</div>
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{statsSourceLabel}</div>
            </div>
            {showSubtypeStats && (
              <div style={{ ...box, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{topPreferredLabel}</div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {stats.topSubtypes.length > 0 ? stats.topSubtypes.map((entry, index) => (
                    <div key={entry.name}>
                      {index + 1}. {entry.name}: {entry.green} из {entry.total}
                    </div>
                  )) : "Нет данных"}
                </div>
              </div>
            )}
            {showGroupStats && (
              <div style={{ ...box, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{topGroupPreferredLabel}</div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {stats.topGroupsByPreferred.length > 0 ? stats.topGroupsByPreferred.map((entry, index) => (
                    <div key={entry.name}>
                      {index + 1}. {entry.name}: {entry.green} из {entry.total}
                    </div>
                  )) : "Нет данных"}
                </div>
              </div>
            )}
          </div>

          <div style={{ fontWeight: 700 }}>
            {resultCountLabel}
          </div>

          {showItems && Object.entries(grouped).map(([color, groupItems]) => {
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
                      <div className="app-card-split">
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.product.name}</div>
                          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                            {item.product.subtype_name || item.product.type_name || "—"}
                          </div>
                          {item.color !== "green" && item.color !== "blocked" && getAlternativeItems(item, enrichedItems).length > 0 && (
                            <div
                              style={{
                                marginTop: 8,
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "rgba(46,125,50,0.06)",
                                border: "1px solid rgba(46,125,50,0.18)",
                                fontSize: 12,
                                color: "#2f5f32",
                                lineHeight: 1.5,
                              }}
                            >
                              <strong>Лучшие альтернативы в этой подгруппе:</strong>{" "}
                              {getAlternativeItems(item, enrichedItems)
                                .map((alternative) => `${alternative.product.name} (${score100(alternative)?.toFixed(1)} / 100)`)
                                .join("; ")}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, color: "#666" }}>Балл среди аналогов</div>
                          <div style={{ fontSize: 20, fontWeight: 700 }}>
                            {score100(item) == null ? "—" : `${score100(item).toFixed(1)} / 100`}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div />
                        <button type="button" style={btn} onClick={() => setSelectedItem(item)}>
                          Пояснение расчётов
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

      {showEmptyResult && (
        <div style={{ ...box, padding: 16, color: "#666" }}>
          По выбранным фильтрам рекомендации не найдены.
        </div>
      )}

      {selectedItem && <DetailsModal item={enrichedItems.find((item) => item.product.id === selectedItem.product.id) || selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
