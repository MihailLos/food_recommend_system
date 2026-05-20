import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchFoodProductSubtypes,
  fetchFoodProductTypes,
  fetchRecommendations,
} from "../../api/consumer";
import { fetchCatalogExport } from "../../api/products";
import { getAllProducts, replaceProducts, setLocalVersion } from "../../db/catalogDb";
import { normalizeProduct } from "../../utils/normalize";

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

const loaderOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(2px)",
  zIndex: 1100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const loaderCard = {
  width: "min(460px, 100%)",
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #dfe5dc",
  boxShadow: "0 12px 28px rgba(0,0,0,0.12)",
  padding: 20,
  display: "grid",
  gap: 12,
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

const comparisonModeLabels = {
  subgroup: "Сравнение внутри подгруппы",
  global: "Сравнение по всему перечню продуктов",
};

const recommendationPayloadFields = [
  "id",
  "name",
  "typeId",
  "typeName",
  "subtypeId",
  "subtypeName",
  "isChildAllowed",
  "allergens",
  "protein_g",
  "fats_g",
  "carbs_g",
  "energy_kcal",
  "fiber_g",
  "dietary_fiber_g",
  "mds_g",
  "starch_g",
  "water_g",
  "na_mg",
  "k_mg",
  "ca_mg",
  "mg_mg",
  "p_mg",
  "fe_mg",
  "ash_g",
  "a_mg",
  "beta_carotene_mg",
  "b1_mg",
  "b2_mg",
  "pp_mg",
  "c_mg",
  "retinol_index",
  "tocopherol_index",
  "niacin_index",
  "nlc_g",
  "pufa_g",
  "cholesterol_g",
  "organic_acids_g",
  "alcohol_pct",
];

function toRecommendationPayload(products) {
  if (!Array.isArray(products)) return [];
  return products.map((item) => {
    const projected = {};
    for (const field of recommendationPayloadFields) {
      if (item?.[field] !== undefined) {
        projected[field] = item[field];
      }
    }
    return projected;
  });
}

function score100(item) {
  const value = item?.score_components?.score_percent_100 ?? item?.explain?.score_percent_100;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summarizeReasons(factors, reasons) {
  if (Array.isArray(factors) && factors.length > 0) {
    return factors.slice(0, 2).map((item) => item?.short_text || item?.title).filter(Boolean).join("; ");
  }
  if (!Array.isArray(reasons) || reasons.length === 0) return "не выделены";
  return reasons.slice(0, 2).join("; ");
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
            <li key={`${title}-${index}`}>
              {typeof reason === "string" ? (
                reason
              ) : (
                <div style={{ display: "grid", gap: 4 }}>
                  <div>{reason?.title || "—"}</div>
                  {reason?.detail_text && (
                    <div style={{ fontSize: 12, color: "#666" }}>{reason.detail_text}</div>
                  )}
                </div>
              )}
            </li>
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
  const positiveFactors = Array.isArray(explain?.summary?.positive_factors) ? explain.summary.positive_factors : [];
  const limitingFactors = Array.isArray(explain?.summary?.limiting_factors) ? explain.summary.limiting_factors : [];
  const classText = item.class_label || meta.title;
  const comparisonMode = explain?.comparison_mode || "subgroup";
  const categoryRule = explain?.category_rule;

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} className="app-modal-shell" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{item.product?.name}</div>
            <div style={{ color: "#666", marginTop: 4 }}>
              {comparisonMode === "global" ? "Текущая выборка" : `Подгруппа сравнения: ${groupLabel(item)}`}
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
            {comparisonMode === "global"
              ? `Продукт получил класс «${classText}» после сравнения со всей текущей отфильтрованной выборкой.`
              : `Продукт получил класс «${classText}» после сравнения с аналогами своей подгруппы.`}{" "}
            Ниже показано, какие нутриенты сильнее всего повысили и снизили рекомендацию для выбранной цели питания.
          </div>
          {categoryRule && (
            <div style={{ color: "#444", lineHeight: 1.5 }}>
              Дополнительное правило цели: продукт попал в {categoryRule.scope === "subtype" ? "подгруппу" : "группу"}{" "}
              «{categoryRule.scope_name}», которая для выбранной цели считается{" "}
              {categoryRule.effect === "preferred" ? "рекомендуемой" : "ограничиваемой"}.
            </div>
          )}
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
              {comparisonMode === "global"
                ? "Это положение продукта среди всей текущей отфильтрованной выборки по итоговой оценке."
                : "Это положение продукта среди аналогов своей подгруппы по итоговой оценке."}
            </div>
          </div>

          <div style={{ ...box, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {comparisonMode === "global" ? "Границы классов по текущей выборке" : "Границы классов в подгруппе"}
            </div>
            <div>Нижняя граница: {fmt(quartiles.qua1, 3)}</div>
            <div>Срединная граница: {fmt(quartiles.qua2, 3)}</div>
            <div>Верхняя граница: {fmt(quartiles.qua3, 3)}</div>
          </div>
        </div>

        <div style={{ ...box, padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Какие факторы сильнее всего повлияли на рекомендацию</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            <ReasonList title="Что повысило оценку" items={positiveFactors.length ? positiveFactors : positiveReasons} />
            <ReasonList title="Что снизило оценку" items={limitingFactors.length ? limitingFactors : limitingReasons} />
          </div>
          <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
            Сила влияния определяется автоматически по месту нутриента среди аналогов. Сильное влияние: верхние 25% распределения;
            умеренное: от 55% до 75%; слабое: ниже 55%.
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

export default function RecommendationsTab({ profileId, catalogScope }) {
  const [searchText, setSearchText] = useState("");
  const [typeId, setTypeId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");
  const [comparisonMode, setComparisonMode] = useState("subgroup");
  const [types, setTypes] = useState([]);
  const [subtypes, setSubtypes] = useState([]);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Загрузка рекомендаций");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState("");
  const loadingTimerRef = useRef(null);

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

  const ensureLocalCatalog = useCallback(async () => {
    const localItems = await getAllProducts(catalogScope);
    if (Array.isArray(localItems) && localItems.length > 0) {
      return localItems;
    }

    const exported = await fetchCatalogExport("");
    const normalizedItems = (exported.items || []).map(normalizeProduct);
    await replaceProducts(catalogScope, normalizedItems);
    if (exported.version) {
      await setLocalVersion(catalogScope, exported.version);
    }
    return normalizedItems;
  }, [catalogScope]);

  const stopLoadingProgress = useCallback(() => {
    if (loadingTimerRef.current) {
      clearInterval(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }, []);

  const startLoadingProgress = useCallback((initialProgress, detail) => {
    stopLoadingProgress();
    setLoadingProgress(initialProgress);
    setLoadingDetail(detail);
    loadingTimerRef.current = setInterval(() => {
      setLoadingProgress((current) => (current >= 88 ? current : current + 3));
    }, 700);
  }, [stopLoadingProgress]);

  useEffect(() => {
    if (!profileIdNum) return;
    setHasCalculated(false);
    setSearchText("");
    setTypeId("");
    setSubtypeId("");
  }, [profileIdNum]);

  useEffect(() => {
    setHasCalculated(false);
    setSelectedItem(null);
  }, [comparisonMode]);

  const isGlobalMode = comparisonMode === "global";

  const load = useCallback(async () => {
    if (!profileIdNum) return;

    setLoading(true);
    setLoadingLabel("Расчёт рекомендаций");
    setLoadingProgress(8);
    setLoadingDetail("Подготовка локального каталога");
    setError("");
    try {
      const localCatalog = await ensureLocalCatalog();
      setLoadingProgress(24);
      setLoadingDetail("Подготовка данных для расчёта");
      const localPayload = toRecommendationPayload(localCatalog);
      setLoadingProgress(36);
      startLoadingProgress(42, "Расчёт рекомендаций на сервере");
      const data = await fetchRecommendations({
        profileId: profileIdNum,
        mode: "catalog",
        comparisonMode,
        q: searchText,
        typeId: typeId || null,
        subtypeId: subtypeId || null,
        limit: 300,
        localProducts: localPayload,
      });
      stopLoadingProgress();
      setLoadingProgress(96);
      setLoadingDetail("Подготовка результата");
      setPayload(data);
      setHasCalculated(true);
    } catch (e) {
      stopLoadingProgress();
      setPayload(null);
      setError(getRecommendationErrorDetail(e));
    } finally {
      setLoadingProgress(100);
      setLoading(false);
    }
  }, [comparisonMode, ensureLocalCatalog, profileIdNum, searchText, startLoadingProgress, stopLoadingProgress, subtypeId, typeId]);

  const clearFilters = () => {
    setSearchText("");
    setTypeId("");
    setSubtypeId("");
    setSelectedItem(null);
    setHasCalculated(false);
    if (comparisonMode !== "global") {
      setPayload(null);
    }
  };

  const loadOverview = useCallback(async () => {
    if (!profileIdNum) return;

    setLoading(true);
    setLoadingLabel("Предварительная загрузка рекомендаций");
    setLoadingProgress(8);
    setLoadingDetail("Подготовка локального каталога");
    setError("");
    try {
      const localCatalog = await ensureLocalCatalog();
      setLoadingProgress(24);
      setLoadingDetail("Подготовка данных для обзора");
      const localPayload = toRecommendationPayload(localCatalog);
      setLoadingProgress(36);
      startLoadingProgress(42, "Построение обзора по текущей выборке");
      const data = await fetchRecommendations({
        profileId: profileIdNum,
        mode: "catalog",
        comparisonMode,
        q: searchText,
        typeId: typeId || null,
        subtypeId: subtypeId || null,
        limit: 5000,
        localProducts: localPayload,
      });
      stopLoadingProgress();
      setLoadingProgress(96);
      setLoadingDetail("Подготовка результата");
      setPayload(data);
    } catch (e) {
      stopLoadingProgress();
      setPayload(null);
      setError(getRecommendationErrorDetail(e));
    } finally {
      setLoadingProgress(100);
      setLoading(false);
    }
  }, [comparisonMode, ensureLocalCatalog, profileIdNum, searchText, startLoadingProgress, stopLoadingProgress, subtypeId, typeId]);

  useEffect(() => {
    if (comparisonMode === "global") {
      const timer = setTimeout(() => {
        loadOverview();
      }, 300);
      return () => clearTimeout(timer);
    }
    setPayload(null);
  }, [comparisonMode, loadOverview, searchText, subtypeId, typeId]);

  useEffect(() => () => stopLoadingProgress(), [stopLoadingProgress]);

  const globalFiltersActive = Boolean(String(searchText || "").trim() || typeId || subtypeId);

  const statsTitle = hasCalculated ? "Распределение по классам" : "Обзор по всем группам и подгруппам";
  const showItems = hasCalculated && items.length > 0;
  const showEmptyResult = hasCalculated && !loading && !error && items.length === 0 && payload;

  const statsSourceLabel = hasCalculated
    ? (isGlobalMode
        ? "Статистика по текущей отфильтрованной выборке в режиме сравнения по всему перечню."
        : "Статистика по текущей выборке внутри режима сравнения по подгруппам.")
    : globalFiltersActive
      ? "Статистика по текущей отфильтрованной выборке для активного профиля."
      : "Статистика по всем доступным группам и подгруппам для активного профиля.";

  const topPreferredLabel = "Топ-3 подгруппы по наиболее предпочтительным продуктам";
  const topGroupPreferredLabel = "Топ-3 группы по наиболее предпочтительным продуктам";
  const hasSubtypeOptions = filteredSubtypes.length > 0;

  const resultCountLabel = hasCalculated
    ? `Найдено продуктов: ${items.length}`
    : comparisonMode === "global"
      ? (globalFiltersActive
          ? `Для обзора учтены ${items.length} продуктов текущей отфильтрованной выборки`
          : `Для обзора учтены все ${items.length} продуктов текущего профиля`)
      : "Выберите фильтры и нажмите «Рассчитать», чтобы сравнить продукты внутри подгрупп.";

  const showSubtypeStats = !subtypeId;
  const showGroupStats = !typeId;

  return (
    <div className="app-page">
      {loading && (
        <div style={loaderOverlay}>
          <div style={loaderCard}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{loadingLabel}</div>
            <div style={{ color: "#555", lineHeight: 1.5 }}>
              Пожалуйста, дождитесь завершения расчёта. В это время результаты и статистика обновляются для текущего профиля.
            </div>
            <div style={{ fontSize: 13, color: "#555" }}>
              {loadingDetail || "Выполняется расчёт..."}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "#2f5f32", fontWeight: 600 }}>
              <span>Готовность</span>
              <span>{Math.max(0, Math.min(100, Math.round(loadingProgress)))}%</span>
            </div>
            <div style={{ height: 12, borderRadius: 999, background: "#edf3ec", overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.max(4, Math.min(100, loadingProgress))}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #2e7d32 0%, #66bb6a 100%)",
                  transition: "width 280ms ease",
                }}
              />
            </div>
          </div>
        </div>
      )}
      <div style={{ ...box, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Рекомендации по продуктам</div>
        <div style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>
          В текущей версии алгоритм работает только в режиме просмотра продуктов. Каждый продукт оценивается
          на 100 г. Режим сравнения определяет, считать ли процентили и квартили внутри подгруппы или по всей текущей выборке.
        </div>

        <form
          className="app-filters-grid"
          onSubmit={(event) => {
            event.preventDefault();
            load();
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <label>Режим сравнения</label>
            <select
              style={input}
              value={comparisonMode}
              onChange={(e) => setComparisonMode(e.target.value || "subgroup")}
            >
              <option value="subgroup">{comparisonModeLabels.subgroup}</option>
              <option value="global">{comparisonModeLabels.global}</option>
            </select>
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.45 }}>
              {isGlobalMode
                ? "В этом режиме процентили, медиана и квартили считаются по всей текущей отфильтрованной выборке. Для выбранной цели дополнительно учитываются правила по группам и подгруппам."
                : "В этом режиме продукт сравнивается только с аналогами своей подгруппы. Цель питания влияет только на набор активных нутриентов."}
            </div>
          </div>

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
            <button type="submit" style={{ ...btn, borderColor: "#2e7d32" }} disabled={loading || filtersLoading}>
              {loading ? "Загрузка..." : "Рассчитать"}
            </button>

            <button type="button" style={btn} onClick={clearFilters}>
              Сбросить
            </button>
          </div>
        </form>

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
                    <article
                      key={item.product.id}
                      style={{
                        border: `1px solid ${meta.border}`,
                        background: meta.bg,
                        borderRadius: 12,
                        padding: 14,
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div className="app-card-split" style={{ alignItems: "start" }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.product.name}</div>
                          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                            {item.product.subtype_name || item.product.type_name || "—"}
                          </div>
                          <div
                            style={{
                              marginTop: 8,
                              display: "grid",
                              gap: 6,
                              color: "#444",
                              fontSize: 13,
                              lineHeight: 1.45,
                            }}
                          >
                            <div>
                              <strong>Итоговый балл:</strong>{" "}
                              {score100(item) == null ? "—" : `${score100(item).toFixed(1)} / 100`}
                            </div>
                            <div>
                              <strong>Что повысило оценку:</strong>{" "}
                              {summarizeReasons(
                                item?.explain?.summary?.positive_factors,
                                item?.explain?.summary?.positive_reasons,
                              )}
                            </div>
                            <div>
                              <strong>Что снизило оценку:</strong>{" "}
                              {summarizeReasons(
                                item?.explain?.summary?.limiting_factors,
                                item?.explain?.summary?.limiting_reasons,
                              )}
                            </div>
                          </div>
                          {!isGlobalMode && item.color !== "green" && item.color !== "blocked" && getAlternativeItems(item, enrichedItems).length > 0 && (
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
                          {item?.explain?.category_rule && (
                            <div style={{ marginTop: 8, fontSize: 12, color: "#555", lineHeight: 1.45 }}>
                              <strong>Поправка цели:</strong>{" "}
                              {item.explain.category_rule.effect === "preferred" ? "рекомендуемая" : "ограничиваемая"}{" "}
                              {item.explain.category_rule.scope === "subtype" ? "подгруппа" : "группа"} «{item.explain.category_rule.scope_name}».
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, color: "#666" }}>Класс рекомендации</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: meta.border, marginTop: 2 }}>
                            {item.class_label || meta.title}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
                        <button type="button" style={btn} onClick={() => setSelectedItem(item)}>
                          Пояснение расчётов
                        </button>
                      </div>
                    </article>
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

      {!hasCalculated && comparisonMode === "subgroup" && !loading && !error && (
        <div style={{ ...box, padding: 16, color: "#666", lineHeight: 1.55 }}>
          В режиме сравнения внутри подгруппы обзор по всей базе не строится автоматически, потому что это самый тяжёлый режим расчёта.
          Выберите фильтры при необходимости и нажмите `Рассчитать`.
        </div>
      )}

      {selectedItem && <DetailsModal item={enrichedItems.find((item) => item.product.id === selectedItem.product.id) || selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
