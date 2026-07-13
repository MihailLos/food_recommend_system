import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchNutrientsDictionary,
  fetchProfileTargets,
  updateProfileTargets,
} from "../../api/consumer";

const box = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
};

const input = {
  padding: 8,
  border: "1px solid #ddd",
  borderRadius: 8,
  width: "100%",
  boxSizing: "border-box",
};

const btn = {
  padding: "8px 12px",
  border: "1px solid #ddd",
  background: "#fff",
  borderRadius: 8,
  cursor: "pointer",
};

const dragItemStyles = {
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "#fff",
  cursor: "grab",
  fontSize: 13,
};

const HIDDEN_NUTRIENT_CODES = new Set(["starch_g", "ash_g", "alcohol_pct"]);

const TARGET_SECTIONS = [
  {
    key: "macronutrients",
    title: "Макронутриенты",
    description: "Значения этой группы используются как ориентиры по основным компонентам питания.",
    codes: ["protein_g", "fats_g", "carbs_g", "dietary_fiber_g", "mds_g", "water_g"],
  },
  {
    key: "minerals",
    title: "Минеральные вещества",
    description: "Эти ориентиры используются при расчете покрытия и лимитной нагрузки по минеральным веществам.",
    codes: ["na_mg", "ca_mg", "k_mg", "mg_mg", "p_mg", "fe_mg"],
  },
  {
    key: "vitamins",
    title: "Витамины",
    description: "Эти ориентиры используются при расчете покрытия по витаминам и эквивалентам.",
    codes: [
      "a_mg",
      "beta_carotene_mg",
      "b1_mg",
      "b2_mg",
      "pp_mg",
      "c_mg",
      "retinol_index",
      "tocopherol_index",
      "niacin_index",
    ],
  },
  {
    key: "fat_acids",
    title: "Жирные кислоты",
    description: "Здесь собраны ориентиры по жирнокислотному составу и холестерину.",
    codes: ["nlc_g", "pufa_g", "cholesterol_g"],
  },
  {
    key: "other",
    title: "Другие пищевые вещества",
    description: "Дополнительные ориентиры, которые не входят в основные группы выше.",
    codes: ["organic_acids_g"],
  },
];

const BMI_GUIDANCE_PRESETS = {
  underweight: {
    energyHint: "По текущему ИМТ стоит рассмотреть увеличение значения в поле изменения расчетного суточного расхода энергии.",
    coverageCodes: ["protein_g", "pufa_g", "ca_mg", "fe_mg", "b1_mg", "b2_mg", "pp_mg"],
    limitCodes: [],
  },
  overweight: {
    energyHint: "По текущему ИМТ стоит рассмотреть уменьшение значения в поле изменения расчетного суточного расхода энергии.",
    coverageCodes: ["dietary_fiber_g", "water_g", "pufa_g"],
    limitCodes: ["mds_g", "nlc_g", "na_mg"],
  },
};

function round2(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function sanitizeGuidanceCodes(codes) {
  return (codes || []).filter((code) => !HIDDEN_NUTRIENT_CODES.has(code));
}

const MILLIGRAM_EQUIVALENT_CODES = new Set(["retinol_index", "tocopherol_index", "niacin_index"]);

function formatUnit(unit, code = "") {
  if (MILLIGRAM_EQUIVALENT_CODES.has(code)) return "миллиграммы (мг)";
  if (!unit) return "—";
  if (unit === "g") return "граммы (г)";
  if (unit === "mg") return "миллиграммы (мг)";
  return unit;
}

function buildSnapshot({ energyDeltaKcal, targetValues, coverageCodes, limitCodes, overrideCodes }) {
  return JSON.stringify({
    energyDeltaKcal: Number(energyDeltaKcal || 0),
    targetValues: Object.fromEntries(
      Object.entries(targetValues || {})
        .map(([key, value]) => [key, value === "" ? "" : round2(value)])
        .sort(([left], [right]) => left.localeCompare(right, "ru"))
    ),
    coverageCodes: [...(coverageCodes || [])].sort((a, b) => a.localeCompare(b, "ru")),
    limitCodes: [...(limitCodes || [])].sort((a, b) => a.localeCompare(b, "ru")),
    overrideCodes: [...(overrideCodes || [])].sort((a, b) => a.localeCompare(b, "ru")),
  });
}

function toNumberOrEmpty(value) {
  if (value === "" || value == null) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function flattenTargets(targets) {
  if (!targets) return {};

  return {
    protein_g: targets?.target_macros_g_day?.protein_g ?? "",
    fats_g: targets?.target_macros_g_day?.fat_g ?? "",
    carbs_g: targets?.target_macros_g_day?.carb_g ?? "",
    dietary_fiber_g: targets?.target_fiber_g_day?.min ?? "",
    water_g: targets?.target_water_g_day?.min ?? "",
    mds_g: targets?.target_mds_g_day?.min ?? "",
    organic_acids_g: targets?.target_other_nutrients_day?.organic_acids_g ?? "",
    nlc_g: targets?.target_fat_acids_day?.nlc_g ?? "",
    pufa_g: targets?.target_fat_acids_day?.pufa_g ?? "",
    cholesterol_g: targets?.target_cholesterol_mg_day ?? "",
    a_mg: targets?.target_vitamins_day?.["A_Vitamin (mg)"] ?? "",
    beta_carotene_mg: targets?.target_vitamins_day?.["Beta_Carotene (mg)"] ?? "",
    b1_mg: targets?.target_vitamins_day?.["B1_Vitamin (mg)"] ?? "",
    b2_mg: targets?.target_vitamins_day?.["B2_Vitamin (mg)"] ?? "",
    pp_mg: targets?.target_vitamins_day?.["PP_Vitamin (mg)"] ?? "",
    c_mg: targets?.target_vitamins_day?.["C_Vitamin (mg)"] ?? "",
    retinol_index: targets?.target_vitamins_day?.["Retinol_Index"] ?? "",
    tocopherol_index: targets?.target_vitamins_day?.["Tocopherol_Index"] ?? "",
    niacin_index: targets?.target_vitamins_day?.["Niacin_Index"] ?? "",
    na_mg: targets?.target_minerals_day?.na_mg ?? "",
    k_mg: targets?.target_minerals_day?.["K (mg)"] ?? "",
    ca_mg: targets?.target_minerals_day?.["Ca (mg)"] ?? "",
    mg_mg: targets?.target_minerals_day?.["Mg (mg)"] ?? "",
    p_mg: targets?.target_minerals_day?.["P (mg)"] ?? "",
    fe_mg: targets?.target_minerals_day?.["Fe (mg)"] ?? "",
    alcohol_pct: targets?.target_limit_only_day?.alcohol_pct ?? "",
  };
}

function InfoText({ children }) {
  return <div style={{ fontSize: 13, color: "#555", lineHeight: 1.55 }}>{children}</div>;
}

function SuggestionList({ title, codes, nutrientMeta, color, actionLabel, onApply }) {
  if (!codes.length) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {codes.map((code) => (
          <span
            key={code}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: `1px solid ${color}33`,
              background: "#fff",
              fontSize: 12,
            }}
          >
            {nutrientMeta(code)?.ru_name || code}
          </span>
        ))}
      </div>
      <div>
        <button
          type="button"
          style={{ ...btn, borderColor: color, color, fontWeight: 700 }}
          onClick={() => onApply(codes)}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function NutrientList({ codes, nutrientMeta, onRemove, color, onDropCode, dragTarget, direction }) {
  if (!codes.length) {
    return (
      <div
        onDragOver={(event) => {
          if (onDropCode) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          if (!onDropCode) return;
          event.preventDefault();
          const code = event.dataTransfer.getData("text/plain");
          if (code) onDropCode(code);
        }}
      style={{
          minHeight: 56,
          border: "1px dashed #d8d8d8",
          borderRadius: 10,
          padding: 10,
          background: dragTarget === direction ? "rgba(46,125,50,0.06)" : "#fafafa",
          fontSize: 12,
          color: "#666",
          display: "flex",
          alignItems: "center",
        }}
      >
        Перетащите сюда пищевое вещество.
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        if (onDropCode) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (!onDropCode) return;
        event.preventDefault();
        const code = event.dataTransfer.getData("text/plain");
        if (code) onDropCode(code);
      }}
      style={{
        display: "grid",
        gap: 8,
        minHeight: 56,
      }}
    >
      {codes.map((code) => (
        <div
          key={code}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 10px",
            borderRadius: 10,
            border: `1px solid ${color}33`,
            background: "#fff",
            fontSize: 13,
            lineHeight: 1.35,
          }}
        >
          <span>{nutrientMeta(code)?.ru_name || code}</span>
          <button
            type="button"
            onClick={() => onRemove(code)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color,
              fontWeight: 700,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ConsumerGoalsTab({ profileId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [error, setError] = useState("");
  const [targets, setTargets] = useState(null);
  const [nutrients, setNutrients] = useState([]);
  const [energyDeltaKcal, setEnergyDeltaKcal] = useState(0);
  const [targetValues, setTargetValues] = useState({});
  const [baseTargetValues, setBaseTargetValues] = useState({});
  const [coverageCodes, setCoverageCodes] = useState([]);
  const [limitCodes, setLimitCodes] = useState([]);
  const [overrideCodes, setOverrideCodes] = useState(new Set());
  const [dragTarget, setDragTarget] = useState("");
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const bootstrappedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const lastSavedSnapshotRef = useRef("");

  const profileIdNum = useMemo(() => {
    const value = Number(profileId);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [profileId]);

  const nutrientMap = useMemo(() => {
    const map = new Map();
    for (const item of nutrients) {
      map.set(item.code, item);
    }
    return map;
  }, [nutrients]);

  const nutrientMeta = useCallback((code) => nutrientMap.get(code) || null, [nutrientMap]);

  const availableNutrients = useMemo(
    () =>
      normalizeList(nutrients)
        .filter((item) => !HIDDEN_NUTRIENT_CODES.has(item.code))
        .sort((a, b) => String(a.ru_name || "").localeCompare(String(b.ru_name || ""), "ru")),
    [nutrients]
  );

  const unassignedNutrients = useMemo(() => {
    const assigned = new Set([...coverageCodes, ...limitCodes]);
    return availableNutrients.filter((item) => !assigned.has(item.code));
  }, [availableNutrients, coverageCodes, limitCodes]);

  const displayedTargetEnergy = useMemo(() => {
    const tdee = Number(targets?.energy_calc?.tdee_kcal_day || 0);
    return round2(Math.max(0, tdee + Number(energyDeltaKcal || 0)));
  }, [energyDeltaKcal, targets]);

  const bmiValue = useMemo(() => {
    const value = Number(targets?.bmi);
    return Number.isFinite(value) ? value : null;
  }, [targets]);

  const bmiGuidance = useMemo(() => {
    if (bmiValue == null) return null;
    if (bmiValue < 18.5) return BMI_GUIDANCE_PRESETS.underweight;
    if (bmiValue < 25) return null;
    return BMI_GUIDANCE_PRESETS.overweight;
  }, [bmiValue]);

  const defaultCoverageCodes = useMemo(
    () => sanitizeGuidanceCodes(targets?.guidance_meta?.default_coverage_codes || []),
    [targets]
  );

  const defaultLimitCodes = useMemo(
    () => sanitizeGuidanceCodes(targets?.guidance_meta?.default_limit_codes || []),
    [targets]
  );

  const loadData = useCallback(async () => {
    if (!profileIdNum) return;
    setLoading(true);
    setError("");
    try {
      const [targetsData, nutrientsData] = await Promise.all([
        fetchProfileTargets(profileIdNum),
        fetchNutrientsDictionary(),
      ]);
      const flattened = flattenTargets(targetsData);
      const overrides = Object.keys(targetsData?.manual_target_overrides || {});

      setTargets(targetsData);
      setNutrients(normalizeList(nutrientsData));
      setEnergyDeltaKcal(Number(targetsData?.energy_delta_kcal || 0));
      setTargetValues(flattened);
      setBaseTargetValues(flattened);
      setCoverageCodes(sanitizeGuidanceCodes(targetsData?.guidance_lists?.coverage_codes || []));
      setLimitCodes(sanitizeGuidanceCodes(targetsData?.guidance_lists?.limit_codes || []));
      const nextOverrideCodes = new Set(overrides);
      setOverrideCodes(nextOverrideCodes);
      lastSavedSnapshotRef.current = buildSnapshot({
        energyDeltaKcal: Number(targetsData?.energy_delta_kcal || 0),
        targetValues: flattened,
        coverageCodes: sanitizeGuidanceCodes(targetsData?.guidance_lists?.coverage_codes || []),
        limitCodes: sanitizeGuidanceCodes(targetsData?.guidance_lists?.limit_codes || []),
        overrideCodes: nextOverrideCodes,
      });
      setSaveStatus("idle");
      bootstrappedRef.current = true;
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || requestError?.message || "Не удалось загрузить пищевые ориентиры.");
    } finally {
      setLoading(false);
    }
  }, [profileIdNum]);

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
    bootstrappedRef.current = false;
    setTargets(null);
    setTargetValues({});
    setBaseTargetValues({});
    setCoverageCodes([]);
    setLimitCodes([]);
    setOverrideCodes(new Set());
    setSaveStatus("idle");
    if (profileIdNum) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [loadData, profileIdNum]);

  const persist = useCallback(async () => {
    if (!profileIdNum || !bootstrappedRef.current) return;
    setSaving(true);
    setSaveStatus("saving");
    setError("");

    try {
      const nutrientTargets = Array.from(overrideCodes)
        .map((code) => ({
          nutrient_code: code,
          target_value: round2(targetValues[code]),
        }))
        .filter((item) => Number.isFinite(item.target_value) && item.target_value >= 0);

      const payload = {
        title: "Пищевые ориентиры",
        energy_delta_kcal: Number(energyDeltaKcal || 0),
        macros_pct: {
          protein_pct: null,
          fat_pct: null,
          carb_pct: null,
        },
        guidance_lists: {
          coverage_codes: coverageCodes,
          limit_codes: limitCodes,
        },
        nutrient_targets: nutrientTargets,
      };

      const updated = await updateProfileTargets(profileIdNum, payload);
      const flattened = flattenTargets(updated);

      setTargets(updated);
      setTargetValues(flattened);
      setBaseTargetValues(flattened);
      setEnergyDeltaKcal(Number(updated?.energy_delta_kcal || 0));
      setCoverageCodes(sanitizeGuidanceCodes(updated?.guidance_lists?.coverage_codes || []));
      setLimitCodes(sanitizeGuidanceCodes(updated?.guidance_lists?.limit_codes || []));
      const nextOverrideCodes = new Set(Object.keys(updated?.manual_target_overrides || {}));
      setOverrideCodes(nextOverrideCodes);
      lastSavedSnapshotRef.current = buildSnapshot({
        energyDeltaKcal: Number(updated?.energy_delta_kcal || 0),
        targetValues: flattened,
        coverageCodes: sanitizeGuidanceCodes(updated?.guidance_lists?.coverage_codes || []),
        limitCodes: sanitizeGuidanceCodes(updated?.guidance_lists?.limit_codes || []),
        overrideCodes: nextOverrideCodes,
      });
      setSaveStatus("saved");
    } catch (requestError) {
      setSaveStatus("error");
      setError(requestError?.response?.data?.detail || requestError?.message || "Не удалось сохранить пищевые ориентиры.");
    } finally {
      setSaving(false);
    }
  }, [coverageCodes, energyDeltaKcal, overrideCodes, profileIdNum, targetValues, limitCodes]);

  useEffect(() => {
    if (!bootstrappedRef.current) return undefined;
    const nextSnapshot = buildSnapshot({
      energyDeltaKcal,
      targetValues,
      coverageCodes,
      limitCodes,
      overrideCodes,
    });
    if (nextSnapshot === lastSavedSnapshotRef.current) {
      setSaveStatus((current) => (current === "saving" ? current : "idle"));
      return undefined;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      persist();
    }, 700);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [coverageCodes, energyDeltaKcal, limitCodes, overrideCodes, persist, targetValues]);

  const setTargetField = (code, value) => {
    const parsed = toNumberOrEmpty(value);
    setTargetValues((prev) => ({ ...prev, [code]: parsed }));
    setOverrideCodes((prev) => {
      const next = new Set(prev);
      next.add(code);
      return next;
    });
  };

  const resetTargetField = (code) => {
    setTargetValues((prev) => ({ ...prev, [code]: baseTargetValues[code] ?? "" }));
    setOverrideCodes((prev) => {
      const next = new Set(prev);
      next.delete(code);
      return next;
    });
  };

  const assignCode = (code, direction) => {
    if (!code) return;
    if (direction === "coverage") {
      setCoverageCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
      setLimitCodes((prev) => prev.filter((item) => item !== code));
    } else {
      setLimitCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
      setCoverageCodes((prev) => prev.filter((item) => item !== code));
    }
    setDragTarget("");
  };

  const removeCoverageCode = (code) => {
    setCoverageCodes((prev) => prev.filter((item) => item !== code));
  };

  const removeLimitCode = (code) => {
    setLimitCodes((prev) => prev.filter((item) => item !== code));
  };

  const clearCoverageCodes = () => {
    setCoverageCodes([]);
  };

  const clearLimitCodes = () => {
    setLimitCodes([]);
  };

  const resetGuidanceListsToDefault = () => {
    setCoverageCodes(defaultCoverageCodes);
    setLimitCodes(defaultLimitCodes);
  };

  const addCodesToCoverage = (codes) => {
    setCoverageCodes((prev) => [...prev, ...codes.filter((code) => !prev.includes(code))]);
    setLimitCodes((prev) => prev.filter((code) => !codes.includes(code)));
  };

  const addCodesToLimit = (codes) => {
    setLimitCodes((prev) => [...prev, ...codes.filter((code) => !prev.includes(code))]);
    setCoverageCodes((prev) => prev.filter((code) => !codes.includes(code)));
  };

  const missingCoverageSuggestionCodes = useMemo(
    () => (bmiGuidance?.coverageCodes || []).filter((code) => !coverageCodes.includes(code)),
    [bmiGuidance, coverageCodes]
  );

  const missingLimitSuggestionCodes = useMemo(
    () => (bmiGuidance?.limitCodes || []).filter((code) => !limitCodes.includes(code)),
    [bmiGuidance, limitCodes]
  );

  const renderedSections = useMemo(
    () =>
      TARGET_SECTIONS.map((section) => ({
        ...section,
        items: section.codes
          .filter((code) => !HIDDEN_NUTRIENT_CODES.has(code))
          .filter((code) => nutrientMap.has(code) || targetValues[code] !== undefined)
          .map((code) => ({
            code,
            label: nutrientMeta(code)?.ru_name || code,
            unit: formatUnit(nutrientMeta(code)?.unit || "", code),
            value: targetValues[code] ?? "",
            overridden: overrideCodes.has(code),
          })),
      })),
    [nutrientMap, nutrientMeta, overrideCodes, targetValues]
  );

  if (!profileIdNum) {
    return <div style={{ ...box, padding: 16 }}>Сначала выберите профиль.</div>;
  }

  if (loading) {
    return <div style={{ ...box, padding: 16 }}>Загрузка пищевых ориентиров...</div>;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...box, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Пищевые ориентиры</div>
          <div style={{ fontSize: 12, color: saveStatus === "error" ? "crimson" : "#666" }}>
            {saveStatus === "saving" && "Сохранение..."}
            {saveStatus === "saved" && "Сохранено"}
            {saveStatus === "error" && "Ошибка сохранения"}
            {saveStatus === "idle" && saving === false && "Автосохранение включено"}
          </div>
        </div>

        <InfoText>
          Раздел нужен для настройки значений, с которыми алгоритм сравнивает пищевой состав продуктов.
          По умолчанию ориентиры формируются по данным профиля и нормативам. При необходимости можно изменить
          отдельные значения вручную.
        </InfoText>

        {error && <div style={{ color: "crimson" }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Расчетный суточный расход энергии</div>
            <div>{targets?.energy_calc?.tdee_kcal_day ?? "—"} ккал/сут</div>
            <InfoText>Суточные энерготраты по профилю с учетом физической активности.</InfoText>
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Изменение расчетного суточного расхода энергии</div>
            <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0, 1fr)", gap: 8 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  style={{
                    ...btn,
                    padding: "8px 0",
                    width: 24,
                    borderColor: energyDeltaKcal < 0 ? "#c62828" : "#ddd",
                    color: energyDeltaKcal < 0 ? "#c62828" : "#444",
                  }}
                  onClick={() => setEnergyDeltaKcal(-Math.abs(Number(energyDeltaKcal || 0)))}
                >
                  −
                </button>
                <button
                  type="button"
                  style={{
                    ...btn,
                    padding: "8px 0",
                    width: 24,
                    borderColor: energyDeltaKcal >= 0 ? "#2e7d32" : "#ddd",
                    color: energyDeltaKcal >= 0 ? "#2e7d32" : "#444",
                  }}
                  onClick={() => setEnergyDeltaKcal(Math.abs(Number(energyDeltaKcal || 0)))}
                >
                  +
                </button>
              </div>
              <input
                style={input}
                type="number"
                min="0"
                step="10"
                value={Math.abs(Number(energyDeltaKcal || 0))}
                onChange={(event) => {
                  const magnitude = Math.abs(Number(event.target.value || 0));
                  setEnergyDeltaKcal(energyDeltaKcal < 0 ? -magnitude : magnitude);
                }}
              />
            </div>
            <InfoText>
              Если специалист рекомендовал дефицит или профицит энергии, задайте величину здесь, а направление выберите кнопками «−» или «+».
            </InfoText>
            {bmiGuidance?.energyHint && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "#f7f9fc",
                  border: "1px solid #dce5ef",
                  fontSize: 13,
                  color: "#334",
                }}
              >
                {bmiGuidance.energyHint}
              </div>
            )}
          </div>

          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Целевая энергия</div>
            <div>{displayedTargetEnergy} ккал/сут</div>
            <InfoText>Это итоговая энергия, от которой зависят целевые БЖУ и часть расчетов рекомендаций.</InfoText>
          </div>
        </div>
      </div>

      {renderedSections.map((section) => (
        <div key={section.key} style={{ ...box, padding: 16, display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700 }}>{section.title}</div>
            <InfoText>{section.description}</InfoText>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Показатель", "Единица", "Значение", ""].map((label) => (
                    <th key={label} style={{ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #eee", fontSize: 13 }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.items.map((item) => (
                  <tr key={item.code}>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>{item.label}</td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3", color: "#666" }}>{item.unit || "—"}</td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3" }}>
                      <input
                        style={input}
                        type="number"
                        step="0.01"
                        value={item.value}
                        onChange={(event) => setTargetField(item.code, event.target.value)}
                      />
                    </td>
                    <td style={{ padding: "8px 6px", borderBottom: "1px solid #f3f3f3", width: 140 }}>
                      {item.overridden ? (
                        <button type="button" style={btn} onClick={() => resetTargetField(item.code)}>
                          Вернуть базу
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#666" }}>Нормативное значение</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ ...box, padding: 16, display: "grid", gap: 14 }}>
        <div style={{ fontWeight: 700 }}>Состав пищевых веществ для расчета</div>
        <InfoText>
          Здесь задаются списки веществ покрытия и веществ лимитной нагрузки. Они напрямую влияют на расчет
          покрытия, лимитной нагрузки и итоговой приоритетности продукта.
        </InfoText>
        {bmiGuidance && (
          <div
            style={{
              display: "grid",
              gap: 12,
              padding: 12,
              borderRadius: 12,
              background: "#fafbfd",
              border: "1px solid #dde5ee",
            }}
          >
            <div style={{ fontWeight: 700 }}>Рекомендации по ИМТ</div>
            <InfoText>
              Система может помочь быстро добавить пищевые вещества, которые стоит учитывать при текущем ИМТ. Применение остается за пользователем.
            </InfoText>
            <SuggestionList
              title="Рекомендуется добавить в пищевые вещества покрытия"
              codes={missingCoverageSuggestionCodes}
              nutrientMeta={nutrientMeta}
              color="#2e7d32"
              actionLabel="Добавить в покрытие"
              onApply={addCodesToCoverage}
            />
            <SuggestionList
              title="Рекомендуется добавить в пищевые вещества лимитной нагрузки"
              codes={missingLimitSuggestionCodes}
              nutrientMeta={nutrientMeta}
              color="#c62828"
              actionLabel="Добавить в лимитную нагрузку"
              onApply={addCodesToLimit}
            />
            {!missingCoverageSuggestionCodes.length && !missingLimitSuggestionCodes.length && (
              <div style={{ fontSize: 13, color: "#556" }}>
                Все рекомендуемые для текущего ИМТ пищевые вещества уже включены.
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isCompactLayout ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr) minmax(320px, 0.9fr)",
            gap: 12,
            alignItems: "start",
          }}
        >
          <div style={{ border: "1px solid #d8ead7", borderRadius: 12, padding: 12, display: "grid", gap: 10, alignContent: "start", order: isCompactLayout ? 2 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, color: "#2e7d32" }}>Пищевые вещества покрытия</div>
              <button type="button" style={btn} onClick={clearCoverageCodes}>
                Очистить все
              </button>
            </div>
            <NutrientList
              codes={coverageCodes}
              nutrientMeta={nutrientMeta}
              onRemove={removeCoverageCode}
              color="#2e7d32"
              onDropCode={(code) => assignCode(code, "coverage")}
              dragTarget={dragTarget}
              direction="coverage"
            />
          </div>
          <div style={{ border: "1px solid #f1d7d7", borderRadius: 12, padding: 12, display: "grid", gap: 10, alignContent: "start", order: isCompactLayout ? 3 : 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, color: "#c62828" }}>Пищевые вещества лимитной нагрузки</div>
              <button type="button" style={btn} onClick={clearLimitCodes}>
                Очистить все
              </button>
            </div>
            <NutrientList
              codes={limitCodes}
              nutrientMeta={nutrientMeta}
              onRemove={removeLimitCode}
              color="#c62828"
              onDropCode={(code) => assignCode(code, "limit")}
              dragTarget={dragTarget}
              direction="limit"
            />
          </div>
          <div
            style={{
              border: "1px dashed #c8d0d8",
              borderRadius: 12,
              padding: 12,
              display: "grid",
              gap: 10,
              alignContent: "start",
              maxHeight: 520,
              overflow: "auto",
              order: isCompactLayout ? 1 : 3,
            }}
          >
            <div style={{ fontWeight: 700 }}>Доступные пищевые вещества</div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <InfoText>
                {isCompactLayout
                  ? "Сначала прокрутите этот список и выберите нужные вещества, затем перетащите их в списки ниже."
                  : "Прокрутите этот список вниз и перетащите вещество в один из списков слева."}
              </InfoText>
              <button type="button" style={btn} onClick={resetGuidanceListsToDefault}>
                Вернуть вещества по умолчанию
              </button>
            </div>
            {unassignedNutrients.length > 5 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "#f6f8fb",
                  border: "1px solid #d9e1ea",
                  fontSize: 12,
                  color: "#445",
                  fontWeight: 600,
                }}
              >
                <span>Список ниже прокручивается</span>
                <span aria-hidden="true">↓</span>
              </div>
            )}
            {unassignedNutrients.length === 0 ? (
              <div style={{ fontSize: 12, color: "#666" }}>Все доступные вещества уже распределены по спискам.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {unassignedNutrients.map((item) => (
                  <div
                    key={item.code}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", item.code);
                    }}
                    onDragEnd={() => setDragTarget("")}
                    style={dragItemStyles}
                  >
                    <div style={{ fontWeight: 600 }}>{item.ru_name}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{formatUnit(item.unit, item.code)}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        style={{
                          ...btn,
                          padding: "6px 10px",
                          borderColor: "#2e7d32",
                          color: "#2e7d32",
                          fontWeight: 700,
                        }}
                        onClick={() => assignCode(item.code, "coverage")}
                        title="Добавить в пищевые вещества покрытия"
                      >
                        + Покрытие
                      </button>
                      <button
                        type="button"
                        style={{
                          ...btn,
                          padding: "6px 10px",
                          borderColor: "#c62828",
                          color: "#c62828",
                          fontWeight: 700,
                        }}
                        onClick={() => assignCode(item.code, "limit")}
                        title="Добавить в пищевые вещества лимитной нагрузки"
                      >
                        + Лимит
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
