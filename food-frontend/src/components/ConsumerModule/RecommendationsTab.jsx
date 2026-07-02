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

const input = {
  padding: 8,
  border: "1px solid #ddd",
  borderRadius: 8,
  boxSizing: "border-box",
  width: "100%",
};

const btn = {
  padding: "8px 12px",
  border: "1px solid #ddd",
  background: "#fff",
  borderRadius: 8,
  cursor: "pointer",
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
  width: "min(480px, 100%)",
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #dfe5dc",
  boxShadow: "0 12px 28px rgba(0,0,0,0.12)",
  padding: 20,
  display: "grid",
  gap: 12,
};

const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1200,
};

const modalCard = {
  width: "min(920px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
  padding: 20,
  display: "grid",
  gap: 14,
};

const comparisonOptions = [
  { value: "", label: "Сначала выберите множество сравнения" },
  { value: "global", label: "Вся база продуктов" },
  { value: "type", label: "Отдельная группа продуктов" },
  { value: "subgroup", label: "Отдельная подгруппа продуктов" },
  { value: "selected", label: "Свободный выбор продуктов" },
];

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function fmt(value, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function fmtPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function levelMeta(level) {
  const code = level?.code || "";
  if (code === "high") {
    return { bg: "rgba(30, 96, 217, 0.18)", border: "#1e60d9", text: level?.label || "Высокий" };
  }
  if (code === "medium") {
    return { bg: "rgba(84, 141, 255, 0.16)", border: "#548dff", text: level?.label || "Средний" };
  }
  if (code === "low") {
    return { bg: "rgba(193, 221, 255, 0.8)", border: "#8bbcff", text: level?.label || "Низкий" };
  }
  return { bg: "#f5f5f5", border: "#bbb", text: "—" };
}

function limitLevelMeta(level) {
  const code = level?.code || "";
  if (code === "low") {
    return { bg: "rgba(255, 233, 206, 0.95)", border: "#ffbf66", text: level?.label || "Низкий" };
  }
  if (code === "medium") {
    return { bg: "rgba(255, 188, 92, 0.18)", border: "#ff9f1a", text: level?.label || "Средний" };
  }
  if (code === "high") {
    return { bg: "rgba(255, 136, 0, 0.22)", border: "#f57c00", text: level?.label || "Высокий" };
  }
  return { bg: "#f5f5f5", border: "#bbb", text: "—" };
}

function getRecommendationErrorDetail(error) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.message ||
    "Не удалось загрузить рекомендации."
  );
}

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

function SignalTable({ signals }) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return <div style={{ color: "#666", fontSize: 13 }}>Нет детализированных данных по нутриентам.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["Нутриент", "Роль", "В 100 г", "Суточный ориентир", "Доля ориентира", "Положение", "Квартильный балл"].map((head) => (
              <th key={head} style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #eee" }}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => (
            <tr key={signal.code}>
              <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>
                <div style={{ fontWeight: 600 }}>{signal.ru_name}</div>
                <div style={{ fontSize: 11, color: "#666" }}>{signal.code}</div>
              </td>
              <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>
                {signal.direction === "preferred" ? "Покрытие" : "Лимитная нагрузка"}
              </td>
              <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>
                {fmt(signal.value_100g, 2)} {signal.unit || ""}
              </td>
              <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>
                {signal.target_day == null ? "—" : `${fmt(signal.target_day, 2)} ${signal.unit || ""}`}
              </td>
              <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>
                {fmtPercent(signal.daily_share_pct)}
              </td>
              <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>
                {fmtPercent((signal.percentile_q || 0) * 100)}
              </td>
              <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{signal.quartile_score ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailsModal({ item, onClose }) {
  if (!item) return null;

  const score = item.score_components || {};
  const explain = item.explain || {};
  const comparisonName = explain?.comparison_group?.name || "—";
  const coverageMeta = levelMeta(score.coverage_level);
  const limitMeta = limitLevelMeta(score.limit_level);
  const positiveFactors = explain?.summary?.positive_factors || [];
  const limitingFactors = explain?.summary?.limiting_factors || [];

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{item.product?.name}</div>
            <div style={{ color: "#666", marginTop: 4 }}>Множество сравнения: {comparisonName}</div>
          </div>
          <button type="button" style={btn} onClick={onClose}>Закрыть</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div style={{ ...box, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Уровень покрытия</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtPercent(score.coverage_percent_100)}</div>
            <div style={{ marginTop: 8, display: "inline-block", padding: "4px 8px", borderRadius: 999, border: `1px solid ${coverageMeta.border}`, background: coverageMeta.bg }}>
              {coverageMeta.text}
            </div>
          </div>
          <div style={{ ...box, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Уровень лимитной нагрузки</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtPercent(score.limit_percent_100)}</div>
            <div style={{ marginTop: 8, display: "inline-block", padding: "4px 8px", borderRadius: 999, border: `1px solid ${limitMeta.border}`, background: limitMeta.bg }}>
              {limitMeta.text}
            </div>
          </div>
          <div style={{ ...box, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Итоговая оценка приоритетности</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtPercent(score.score_percent_100)}</div>
            <div style={{ color: "#666", fontSize: 12, marginTop: 6 }}>
              Чем выше значение, тем выше продукт расположен среди аналогов по общему балансу покрытия и лимитной нагрузки.
            </div>
          </div>
        </div>

        <div style={{ ...box, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Что сильнее всего повлияло на результат</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Пищевые вещества покрытия</div>
              {positiveFactors.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, color: "#444", lineHeight: 1.55 }}>
                  {positiveFactors.map((factor) => (
                    <li key={factor.code}>
                      <div>{factor.short_text}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>{factor.detail_text}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: "#666", fontSize: 13 }}>Сильные факторы не выделены.</div>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Пищевые вещества лимитной нагрузки</div>
              {limitingFactors.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, color: "#444", lineHeight: 1.55 }}>
                  {limitingFactors.map((factor) => (
                    <li key={factor.code}>
                      <div>{factor.short_text}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>{factor.detail_text}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: "#666", fontSize: 13 }}>Ограничивающие факторы не выделены.</div>
              )}
            </div>
          </div>
        </div>

        <details style={{ ...box, padding: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Показать детали расчета</summary>
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              <div>Суммарное покрытие: {fmt(score.coverage_sum, 2)}</div>
              <div>Суммарная лимитная нагрузка: {fmt(score.limit_sum, 2)}</div>
              <div>Балансовая оценка: {fmt(score.priority_raw, 2)}</div>
            </div>
            <SignalTable signals={explain.signals || []} />
          </div>
        </details>
      </div>
    </div>
  );
}

export default function RecommendationsTab({ profileId, catalogScope }) {
  const [comparisonMode, setComparisonMode] = useState("");
  const [typeId, setTypeId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");
  const [selectionTypeId, setSelectionTypeId] = useState("");
  const [selectionSubtypeId, setSelectionSubtypeId] = useState("");
  const [selectionSearch, setSelectionSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [sortBy, setSortBy] = useState("score_percent_100");
  const [sortDirection, setSortDirection] = useState("desc");
  const [types, setTypes] = useState([]);
  const [subtypes, setSubtypes] = useState([]);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingDetail, setLoadingDetail] = useState("");
  const loadingTimerRef = useRef(null);

  const profileIdNum = useMemo(() => {
    const value = Number(profileId);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [profileId]);

  const rawItems = useMemo(() => normalizeList(payload?.items ?? payload), [payload]);

  const filteredSubtypes = useMemo(() => {
    if (!typeId) return subtypes;
    return subtypes.filter((item) => Number(item?.product_type || item?.product_type_id || item?.type_id || item?.product_type?.id) === Number(typeId));
  }, [subtypes, typeId]);

  const selectionFilteredSubtypes = useMemo(() => {
    if (!selectionTypeId) return subtypes;
    return subtypes.filter((item) => Number(item?.product_type || item?.product_type_id || item?.type_id || item?.product_type?.id) === Number(selectionTypeId));
  }, [selectionTypeId, subtypes]);

  const ensureLocalCatalog = useCallback(async () => {
    const localItems = await getAllProducts(catalogScope);
    if (Array.isArray(localItems) && localItems.length > 0) {
      setCatalogProducts(localItems);
      return localItems;
    }

    const exported = await fetchCatalogExport("");
    const normalizedItems = (exported.items || []).map(normalizeProduct);
    await replaceProducts(catalogScope, normalizedItems);
    if (exported.version) {
      await setLocalVersion(catalogScope, exported.version);
    }
    setCatalogProducts(normalizedItems);
    return normalizedItems;
  }, [catalogScope]);

  useEffect(() => {
    ensureLocalCatalog().catch(() => {});
  }, [ensureLocalCatalog]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchFoodProductTypes(), fetchFoodProductSubtypes()])
      .then(([typesData, subtypesData]) => {
        if (cancelled) return;
        setTypes(normalizeList(typesData));
        setSubtypes(normalizeList(subtypesData));
      })
      .catch(() => {
        if (!cancelled) {
          setError("Не удалось загрузить группы и подгруппы продуктов.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stopProgress = useCallback(() => {
    if (loadingTimerRef.current) {
      clearInterval(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }, []);

  const startProgress = useCallback((detail) => {
    stopProgress();
    setLoadingDetail(detail);
    loadingTimerRef.current = setInterval(() => {
      setLoadingProgress((current) => (current >= 88 ? current : current + 4));
    }, 650);
  }, [stopProgress]);

  useEffect(() => () => stopProgress(), [stopProgress]);

  const validateFilters = useCallback(() => {
    if (!comparisonMode) {
      return "Сначала выберите множество сравнения.";
    }
    if (comparisonMode === "type" && !typeId) {
      return "Для сравнения по группе сначала выберите группу продуктов.";
    }
    if (comparisonMode === "subgroup" && !subtypeId) {
      return "Для сравнения по подгруппе сначала выберите подгруппу продуктов.";
    }
    if (comparisonMode === "selected" && selectedProducts.length === 0) {
      return "Для свободного выбора сначала добавьте продукты в множество сравнения.";
    }
    return "";
  }, [comparisonMode, selectedProducts.length, subtypeId, typeId]);

  const searchSuggestions = useMemo(() => {
    const search = String(selectionSearch || "").trim().toLowerCase();
    let pool = catalogProducts;
    if (selectionTypeId) {
      pool = pool.filter((item) => String(item?.typeId ?? item?.type_id ?? "") === String(selectionTypeId));
    }
    if (selectionSubtypeId) {
      pool = pool.filter((item) => String(item?.subtypeId ?? item?.subtype_id ?? "") === String(selectionSubtypeId));
    }
    if (search) {
      pool = pool.filter((item) => String(item?.name || "").toLowerCase().includes(search));
    }
    const selectedIds = new Set(selectedProducts.map((item) => Number(item.id)));
    return pool
      .filter((item) => !selectedIds.has(Number(item.id)))
      .slice(0, 20);
  }, [catalogProducts, selectedProducts, selectionSearch, selectionSubtypeId, selectionTypeId]);

  const items = useMemo(() => {
    const data = [...rawItems];
    const valueFor = (item) => {
      const score = item?.score_components || {};
      if (sortBy === "coverage_percent_100") return Number(score.coverage_percent_100 ?? -1);
      if (sortBy === "limit_percent_100") return Number(score.limit_percent_100 ?? -1);
      return Number(score.score_percent_100 ?? -1);
    };
    data.sort((left, right) => {
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);
      if (leftValue !== rightValue) {
        return sortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }
      return String(left?.product?.name || "").localeCompare(String(right?.product?.name || ""), "ru");
    });
    return data;
  }, [rawItems, sortBy, sortDirection]);

  const loadRecommendations = useCallback(async () => {
    if (!profileIdNum) return;
    const validationError = validateFilters();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setLoadingProgress(8);
    setLoadingDetail("Подготовка локального каталога");
    setError("");

    try {
      const localCatalog = await ensureLocalCatalog();
      setLoadingProgress(24);
      setLoadingDetail("Подготовка данных для расчета");
      const localPayload = toRecommendationPayload(localCatalog);
      setLoadingProgress(40);
      startProgress("Расчет показателей покрытия, лимитной нагрузки и приоритетности");

      const data = await fetchRecommendations({
        profileId: profileIdNum,
        mode: "catalog",
        comparisonMode,
        typeId: typeId || null,
        subtypeId: subtypeId || null,
        limit: 500,
        localProducts: localPayload,
        selectedProductIds: comparisonMode === "selected" ? selectedProducts.map((item) => Number(item.id)) : null,
      });

      stopProgress();
      setLoadingProgress(100);
      setLoadingDetail("Подготовка результата");
      setPayload(data);
    } catch (requestError) {
      stopProgress();
      setPayload(null);
      setError(getRecommendationErrorDetail(requestError));
    } finally {
      setLoading(false);
    }
  }, [comparisonMode, ensureLocalCatalog, profileIdNum, selectedProducts, startProgress, stopProgress, subtypeId, typeId, validateFilters]);

  const stats = useMemo(() => {
    const total = items.length;
    const excluded = items.filter((item) => item.class_code === "excluded").length;
    const avgPriority = items.length
      ? roundValue(items.reduce((acc, item) => acc + Number(item?.score_components?.score_percent_100 || 0), 0) / items.length)
      : null;
    return { total, excluded, avgPriority };
  }, [items]);

  const comparisonLabel = useMemo(() => {
    if (comparisonMode === "global") return "вся база продуктов";
    if (comparisonMode === "type") {
      const group = types.find((item) => String(item.id) === String(typeId));
      return group ? `группа «${group.name}»` : "выбранная группа";
    }
    if (comparisonMode === "subgroup") {
      const subgroup = subtypes.find((item) => String(item.id) === String(subtypeId));
      return subgroup ? `подгруппа «${subgroup.name}»` : "выбранная подгруппа";
    }
    if (comparisonMode === "selected") {
      return "выбранные пользователем продукты";
    }
    return "—";
  }, [comparisonMode, subtypeId, subtypes, typeId, types]);

  const addSelectedProduct = (product) => {
    setSelectedProducts((prev) => (prev.some((item) => Number(item.id) === Number(product.id)) ? prev : [...prev, product]));
  };

  const removeSelectedProduct = (productId) => {
    setSelectedProducts((prev) => prev.filter((item) => Number(item.id) !== Number(productId)));
  };

  const sortLabel = (field, label) => {
    if (sortBy !== field) return label;
    return `${label} ${sortDirection === "asc" ? "↑" : "↓"}`;
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortDirection("desc");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {loading && (
        <div style={loaderOverlay}>
          <div style={loaderCard}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Расчет рекомендаций</div>
            <div style={{ color: "#555", lineHeight: 1.5 }}>
              Система последовательно готовит локальный каталог, считает показатели покрытия и лимитной нагрузки,
              а затем формирует итоговую оценку приоритетности.
            </div>
            <div style={{ fontSize: 13, color: "#555" }}>{loadingDetail || "Выполняется расчет..."}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#2f5f32", fontWeight: 600 }}>
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
        <div style={{ fontWeight: 700, fontSize: 18 }}>Рекомендации</div>
        <div style={{ color: "#555", lineHeight: 1.55 }}>
          Сначала выбери множество сравнения. Алгоритм сравнивает продукты только внутри выбранной базы,
          группы или подгруппы. После этого рассчитываются уровень покрытия, уровень лимитной нагрузки и итоговая
          оценка приоритетности продукта.
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            loadRecommendations();
          }}
          style={{ display: "grid", gap: 12 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label>Множество сравнения</label>
              <select
                style={{
                  ...input,
                  borderColor: comparisonMode ? "#ddd" : "#f0b24b",
                  background: comparisonMode ? "#fff" : "#fffaf0",
                }}
                value={comparisonMode}
                onChange={(event) => {
                  const nextMode = event.target.value;
                  setComparisonMode(nextMode);
                  setPayload(null);
                  if (nextMode !== "type") {
                    setTypeId("");
                  }
                  if (nextMode !== "subgroup") {
                    setSubtypeId("");
                  }
                  if (nextMode !== "selected") {
                    setSelectionTypeId("");
                    setSelectionSubtypeId("");
                    setSelectionSearch("");
                    setSelectedProducts([]);
                  }
                }}
              >
                {comparisonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {!comparisonMode && (
                <div style={{ fontSize: 12, color: "#8a6d1d" }}>
                  Это обязательное поле. Без него алгоритм не знает, с какими продуктами сравнивать результат.
                </div>
              )}
            </div>

            {comparisonMode === "type" && (
              <div style={{ display: "grid", gap: 6 }}>
                <label>Группа продуктов</label>
                <select style={input} value={typeId} onChange={(event) => setTypeId(event.target.value)}>
                  <option value="">Выберите группу</option>
                  {types.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {comparisonMode === "subgroup" && (
              <>
                <div style={{ display: "grid", gap: 6 }}>
                  <label>Группа продуктов</label>
                  <select
                    style={input}
                    value={typeId}
                    onChange={(event) => {
                      setTypeId(event.target.value);
                      setSubtypeId("");
                    }}
                  >
                    <option value="">Выберите группу</option>
                    {types.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label>Подгруппа продуктов</label>
                  <select
                    style={input}
                    value={subtypeId}
                    onChange={(event) => setSubtypeId(event.target.value)}
                    disabled={!typeId}
                  >
                    <option value="">{typeId ? "Выберите подгруппу" : "Сначала выберите группу"}</option>
                    {filteredSubtypes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {comparisonMode === "selected" && (
              <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: 12 }}>
                <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 700 }}>Добавить продукты в множество сравнения</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                    <select
                      style={input}
                      value={selectionTypeId}
                      onChange={(event) => {
                        setSelectionTypeId(event.target.value);
                        setSelectionSubtypeId("");
                      }}
                    >
                      <option value="">Все группы</option>
                      {types.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <select
                      style={input}
                      value={selectionSubtypeId}
                      onChange={(event) => setSelectionSubtypeId(event.target.value)}
                      disabled={!selectionTypeId}
                    >
                      <option value="">{selectionTypeId ? "Все подгруппы" : "Сначала выберите группу"}</option>
                      {selectionFilteredSubtypes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <input
                      style={input}
                      value={selectionSearch}
                      onChange={(event) => setSelectionSearch(event.target.value)}
                      placeholder="Поиск по названию"
                    />
                  </div>

                  <div style={{ display: "grid", gap: 8, maxHeight: 280, overflow: "auto" }}>
                    {searchSuggestions.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#666" }}>Подходящие продукты не найдены.</div>
                    ) : (
                      searchSuggestions.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addSelectedProduct(product)}
                          style={{
                            ...btn,
                            textAlign: "left",
                            display: "grid",
                            gap: 4,
                            padding: "10px 12px",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{product.name}</div>
                          <div style={{ fontSize: 12, color: "#666" }}>
                            {product.subtypeName || product.typeName || "Без подгруппы"}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, display: "grid", gap: 10, alignContent: "start" }}>
                  <div style={{ fontWeight: 700 }}>Текущее множество сравнения</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Выбрано продуктов: {selectedProducts.length}
                  </div>
                  <div style={{ display: "grid", gap: 8, maxHeight: 280, overflow: "auto" }}>
                    {selectedProducts.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#666" }}>Список пока пуст.</div>
                    ) : (
                      selectedProducts.map((product) => (
                        <div
                          key={product.id}
                          style={{
                            border: "1px solid #ddd",
                            borderRadius: 10,
                            padding: "10px 12px",
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: 8,
                            alignItems: "start",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{product.name}</div>
                            <div style={{ fontSize: 12, color: "#666" }}>
                              {product.subtypeName || product.typeName || "Без подгруппы"}
                            </div>
                          </div>
                          <button type="button" style={btn} onClick={() => removeSelectedProduct(product.id)}>
                            Убрать
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" style={{ ...btn, borderColor: "#2e7d32" }} disabled={loading}>
              Рассчитать
            </button>
            <button
              type="button"
              style={btn}
              onClick={() => {
                setComparisonMode("");
                setTypeId("");
                setSubtypeId("");
                setSelectionTypeId("");
                setSelectionSubtypeId("");
                setSelectionSearch("");
                setSelectedProducts([]);
                setPayload(null);
                setSelectedItem(null);
                setError("");
              }}
            >
              Сбросить
            </button>
          </div>
        </form>

        {error && <div style={{ color: "crimson" }}>{error}</div>}
      </div>

      {payload && (
        <div style={{ ...box, padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Множество сравнения</div>
              <div>{comparisonLabel}</div>
            </div>
            <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Количество продуктов</div>
              <div>{stats.total}</div>
            </div>
            <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Средняя приоритетность</div>
              <div>{stats.avgPriority == null ? "—" : `${stats.avgPriority}%`}</div>
            </div>
            <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Исключено по ограничениям</div>
              <div>{stats.excluded}</div>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Продукт</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>
                    <button type="button" style={{ ...btn, padding: 0, border: "none", background: "transparent", fontWeight: 700 }} onClick={() => toggleSort("coverage_percent_100")}>
                      {sortLabel("coverage_percent_100", "Уровень покрытия")}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>
                    <button type="button" style={{ ...btn, padding: 0, border: "none", background: "transparent", fontWeight: 700 }} onClick={() => toggleSort("limit_percent_100")}>
                      {sortLabel("limit_percent_100", "Уровень лимитной нагрузки")}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>
                    <button type="button" style={{ ...btn, padding: 0, border: "none", background: "transparent", fontWeight: 700 }} onClick={() => toggleSort("score_percent_100")}>
                      {sortLabel("score_percent_100", "Итоговая оценка приоритетности")}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }} />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const score = item.score_components || {};
                  const coverage = levelMeta(score.coverage_level);
                  const limit = limitLevelMeta(score.limit_level);
                  return (
                    <tr key={item.product?.id}>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", minWidth: 260 }}>
                        <div style={{ fontWeight: 600 }}>{item.product?.name}</div>
                        <div style={{ color: "#666", fontSize: 12 }}>
                          {item.product?.subtype_name || item.product?.type_name || "Без подгруппы"}
                        </div>
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", minWidth: 180 }}>
                        <div style={{ fontWeight: 700 }}>{fmtPercent(score.coverage_percent_100)}</div>
                        <div style={{ marginTop: 6, display: "inline-block", padding: "4px 8px", borderRadius: 999, border: `1px solid ${coverage.border}`, background: coverage.bg, fontSize: 12 }}>
                          {coverage.text}
                        </div>
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", minWidth: 180 }}>
                        <div style={{ fontWeight: 700 }}>{fmtPercent(score.limit_percent_100)}</div>
                        <div style={{ marginTop: 6, display: "inline-block", padding: "4px 8px", borderRadius: 999, border: `1px solid ${limit.border}`, background: limit.bg, fontSize: 12 }}>
                          {limit.text}
                        </div>
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", minWidth: 180 }}>
                        <div style={{ fontWeight: 700, fontSize: 20 }}>{fmtPercent(score.score_percent_100)}</div>
                        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                          Балансовая оценка: {fmt(score.priority_raw, 2)}
                        </div>
                      </td>
                      <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", width: 140 }}>
                        <button type="button" style={btn} onClick={() => setSelectedItem(item)}>
                          Пояснение
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DetailsModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}

function roundValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10) / 10;
}
