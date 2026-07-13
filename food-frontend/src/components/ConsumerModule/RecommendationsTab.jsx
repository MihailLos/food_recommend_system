import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAvailableRecommendationNutrients,
  fetchFoodProductSubtypes,
  fetchFoodProductTypes,
  fetchNutrientsDictionary,
  fetchProfileTargets,
  fetchRecommendations,
} from "../../api/consumer";
import { fetchCatalogExport } from "../../api/products";
import { fetchRetailProducts } from "../../api/retailProducts";
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

const sourceModeOptions = [
  { value: "reference_only", label: "Только эталонный справочник" },
  { value: "retail_only", label: "Только мои магазинные продукты" },
  { value: "reference_plus_retail", label: "Эталонный справочник + мои магазинные продукты" },
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

function describeQuartilePosition(percent, direction) {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return "Положение в выборке не определено.";
  const rounded = percent.toFixed(1);
  if (direction === "coverage") {
    if (percent >= 75) return `Продукт входит в верхний квартиль по покрытию и выше, чем у ${rounded}% продуктов выборки.`;
    if (percent >= 50) return `Продукт выше медианы по покрытию и выше, чем у ${rounded}% продуктов выборки.`;
    if (percent >= 25) return `Продукт находится ниже медианы по покрытию, но выше, чем у ${rounded}% продуктов выборки.`;
    return `Продукт находится в нижнем квартиле по покрытию и выше, чем только у ${rounded}% продуктов выборки.`;
  }
  if (percent >= 75) return `Лимитная нагрузка выше, чем у ${rounded}% продуктов выборки. Это верхний квартиль нагрузки.`;
  if (percent >= 50) return `Лимитная нагрузка выше медианы и выше, чем у ${rounded}% продуктов выборки.`;
  if (percent >= 25) return `Лимитная нагрузка ниже медианы, но все еще выше, чем у ${rounded}% продуктов выборки.`;
  return `Лимитная нагрузка находится в нижнем квартиле и выше, чем только у ${rounded}% продуктов выборки.`;
}

function QuartileScale({ title, percent, color, background, description }) {
  const safePercent = typeof percent === "number" && Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null;

  return (
    <div style={{ ...box, padding: 12, display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div style={{ position: "relative", paddingTop: 18 }}>
        {[25, 50, 75].map((point, index) => (
          <div
            key={point}
            style={{
              position: "absolute",
              left: `${point}%`,
              top: 0,
              transform: "translateX(-50%)",
              fontSize: 11,
              color: "#666",
            }}
          >
            {`Q${index + 1}`}
          </div>
        ))}
        <div
          style={{
            position: "relative",
            height: 14,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${background} 0%, rgba(255,255,255,0.96) 100%)`,
            border: "1px solid #d9d9d9",
            overflow: "hidden",
          }}
        >
          {[25, 50, 75].map((point) => (
            <div
              key={point}
              style={{
                position: "absolute",
                left: `${point}%`,
                top: -1,
                bottom: -1,
                width: 1,
                background: "rgba(0,0,0,0.15)",
              }}
            />
          ))}
          {safePercent != null && (
            <div
              style={{
                position: "absolute",
                left: `${safePercent}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: color,
                border: "3px solid #fff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              }}
            />
          )}
        </div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666" }}>
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "#444", lineHeight: 1.5 }}>
        {safePercent == null ? "Недостаточно данных для построения шкалы." : description}
      </div>
    </div>
  );
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

function normalizeRetailSelectionProduct(item, sourceMode = "retail_only") {
  const recommendationId = sourceMode === "retail_only" ? -Math.abs(Number(item.id)) : -Math.abs(Number(item.id));
  const projected = {
    id: item.id,
    recommendationId,
    sourceKind: "retail",
    name: item.name,
    typeId: item.related_food_group || null,
    typeName: item.related_food_group_name || "",
    subtypeId: item.related_food_subgroup || null,
    subtypeName: item.related_food_subgroup_name || "",
    status: item.status,
    ready: Boolean(item.is_ready_for_recommendation),
  };
  for (const field of recommendationPayloadFields) {
    if (item?.[field] !== undefined) {
      projected[field] = item[field];
    }
  }
  return projected;
}

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

function isKnownNutrientValue(value) {
  if (value === null || value === undefined || value === "") return false;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number);
}

function NutrientPillList({ items, emptyText, tone = "neutral" }) {
  const color = tone === "warning" ? "#9a5b00" : tone === "good" ? "#1f5f26" : "#44515d";
  const bg = tone === "warning" ? "#fff7e8" : tone === "good" ? "#f0f8f0" : "#f7f9fc";
  const border = tone === "warning" ? "#f2d39b" : tone === "good" ? "#cfe6cf" : "#e3e8ef";
  if (!items.length) {
    return <div style={{ color: "#666", fontSize: 13 }}>{emptyText}</div>;
  }
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((item) => (
        <span
          key={item.code || item}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            borderRadius: 999,
            border: `1px solid ${border}`,
            background: bg,
            color,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {item.label || item.ru_name || item.code || item}
        </span>
      ))}
    </div>
  );
}

function SignalTable({ signals }) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return <div style={{ color: "#666", fontSize: 13 }}>Нет детализированных данных по пищевым веществам.</div>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["Пищевое вещество", "Роль", "В 100 г", "Суточный ориентир", "Доля ориентира", "Положение", "Квартильный балл"].map((head) => (
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
  const hasCoverageDimension = explain?.dimensions?.has_coverage_dimension !== false;
  const hasLimitDimension = explain?.dimensions?.has_limit_dimension !== false;
  const comparisonName = explain?.comparison_group?.name || "—";
  const coverageMeta = levelMeta(score.coverage_level);
  const limitMeta = limitLevelMeta(score.limit_level);
  const positiveFactors = explain?.summary?.positive_factors || [];
  const limitingFactors = explain?.summary?.limiting_factors || [];
  const coveragePercent = score.coverage_percent_100;
  const limitPercent = score.limit_percent_100;

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
          {hasCoverageDimension && (
            <div style={{ ...box, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Уровень покрытия</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtPercent(score.coverage_percent_100)}</div>
              <div style={{ marginTop: 8, display: "inline-block", padding: "4px 8px", borderRadius: 999, border: `1px solid ${coverageMeta.border}`, background: coverageMeta.bg }}>
                {coverageMeta.text}
              </div>
            </div>
          )}
          {hasLimitDimension && (
            <div style={{ ...box, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Уровень лимитной нагрузки</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtPercent(score.limit_percent_100)}</div>
              <div style={{ marginTop: 8, display: "inline-block", padding: "4px 8px", borderRadius: 999, border: `1px solid ${limitMeta.border}`, background: limitMeta.bg }}>
                {limitMeta.text}
              </div>
            </div>
          )}
          <div style={{ ...box, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Итоговая оценка приоритетности</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtPercent(score.score_percent_100)}</div>
            <div style={{ color: "#666", fontSize: 12, marginTop: 6 }}>
              Чем выше значение, тем выше продукт расположен среди аналогов по общему балансу покрытия и лимитной нагрузки.
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {hasCoverageDimension && (
            <QuartileScale
              title="Положение по покрытию в выборке"
              percent={coveragePercent}
              color="#1e60d9"
              background="rgba(193, 221, 255, 0.95)"
              description={describeQuartilePosition(coveragePercent, "coverage")}
            />
          )}
          {hasLimitDimension && (
            <QuartileScale
              title="Положение по лимитной нагрузке в выборке"
              percent={limitPercent}
              color="#f57c00"
              background="rgba(255, 233, 206, 0.95)"
              description={describeQuartilePosition(limitPercent, "limit")}
            />
          )}
        </div>

        <div style={{ ...box, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Что сильнее всего повлияло на результат</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {hasCoverageDimension && (
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
            )}
            {hasLimitDimension && (
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
            )}
          </div>
        </div>

        <details style={{ ...box, padding: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Показать детали расчета</summary>
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {hasCoverageDimension && <div>Суммарное покрытие: {fmt(score.coverage_sum, 2)}</div>}
              {hasLimitDimension && <div>Суммарная лимитная нагрузка: {fmt(score.limit_sum, 2)}</div>}
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
  const [sourceMode, setSourceMode] = useState("reference_only");
  const [comparisonMode, setComparisonMode] = useState("");
  const [typeId, setTypeId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");
  const [selectionTypeId, setSelectionTypeId] = useState("");
  const [selectionSubtypeId, setSelectionSubtypeId] = useState("");
  const [selectionSearch, setSelectionSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [retailProducts, setRetailProducts] = useState([]);
  const [availableNutrients, setAvailableNutrients] = useState([]);
  const [availableNutrientsLoading, setAvailableNutrientsLoading] = useState(false);
  const [nutrientsDictionary, setNutrientsDictionary] = useState([]);
  const [guidanceLists, setGuidanceLists] = useState({ coverageCodes: [], limitCodes: [] });
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
  const [isCompactLayout, setIsCompactLayout] = useState(false);
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

  const nutrientMetaMap = useMemo(() => {
    const map = new Map();
    [...nutrientsDictionary, ...availableNutrients].forEach((item) => {
      if (item?.code) map.set(item.code, item);
    });
    return map;
  }, [availableNutrients, nutrientsDictionary]);

  const nutrientLabel = useCallback((code) => {
    const meta = nutrientMetaMap.get(code);
    return meta?.ru_name || meta?.name || code;
  }, [nutrientMetaMap]);

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
    const syncLayout = () => {
      if (typeof window === "undefined") return;
      setIsCompactLayout(window.innerWidth < 980);
    };
    syncLayout();
    window.addEventListener("resize", syncLayout);
    return () => window.removeEventListener("resize", syncLayout);
  }, []);

  useEffect(() => {
    ensureLocalCatalog().catch(() => {});
  }, [ensureLocalCatalog]);

  useEffect(() => {
    let cancelled = false;
    fetchRetailProducts({ status: "ready" })
      .then((data) => {
        if (cancelled) return;
        const items = normalizeList(data).filter((item) => item?.is_ready_for_recommendation);
        setRetailProducts(items.map((item) => normalizeRetailSelectionProduct(item, sourceMode)));
      })
      .catch(() => {
        if (!cancelled) {
          setRetailProducts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sourceMode]);

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

  useEffect(() => {
    if (!profileIdNum) return;
    let cancelled = false;
    Promise.all([fetchProfileTargets(profileIdNum), fetchNutrientsDictionary()])
      .then(([targetsData, nutrientsData]) => {
        if (cancelled) return;
        setGuidanceLists({
          coverageCodes: normalizeList(targetsData?.guidance_lists?.coverage_codes || []),
          limitCodes: normalizeList(targetsData?.guidance_lists?.limit_codes || []),
        });
        setNutrientsDictionary(normalizeList(nutrientsData));
      })
      .catch(() => {
        if (!cancelled) {
          setGuidanceLists({ coverageCodes: [], limitCodes: [] });
          setNutrientsDictionary([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileIdNum]);

  useEffect(() => {
    if (!profileIdNum) return;
    let cancelled = false;
    setAvailableNutrientsLoading(true);
    fetchAvailableRecommendationNutrients(profileIdNum, sourceMode)
      .then((data) => {
        if (cancelled) return;
        setAvailableNutrients(normalizeList(data));
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableNutrients([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAvailableNutrientsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profileIdNum, sourceMode]);

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

  const searchSuggestions = useMemo(() => {
    const search = String(selectionSearch || "").trim().toLowerCase();
    let pool = [];
    if (sourceMode === "retail_only") {
      pool = retailProducts;
    } else if (sourceMode === "reference_plus_retail") {
      pool = [
        ...catalogProducts.map((item) => ({
          ...item,
          recommendationId: Number(item.id),
          sourceKind: "reference",
        })),
        ...retailProducts,
      ];
    } else {
      pool = catalogProducts.map((item) => ({
        ...item,
        recommendationId: Number(item.id),
        sourceKind: "reference",
      }));
    }
    if (selectionTypeId) {
      pool = pool.filter((item) => String(item?.typeId ?? item?.type_id ?? "") === String(selectionTypeId));
    }
    if (selectionSubtypeId) {
      pool = pool.filter((item) => String(item?.subtypeId ?? item?.subtype_id ?? "") === String(selectionSubtypeId));
    }
    if (search) {
      pool = pool.filter((item) => String(item?.name || "").toLowerCase().includes(search));
    }
    const selectedIds = new Set(selectedProducts.map((item) => String(item.recommendationId ?? item.id)));
    return pool
      .filter((item) => !selectedIds.has(String(item.recommendationId ?? item.id)))
      .slice(0, 20);
  }, [catalogProducts, retailProducts, selectedProducts, selectionSearch, selectionSubtypeId, selectionTypeId, sourceMode]);

  const nutrientAvailability = useMemo(() => {
    const selectedCoverage = (guidanceLists.coverageCodes || []).map((code) => ({
      code,
      label: nutrientLabel(code),
    }));
    const selectedLimit = (guidanceLists.limitCodes || []).map((code) => ({
      code,
      label: nutrientLabel(code),
    }));

    let availableCodes = new Set((availableNutrients || []).map((item) => item.code).filter(Boolean));
    let limitingProductName = "";

    if (comparisonMode === "selected" && selectedProducts.length > 0 && nutrientsDictionary.length > 0) {
      const productCodeSets = selectedProducts.map((product) => {
        const codes = new Set(
          nutrientsDictionary
            .map((item) => item.code)
            .filter((code) => isKnownNutrientValue(product?.[code]))
        );
        return { product, codes };
      });
      const limiting = [...productCodeSets].sort((left, right) => left.codes.size - right.codes.size)[0];
      limitingProductName = limiting?.product?.name || "";
      availableCodes = new Set(limiting?.codes || []);
      for (const item of productCodeSets) {
        availableCodes = new Set([...availableCodes].filter((code) => item.codes.has(code)));
      }
    }

    const availableItems = (nutrientsDictionary.length ? nutrientsDictionary : availableNutrients)
      .filter((item) => availableCodes.has(item.code))
      .map((item) => ({ code: item.code, label: item.ru_name || item.name || item.code }));

    const unavailableCoverage = selectedCoverage.filter((item) => !availableCodes.has(item.code));
    const unavailableLimit = selectedLimit.filter((item) => !availableCodes.has(item.code));
    const selectedTotal = selectedCoverage.length + selectedLimit.length;
    const unavailableTotal = unavailableCoverage.length + unavailableLimit.length;

    return {
      selectedCoverage,
      selectedLimit,
      unavailableCoverage,
      unavailableLimit,
      availableItems,
      limitingProductName,
      selectedTotal,
      unavailableTotal,
      isComplete: selectedTotal > 0 && unavailableTotal === 0,
    };
  }, [availableNutrients, comparisonMode, guidanceLists.coverageCodes, guidanceLists.limitCodes, nutrientLabel, nutrientsDictionary, selectedProducts]);

  const validateFilters = useCallback(() => {
    if (sourceMode === "retail_only" && retailProducts.length === 0) {
      return "Нет готовых магазинных продуктов. Сначала добавьте их во вкладке магазинных продуктов.";
    }
    if (sourceMode === "reference_plus_retail" && retailProducts.length === 0) {
      return "Для смешанного режима нужен хотя бы один готовый магазинный продукт.";
    }
    if (!availableNutrientsLoading && nutrientAvailability.availableItems.length === 0) {
      return "Для выбранного источника пока нет доступных пищевых веществ для расчета.";
    }
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
  }, [availableNutrientsLoading, comparisonMode, nutrientAvailability.availableItems.length, retailProducts.length, selectedProducts.length, sourceMode, subtypeId, typeId]);

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
  const hasCoverageDimension = payload?.has_coverage_dimension !== false;
  const hasLimitDimension = payload?.has_limit_dimension !== false;

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
      let localPayload = null;
      if (sourceMode === "reference_only") {
        const localCatalog = await ensureLocalCatalog();
        setLoadingProgress(24);
        setLoadingDetail("Подготовка данных для расчета");
        localPayload = toRecommendationPayload(localCatalog);
      } else {
        setLoadingProgress(28);
        setLoadingDetail("Подготовка данных для расчета");
      }
      setLoadingProgress(40);
      startProgress("Расчет показателей покрытия, лимитной нагрузки и приоритетности");

      const data = await fetchRecommendations({
        profileId: profileIdNum,
        mode: "catalog",
        sourceMode,
        comparisonMode,
        typeId: typeId || null,
        subtypeId: subtypeId || null,
        limit: 500,
        localProducts: localPayload,
        selectedProductIds: comparisonMode === "selected"
          ? selectedProducts.map((item) => Number(item.recommendationId ?? item.id))
          : null,
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
  }, [comparisonMode, ensureLocalCatalog, profileIdNum, selectedProducts, sourceMode, startProgress, stopProgress, subtypeId, typeId, validateFilters]);

  const stats = useMemo(() => {
    const total = items.length;
    const excluded = items.filter((item) => item.class_code === "excluded").length;
    const scoredItems = items
      .map((item) => Number(item?.score_components?.score_percent_100))
      .filter((value) => Number.isFinite(value));
    const avgPriority = scoredItems.length
      ? roundValue(scoredItems.reduce((acc, value) => acc + value, 0) / scoredItems.length)
      : null;
    return { total, excluded, avgPriority };
  }, [items]);

  const comparisonLabel = useMemo(() => {
    if (comparisonMode === "global") {
      if (sourceMode === "retail_only") return "все готовые магазинные продукты";
      if (sourceMode === "reference_plus_retail") return "все эталонные и готовые магазинные продукты";
      return "вся база продуктов";
    }
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
  }, [comparisonMode, sourceMode, subtypeId, subtypes, typeId, types]);

  const sourceModeLabel = useMemo(() => {
    const found = sourceModeOptions.find((item) => item.value === sourceMode);
    return found?.label || "—";
  }, [sourceMode]);

  const addSelectedProduct = (product) => {
    setSelectedProducts((prev) => (
      prev.some((item) => String(item.recommendationId ?? item.id) === String(product.recommendationId ?? product.id))
        ? prev
        : [...prev, product]
    ));
  };

  const removeSelectedProduct = (recommendationId) => {
    setSelectedProducts((prev) => prev.filter((item) => String(item.recommendationId ?? item.id) !== String(recommendationId)));
  };

  const sortLabel = (field, label) => {
    if (sortBy !== field) return `${label} ↕`;
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
          Сначала выберите источник продуктов и множество сравнения. Алгоритм сравнивает продукты только внутри выбранной базы,
          группы, подгруппы или вручную собранного множества. После этого рассчитываются уровень покрытия, уровень лимитной нагрузки
          и итоговая оценка приоритетности продукта.
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
              <label>Источник продуктов</label>
              <select
                style={input}
                value={sourceMode}
                onChange={(event) => {
                  setSourceMode(event.target.value);
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
                {sourceModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: "#666" }}>
                {sourceMode === "reference_only" && "Используется локальная копия эталонного справочника."}
                {sourceMode === "retail_only" && "Используются только готовые магазинные продукты текущего пользователя."}
                {sourceMode === "reference_plus_retail" && "Сравнение строится по эталонным и готовым магазинным продуктам одновременно."}
              </div>
            </div>

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
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "grid",
                  gridTemplateColumns: isCompactLayout ? "1fr" : "minmax(0, 1.2fr) minmax(320px, 0.8fr)",
                  gap: 12,
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    display: "grid",
                    gap: 10,
                    gridTemplateRows: "auto auto minmax(280px, 280px)",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Добавить продукты в множество сравнения</div>
                  <div style={{ display: "grid", gridTemplateColumns: isCompactLayout ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 8 }}>
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

                  <div style={{ display: "grid", gap: 8, minHeight: 0, overflow: "auto", alignContent: "start" }}>
                    {searchSuggestions.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#666" }}>Подходящие продукты не найдены.</div>
                    ) : (
                      searchSuggestions.map((product) => (
                        <div
                          key={product.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            border: "1px solid #ddd",
                            borderRadius: 10,
                            background: "#fff",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{product.name}</div>
                            <div style={{ fontSize: 12, color: "#666" }}>
                              {product.subtypeName || product.typeName || "Без подгруппы"}
                            </div>
                            <div style={{ fontSize: 11, color: "#8a93a0", marginTop: 4 }}>
                              {product.sourceKind === "retail" ? "Магазинный продукт" : "Эталонный продукт"}
                            </div>
                          </div>
                          <button
                            type="button"
                            style={{
                              ...btn,
                              borderColor: "#2e7d32",
                              color: "#2e7d32",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                            onClick={() => addSelectedProduct(product)}
                            disabled={selectedProducts.some((item) => String(item.recommendationId ?? item.id) === String(product.recommendationId ?? product.id))}
                          >
                            {selectedProducts.some((item) => String(item.recommendationId ?? item.id) === String(product.recommendationId ?? product.id)) ? "Добавлено" : "Добавить"}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    display: "grid",
                    gap: 10,
                    alignContent: "start",
                    gridTemplateRows: "auto auto minmax(280px, 280px)",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Текущее множество сравнения</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Выбрано продуктов: {selectedProducts.length}
                  </div>
                  <div style={{ display: "grid", gap: 8, minHeight: 0, overflow: "auto", alignContent: "start" }}>
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
                            <div style={{ fontSize: 11, color: "#8a93a0", marginTop: 4 }}>
                              {product.sourceKind === "retail" ? "Магазинный продукт" : "Эталонный продукт"}
                            </div>
                          </div>
                          <button type="button" style={btn} onClick={() => removeSelectedProduct(product.recommendationId ?? product.id)}>
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

          <div
            style={{
              border: `1px solid ${nutrientAvailability.unavailableTotal ? "#f2d39b" : "#cfe6cf"}`,
              borderRadius: 12,
              padding: 12,
              background: nutrientAvailability.unavailableTotal ? "#fffaf0" : "#f8fcf8",
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 700 }}>Пищевые вещества для анализа</div>
              <div style={{ fontSize: 12, color: "#666" }}>
                {availableNutrientsLoading ? "Проверяем доступность..." : `Доступно для анализа: ${nutrientAvailability.availableItems.length}`}
              </div>
            </div>

            <div style={{ color: nutrientAvailability.unavailableTotal ? "#8a6d1d" : "#1f5f26", fontSize: 13, lineHeight: 1.5 }}>
              {nutrientAvailability.selectedTotal === 0 && "В пищевых ориентирах пока не выбраны вещества покрытия или лимитной нагрузки."}
              {nutrientAvailability.selectedTotal > 0 && nutrientAvailability.isComplete && (
                "Информация о содержании выбранных пищевых веществ есть во всех анализируемых продуктах. Анализ будет полноценным."
              )}
              {nutrientAvailability.selectedTotal > 0 && nutrientAvailability.unavailableTotal > 0 && (
                "Часть выбранных пищевых веществ отсутствует в анализируемых продуктах. Анализ будет неполноценным, лучше выбрать вещества из доступного списка."
              )}
              {nutrientAvailability.limitingProductName && (
                <> Минимальный набор данных сейчас у продукта «{nutrientAvailability.limitingProductName}».</>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isCompactLayout ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 600 }}>Выбрано для покрытия</div>
                <NutrientPillList items={nutrientAvailability.selectedCoverage} emptyText="Список покрытия пуст." tone="good" />
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 600 }}>Выбрано для лимитной нагрузки</div>
                <NutrientPillList items={nutrientAvailability.selectedLimit} emptyText="Список лимитной нагрузки пуст." tone="warning" />
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 600 }}>Недоступно из выбранного</div>
                <NutrientPillList
                  items={[...nutrientAvailability.unavailableCoverage, ...nutrientAvailability.unavailableLimit]}
                  emptyText="Все выбранные вещества доступны."
                  tone={nutrientAvailability.unavailableTotal ? "warning" : "good"}
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>Доступные пищевые вещества</div>
              <div style={{ maxHeight: 120, overflow: "auto", border: "1px solid #e3e8ef", borderRadius: 10, padding: 8, background: "#fff" }}>
                <NutrientPillList items={nutrientAvailability.availableItems} emptyText="Для выбранного источника пока нет полного набора данных." />
              </div>
            </div>
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

        {sourceMode !== "reference_only" && retailProducts.length === 0 && (
          <div style={{ color: "#8a6d1d", lineHeight: 1.5 }}>
            Готовых магазинных продуктов пока нет. Сначала добавьте их во вкладке магазинных продуктов и заполните пищевую ценность.
          </div>
        )}
        {error && <div style={{ color: "crimson" }}>{error}</div>}
      </div>

        {payload && (
        <div style={{ ...box, padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Источник продуктов</div>
              <div>{sourceModeLabel}</div>
            </div>
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

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              padding: "10px 12px",
              borderRadius: 10,
              background: "#f7f9fc",
              border: "1px solid #e3e8ef",
              fontSize: 13,
              color: "#556",
            }}
          >
            <span>Нажмите на заголовок столбца со стрелкой, чтобы отсортировать таблицу.</span>
            <span style={{ fontWeight: 700, color: "#1f3b67" }}>
              {sortBy === "coverage_percent_100" && "Сейчас сортировка: покрытие"}
              {sortBy === "limit_percent_100" && "Сейчас сортировка: лимитная нагрузка"}
              {sortBy === "score_percent_100" && "Сейчас сортировка: итоговая оценка"}
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>Продукт</th>
                  {hasCoverageDimension && (
                    <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>
                      <button
                        type="button"
                        style={{
                          ...btn,
                          padding: "0 0 2px",
                          border: "none",
                          background: "transparent",
                          fontWeight: 700,
                          color: sortBy === "coverage_percent_100" ? "#1f3b67" : "#222",
                          borderBottom: "1px dashed #9fb2c9",
                          borderRadius: 0,
                        }}
                        onClick={() => toggleSort("coverage_percent_100")}
                        title="Нажмите, чтобы отсортировать по уровню покрытия"
                      >
                        {sortLabel("coverage_percent_100", "Уровень покрытия")}
                      </button>
                    </th>
                  )}
                  {hasLimitDimension && (
                    <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>
                      <button
                        type="button"
                        style={{
                          ...btn,
                          padding: "0 0 2px",
                          border: "none",
                          background: "transparent",
                          fontWeight: 700,
                          color: sortBy === "limit_percent_100" ? "#1f3b67" : "#222",
                          borderBottom: "1px dashed #9fb2c9",
                          borderRadius: 0,
                        }}
                        onClick={() => toggleSort("limit_percent_100")}
                        title="Нажмите, чтобы отсортировать по уровню лимитной нагрузки"
                      >
                        {sortLabel("limit_percent_100", "Уровень лимитной нагрузки")}
                      </button>
                    </th>
                  )}
                  <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #eee" }}>
                    <button
                      type="button"
                      style={{
                        ...btn,
                        padding: "0 0 2px",
                        border: "none",
                        background: "transparent",
                        fontWeight: 700,
                        color: sortBy === "score_percent_100" ? "#1f3b67" : "#222",
                        borderBottom: "1px dashed #9fb2c9",
                        borderRadius: 0,
                      }}
                      onClick={() => toggleSort("score_percent_100")}
                      title="Нажмите, чтобы отсортировать по итоговой оценке"
                    >
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
                      {hasCoverageDimension && (
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", minWidth: 180 }}>
                          <div style={{ fontWeight: 700 }}>{fmtPercent(score.coverage_percent_100)}</div>
                          <div style={{ marginTop: 6, display: "inline-block", padding: "4px 8px", borderRadius: 999, border: `1px solid ${coverage.border}`, background: coverage.bg, fontSize: 12 }}>
                            {coverage.text}
                          </div>
                        </td>
                      )}
                      {hasLimitDimension && (
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f3f3", minWidth: 180 }}>
                          <div style={{ fontWeight: 700 }}>{fmtPercent(score.limit_percent_100)}</div>
                          <div style={{ marginTop: 6, display: "inline-block", padding: "4px 8px", borderRadius: 999, border: `1px solid ${limit.border}`, background: limit.bg, fontSize: 12 }}>
                            {limit.text}
                          </div>
                        </td>
                      )}
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
