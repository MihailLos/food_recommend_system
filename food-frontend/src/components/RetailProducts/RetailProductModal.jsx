import React, { useEffect, useMemo, useState } from "react";
import {
  fetchFoodAdditiveGroups,
  fetchFoodAdditives,
  matchRetailComposition,
  matchRetailName,
  previewRetailNutritionFill,
} from "../../api/retailProducts";

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 1300,
};

const card = {
  width: "min(1080px, 100%)",
  maxHeight: "92vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: 16,
  boxShadow: "0 12px 30px rgba(0,0,0,0.2)",
  padding: 18,
  display: "grid",
  gap: 16,
};

const input = {
  padding: 10,
  border: "1px solid #d9dfe6",
  borderRadius: 10,
  boxSizing: "border-box",
  width: "100%",
  font: "inherit",
};

const btn = {
  padding: "9px 12px",
  border: "1px solid #d5dbe3",
  background: "#fff",
  borderRadius: 10,
  cursor: "pointer",
  font: "inherit",
};

const nutrientSections = [
  {
    title: "Базовая пищевая ценность",
    fields: [
      ["energy_kcal", "Энергетическая ценность", "ккал"],
      ["protein_g", "Белки", "г"],
      ["fats_g", "Жиры", "г"],
      ["carbs_g", "Углеводы", "г"],
      ["dietary_fiber_g", "Пищевые волокна", "г"],
      ["water_g", "Вода", "г"],
      ["mds_g", "Моно- и дисахариды", "г"],
      ["starch_g", "Крахмал", "г"],
    ],
  },
  {
    title: "Минералы",
    fields: [
      ["na_mg", "Натрий", "мг"],
      ["k_mg", "Калий", "мг"],
      ["ca_mg", "Кальций", "мг"],
      ["mg_mg", "Магний", "мг"],
      ["p_mg", "Фосфор", "мг"],
      ["fe_mg", "Железо", "мг"],
      ["ash_g", "Зола", "г"],
    ],
  },
  {
    title: "Витамины",
    fields: [
      ["a_mg", "Витамин A", "мг"],
      ["beta_carotene_mg", "Бета-каротин", "мг"],
      ["b1_mg", "Витамин B1", "мг"],
      ["b2_mg", "Витамин B2", "мг"],
      ["pp_mg", "Витамин PP", "мг"],
      ["c_mg", "Витамин C", "мг"],
      ["retinol_index", "Ретиноловый эквивалент", "мг"],
      ["tocopherol_index", "Токофероловый эквивалент", "мг"],
      ["niacin_index", "Ниациновый эквивалент", "мг"],
    ],
  },
  {
    title: "Жирные кислоты и другие вещества",
    fields: [
      ["nlc_g", "Насыщенные жирные кислоты", "г"],
      ["pufa_g", "Полиненасыщенные жирные кислоты", "г"],
      ["cholesterol_g", "Холестерин", "г"],
      ["organic_acids_g", "Органические кислоты", "г"],
      ["alcohol_pct", "Спирт", "%"],
    ],
  },
];

const steps = [
  "Название и эталон",
  "Состав и совпадения",
  "Пищевая ценность",
  "Проверка и сохранение",
];

const referenceModes = {
  AUTO: "auto",
  MANUAL: "manual",
};

function makeEmptyDraft() {
  return {
    name: "",
    composition_text: "",
    related_food_group: "",
    related_food_subgroup: "",
    related_food_product: "",
    visibility: "private",
    nutrition_fill_mode: "label_only",
    match_method: "manual",
    group_match_confidence: null,
    subgroup_match_confidence: null,
    product_match_confidence: null,
    components: [],
    additives: [],
    name_ocr_raw: "",
    composition_ocr_raw: "",
    nutrition_ocr_raw: "",
    energy_kcal: "",
    protein_g: "",
    fats_g: "",
    carbs_g: "",
    dietary_fiber_g: "",
    water_g: "",
    mds_g: "",
    starch_g: "",
    na_mg: "",
    k_mg: "",
    ca_mg: "",
    mg_mg: "",
    p_mg: "",
    fe_mg: "",
    ash_g: "",
    a_mg: "",
    beta_carotene_mg: "",
    b1_mg: "",
    b2_mg: "",
    pp_mg: "",
    c_mg: "",
    retinol_index: "",
    tocopherol_index: "",
    niacin_index: "",
    nlc_g: "",
    pufa_g: "",
    cholesterol_g: "",
    organic_acids_g: "",
    alcohol_pct: "",
  };
}

function hydrateDraft(product) {
  const draft = makeEmptyDraft();
  if (!product) return draft;
  return {
    ...draft,
    ...product,
    related_food_group: product.related_food_group || "",
    related_food_subgroup: product.related_food_subgroup || "",
    related_food_product: product.related_food_product || "",
    components: Array.isArray(product.components)
      ? product.components.map((item) => ({
          food_component_id: item.food_component,
          food_component_name: item.food_component_name,
          component_text: item.component_text || "",
          position_index: item.position_index ?? null,
          match_confidence: item.match_confidence ?? null,
          matched_by: item.matched_by || "manual",
        }))
      : [],
    additives: Array.isArray(product.additives)
      ? product.additives.map((item) => ({
          food_additive_id: item.food_additive,
          food_additive_name: item.food_additive_name,
          food_additive_code: item.food_additive_code,
          additive_text: item.additive_text || "",
          position_index: item.position_index ?? null,
          match_confidence: item.match_confidence ?? null,
          matched_by: item.matched_by || "manual",
        }))
      : [],
  };
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(",", ".").trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase().replace(/ё/g, "е");
}

export default function RetailProductModal({
  open,
  onClose,
  onSave,
  initialProduct,
  catalogProducts,
}) {
  const [draft, setDraft] = useState(makeEmptyDraft());
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [referenceMode, setReferenceMode] = useState(referenceModes.AUTO);
  const [manualSelectionUnlocked, setManualSelectionUnlocked] = useState(false);
  const [nameMatch, setNameMatch] = useState(null);
  const [compositionMatch, setCompositionMatch] = useState(null);
  const [fillPreview, setFillPreview] = useState(null);
  const [referenceSearch, setReferenceSearch] = useState("");
  const [additiveGroups, setAdditiveGroups] = useState([]);
  const [allAdditives, setAllAdditives] = useState([]);
  const [componentFilterGroup, setComponentFilterGroup] = useState("");
  const [componentFilterSubgroup, setComponentFilterSubgroup] = useState("");
  const [componentSearch, setComponentSearch] = useState("");
  const [additiveFilterGroup, setAdditiveFilterGroup] = useState("");
  const [additiveSearch, setAdditiveSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(hydrateDraft(initialProduct));
    setStep(0);
    setLoading(false);
    setError("");
    setReferenceMode(initialProduct?.product_match_confidence ? referenceModes.AUTO : referenceModes.MANUAL);
    setManualSelectionUnlocked(!initialProduct?.product_match_confidence);
    setNameMatch(null);
    setCompositionMatch(null);
    setFillPreview(null);
    setReferenceSearch(initialProduct?.related_food_product_name || "");
    setComponentFilterGroup("");
    setComponentFilterSubgroup("");
    setComponentSearch("");
    setAdditiveFilterGroup("");
    setAdditiveSearch("");
  }, [initialProduct, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([fetchFoodAdditiveGroups(), fetchFoodAdditives()])
      .then(([groupsData, additivesData]) => {
        if (cancelled) return;
        setAdditiveGroups(normalizeList(groupsData));
        setAllAdditives(normalizeList(additivesData));
      })
      .catch(() => {
        if (cancelled) return;
        setAdditiveGroups([]);
        setAllAdditives([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of catalogProducts || []) {
      if (!item?.typeId) continue;
      map.set(String(item.typeId), { id: item.typeId, name: item.typeName || `Группа #${item.typeId}` });
    }
    return Array.from(map.values()).sort((left, right) => String(left.name).localeCompare(String(right.name), "ru"));
  }, [catalogProducts]);

  const subgroups = useMemo(() => {
    const map = new Map();
    for (const item of catalogProducts || []) {
      if (!item?.subtypeId) continue;
      if (draft.related_food_group && String(item.typeId) !== String(draft.related_food_group)) continue;
      map.set(String(item.subtypeId), { id: item.subtypeId, name: item.subtypeName || `Подгруппа #${item.subtypeId}` });
    }
    return Array.from(map.values()).sort((left, right) => String(left.name).localeCompare(String(right.name), "ru"));
  }, [catalogProducts, draft.related_food_group]);

  const componentFilterSubgroups = useMemo(() => {
    const map = new Map();
    for (const item of catalogProducts || []) {
      if (!item?.subtypeId) continue;
      if (componentFilterGroup && String(item.typeId) !== String(componentFilterGroup)) continue;
      map.set(String(item.subtypeId), {
        id: item.subtypeId,
        name: item.subtypeName || `Подгруппа #${item.subtypeId}`,
      });
    }
    return Array.from(map.values()).sort((left, right) => String(left.name).localeCompare(String(right.name), "ru"));
  }, [catalogProducts, componentFilterGroup]);

  const referenceOptions = useMemo(() => {
    const search = String(referenceSearch || "").trim().toLowerCase();
    return (catalogProducts || [])
      .filter((item) => {
        if (draft.related_food_group && String(item.typeId) !== String(draft.related_food_group)) return false;
        if (draft.related_food_subgroup && String(item.subtypeId) !== String(draft.related_food_subgroup)) return false;
        if (search && !String(item.name || "").toLowerCase().includes(search)) return false;
        return true;
      })
      .slice(0, 60);
  }, [catalogProducts, draft.related_food_group, draft.related_food_subgroup, referenceSearch]);

  const selectedReferenceProduct = useMemo(() => (
    (catalogProducts || []).find((item) => String(item.id) === String(draft.related_food_product)) || null
  ), [catalogProducts, draft.related_food_product]);

  const manualComponentOptions = useMemo(() => {
    const selectedIds = new Set((draft.components || []).map((item) => String(item.food_component_id)));
    const search = normalizeSearchText(componentSearch);
    return (catalogProducts || [])
      .filter((item) => {
        if (selectedIds.has(String(item.id))) return false;
        if (componentFilterGroup && String(item.typeId) !== String(componentFilterGroup)) return false;
        if (componentFilterSubgroup && String(item.subtypeId) !== String(componentFilterSubgroup)) return false;
        if (search && !normalizeSearchText(item.name).includes(search)) return false;
        return true;
      })
      .slice(0, 40);
  }, [catalogProducts, componentFilterGroup, componentFilterSubgroup, componentSearch, draft.components]);

  const additiveOptions = useMemo(() => {
    const selectedIds = new Set((draft.additives || []).map((item) => String(item.food_additive_id)));
    const search = normalizeSearchText(additiveSearch);
    const normalizedCodeSearch = search.replace(/\s+/g, "");
    return (allAdditives || [])
      .filter((item) => {
        if (selectedIds.has(String(item.id))) return false;
        if (additiveFilterGroup && String(item.group) !== String(additiveFilterGroup)) return false;
        if (!search) return true;
        const code = normalizeSearchText(item.code).replace(/\s+/g, "");
        const name = normalizeSearchText(item.name);
        return code.includes(normalizedCodeSearch) || name.includes(search);
      })
      .slice(0, 40);
  }, [additiveFilterGroup, additiveSearch, allAdditives, draft.additives]);

  const requiredReady = useMemo(() => {
    const hasName = Boolean(String(draft.name || "").trim());
    const hasCoreNutrients = ["energy_kcal", "protein_g", "fats_g", "carbs_g"].some(
      (fieldName) => normalizeNumber(draft[fieldName]) !== null
    );
    return { hasName, hasCoreNutrients, isReady: hasName && hasCoreNutrients };
  }, [draft]);

  if (!open) return null;

  const applyField = (fieldName, value) => {
    setDraft((current) => ({ ...current, [fieldName]: value }));
  };

  const applyReferenceProductSelection = (product, options = {}) => {
    if (!product) return;
    setDraft((current) => ({
      ...current,
      related_food_product: product.id,
      related_food_group: product.typeId || "",
      related_food_subgroup: product.subtypeId || "",
      group_match_confidence: options.keepConfidence ? current.group_match_confidence : null,
      subgroup_match_confidence: options.keepConfidence ? current.subgroup_match_confidence : null,
      product_match_confidence: options.keepConfidence ? current.product_match_confidence : null,
      match_method: options.matchMethod || "manual",
    }));
  };

  const handleMatchName = async () => {
    if (!String(draft.name || "").trim()) {
      setError("Сначала введи название продукта.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await matchRetailName(draft.name);
      setNameMatch(result);
      setReferenceMode(referenceModes.AUTO);
      setManualSelectionUnlocked(false);
      setReferenceSearch(result?.suggested_product?.name || "");
      if (result?.suggested_product?.id) {
        const matchedProduct = (catalogProducts || []).find((item) => String(item.id) === String(result.suggested_product.id));
        if (matchedProduct) {
          applyReferenceProductSelection(matchedProduct, { matchMethod: "auto_confirmed", keepConfidence: true });
        } else {
          setDraft((current) => ({
            ...current,
            related_food_product: result.suggested_product.id,
            group_match_confidence: result?.suggested_group?.confidence ?? current.group_match_confidence,
            subgroup_match_confidence: result?.suggested_subgroup?.confidence ?? current.subgroup_match_confidence,
            product_match_confidence: result?.suggested_product?.confidence ?? current.product_match_confidence,
            match_method: "auto_confirmed",
          }));
        }
      }
      setDraft((current) => ({
        ...current,
        group_match_confidence: result?.suggested_group?.confidence ?? current.group_match_confidence,
        subgroup_match_confidence: result?.suggested_subgroup?.confidence ?? current.subgroup_match_confidence,
        product_match_confidence: result?.suggested_product?.confidence ?? current.product_match_confidence,
      }));
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || requestError?.message || "Не удалось подобрать эталон.");
    } finally {
      setLoading(false);
    }
  };

  const handleMatchComposition = async () => {
    if (!String(draft.composition_text || "").trim()) {
      setError("Сначала введи состав продукта.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await matchRetailComposition(draft.composition_text);
      setCompositionMatch(result);
      setDraft((current) => ({
        ...current,
        composition_text: result?.normalized_composition_text || current.composition_text,
        components: result?.components || [],
        additives: result?.additives || [],
      }));
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || requestError?.message || "Не удалось разобрать состав.");
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewFill = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = {
        related_food_product_id: draft.related_food_product || null,
        nutrition_fill_mode: draft.nutrition_fill_mode,
      };
      nutrientSections.forEach((section) => {
        section.fields.forEach(([fieldName]) => {
          payload[fieldName] = normalizeNumber(draft[fieldName]);
        });
      });
      const result = await previewRetailNutritionFill(payload);
      setFillPreview(result);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || requestError?.message || "Не удалось подготовить предпросмотр заполнения.");
    } finally {
      setLoading(false);
    }
  };

  const applyPreviewValues = () => {
    if (!fillPreview?.merged_values) return;
    setDraft((current) => {
      const next = { ...current };
      Object.entries(fillPreview.merged_values).forEach(([fieldName, value]) => {
        next[fieldName] = value ?? "";
      });
      return next;
    });
  };

  const removeComponent = (foodComponentId) => {
    setDraft((current) => ({
      ...current,
      components: current.components.filter((item) => String(item.food_component_id) !== String(foodComponentId)),
    }));
  };

  const addManualComponent = (product) => {
    if (!product) return;
    setDraft((current) => ({
      ...current,
      components: [
        ...current.components,
        {
          food_component_id: product.id,
          food_component_name: product.name,
          component_text: product.name,
          position_index: null,
          match_confidence: null,
          matched_by: "manual",
        },
      ],
    }));
  };

  const removeAdditive = (foodAdditiveId) => {
    setDraft((current) => ({
      ...current,
      additives: current.additives.filter((item) => String(item.food_additive_id) !== String(foodAdditiveId)),
    }));
  };

  const addManualAdditive = (additive) => {
    if (!additive) return;
    setDraft((current) => ({
      ...current,
      additives: [
        ...current.additives,
        {
          food_additive_id: additive.id,
          food_additive_name: additive.name,
          food_additive_code: additive.code,
          additive_text: additive.code || additive.name,
          position_index: null,
          match_confidence: null,
          matched_by: "manual",
        },
      ],
    }));
  };

  const handleSave = async () => {
    if (!requiredReady.hasName) {
      setError("Название продукта обязательно.");
      setStep(0);
      return;
    }

    const payload = {
      id: draft.id,
      name: String(draft.name || "").trim(),
      composition_text: String(draft.composition_text || "").trim(),
      related_food_group: draft.related_food_group || null,
      related_food_subgroup: draft.related_food_subgroup || null,
      related_food_product: draft.related_food_product || null,
      visibility: draft.visibility || "private",
      nutrition_fill_mode: draft.nutrition_fill_mode || "label_only",
      match_method: draft.match_method || "manual",
      group_match_confidence: draft.group_match_confidence ?? null,
      subgroup_match_confidence: draft.subgroup_match_confidence ?? null,
      product_match_confidence: draft.product_match_confidence ?? null,
      name_ocr_raw: draft.name_ocr_raw || "",
      composition_ocr_raw: draft.composition_ocr_raw || "",
      nutrition_ocr_raw: draft.nutrition_ocr_raw || "",
      components: (draft.components || []).map((item) => ({
        food_component_id: item.food_component_id,
        component_text: item.component_text || "",
        position_index: item.position_index ?? null,
        match_confidence: item.match_confidence ?? null,
        matched_by: item.matched_by || "manual",
      })),
      additives: (draft.additives || []).map((item) => ({
        food_additive_id: item.food_additive_id,
        additive_text: item.additive_text || "",
        position_index: item.position_index ?? null,
        match_confidence: item.match_confidence ?? null,
        matched_by: item.matched_by || "manual",
      })),
    };

    nutrientSections.forEach((section) => {
      section.fields.forEach(([fieldName]) => {
        payload[fieldName] = normalizeNumber(draft[fieldName]);
      });
    });

    setLoading(true);
    setError("");
    try {
      await onSave(payload);
      onClose();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || requestError?.message || "Не удалось сохранить продукт.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {draft.id ? "Редактирование магазинного продукта" : "Добавление магазинного продукта"}
            </div>
            <div style={{ color: "#666", marginTop: 4 }}>
              Пока без камеры: все данные вводятся вручную, но название, состав и нутриенты можно частично подтянуть автоматически.
            </div>
          </div>
          <button type="button" style={btn} onClick={onClose}>Закрыть</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              style={{
                ...btn,
                borderColor: index === step ? "#2e7d32" : "#d5dbe3",
                background: index === step ? "rgba(46,125,50,0.08)" : "#fff",
                fontWeight: index === step ? 700 : 500,
              }}
              onClick={() => setStep(index)}
            >
              {index + 1}. {label}
            </button>
          ))}
        </div>

        {error && <div style={{ color: "crimson" }}>{error}</div>}

        {step === 0 && (
          <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 6 }}>
              <label>Название продукта</label>
              <input
                style={input}
                value={draft.name}
                onChange={(event) => applyField("name", event.target.value)}
                placeholder="Например: йогурт питьевой клубничный"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <button
                type="button"
                style={{
                  ...btn,
                  borderColor: referenceMode === referenceModes.AUTO ? "#2e7d32" : "#d5dbe3",
                  background: referenceMode === referenceModes.AUTO ? "rgba(46,125,50,0.08)" : "#fff",
                  color: "#1f5f26",
                  fontWeight: 700,
                }}
                onClick={handleMatchName}
                disabled={loading}
              >
                Подобрать эталон по названию
              </button>
              <button
                type="button"
                style={{
                  ...btn,
                  borderColor: referenceMode === referenceModes.MANUAL ? "#2e7d32" : "#d5dbe3",
                  background: referenceMode === referenceModes.MANUAL ? "rgba(46,125,50,0.08)" : "#fff",
                  color: "#1f5f26",
                  fontWeight: 700,
                }}
                onClick={() => {
                  setReferenceMode(referenceModes.MANUAL);
                  setManualSelectionUnlocked(true);
                  setNameMatch(null);
                }}
              >
                Подобрать эталонный продукт вручную
              </button>
            </div>

            {referenceMode === referenceModes.AUTO && (
              <div style={{ border: "1px solid #dfe9df", borderRadius: 14, padding: 16, background: "#f8fcf8", display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700 }}>Автоматически подобранный эталон</div>
                  <button
                    type="button"
                    style={btn}
                    onClick={() => {
                      setReferenceMode(referenceModes.MANUAL);
                      setManualSelectionUnlocked(true);
                    }}
                  >
                    Изменить подбор
                  </button>
                </div>
                {selectedReferenceProduct ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedReferenceProduct.name}</div>
                    <div style={{ color: "#555", fontSize: 14 }}>
                      Группа: <strong>{selectedReferenceProduct.typeName || "—"}</strong>
                    </div>
                    <div style={{ color: "#555", fontSize: 14 }}>
                      Подгруппа: <strong>{selectedReferenceProduct.subtypeName || "—"}</strong>
                    </div>
                    <div style={{ color: "#555", fontSize: 13 }}>
                      {nameMatch?.suggested_product?.confidence != null && (
                        <>Совпадение по продукту: <strong>{Math.round(nameMatch.suggested_product.confidence * 100)}%</strong></>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
                    {nameMatch?.suggested_product
                      ? `Автоподбор нашел эталон «${nameMatch.suggested_product.name}», но он не был найден в локальном каталоге.`
                      : "Автоподбор пока не выбрал эталонный продукт."}
                  </div>
                )}
                {nameMatch && (
                  <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
                    {nameMatch.suggested_group && <>Группа-кандидат: {nameMatch.suggested_group.name}.</>}
                    {nameMatch.suggested_subgroup && <> Подгруппа-кандидат: {nameMatch.suggested_subgroup.name}.</>}
                  </div>
                )}
              </div>
            )}

            {referenceMode === referenceModes.MANUAL && (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ color: "#555", fontSize: 13, lineHeight: 1.5 }}>
                  В ручном режиме выбирается только эталонный продукт. Группа и подгруппа используются только как фильтры для удобного поиска.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label>Фильтр по группе</label>
                    <select
                      style={input}
                      value={draft.related_food_group}
                      disabled={!manualSelectionUnlocked}
                      onChange={(event) => {
                        applyField("related_food_group", event.target.value);
                        applyField("related_food_subgroup", "");
                      }}
                    >
                      <option value="">Все группы</option>
                      {groups.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label>Фильтр по подгруппе</label>
                    <select
                      style={input}
                      value={draft.related_food_subgroup}
                      disabled={!manualSelectionUnlocked}
                      onChange={(event) => {
                        applyField("related_food_subgroup", event.target.value);
                      }}
                    >
                      <option value="">Все подгруппы</option>
                      {subgroups.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label>Поиск эталонного продукта</label>
                  <input
                    style={input}
                    value={referenceSearch}
                    disabled={!manualSelectionUnlocked}
                    onChange={(event) => setReferenceSearch(event.target.value)}
                    placeholder="Начни вводить название"
                  />
                  <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid #edf0f2", borderRadius: 12, padding: 8, display: "grid", gap: 6 }}>
                    {referenceOptions.length === 0 ? (
                      <div style={{ color: "#666", fontSize: 13 }}>Ничего не найдено.</div>
                    ) : (
                      referenceOptions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={!manualSelectionUnlocked}
                          style={{
                            ...btn,
                            textAlign: "left",
                            borderColor: String(draft.related_food_product) === String(item.id) ? "#2e7d32" : "#e3e7ec",
                            background: String(draft.related_food_product) === String(item.id) ? "rgba(46,125,50,0.07)" : "#fff",
                          }}
                          onClick={() => {
                            applyReferenceProductSelection(item, { matchMethod: "manual" });
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div style={{ color: "#666", fontSize: 12 }}>{item.subtypeName || item.typeName || "Без подгруппы"}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12, background: "#fafcfd", display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 700 }}>Выбранный эталонный продукт</div>
                  {selectedReferenceProduct ? (
                    <>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedReferenceProduct.name}</div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        {selectedReferenceProduct.typeName || "Без группы"} · {selectedReferenceProduct.subtypeName || "Без подгруппы"}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: "#666" }}>Эталонный продукт пока не выбран.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label>Состав продукта</label>
              <textarea
                style={{ ...input, minHeight: 120, resize: "vertical" }}
                value={draft.composition_text}
                onChange={(event) => applyField("composition_text", event.target.value)}
                placeholder="Перенеси состав с упаковки как есть"
              />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={{ ...btn, borderColor: "#2e7d32", color: "#1f5f26" }} onClick={handleMatchComposition} disabled={loading}>
                Разобрать состав автоматически
              </button>
            </div>

            {compositionMatch && (
              <div style={{ color: "#555", fontSize: 13 }}>
                Автоматически выделены компоненты и пищевые добавки. Ниже можно убрать лишние совпадения или добавить недостающие элементы вручную.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Найденные базовые продукты</div>
                {draft.components.length === 0 ? (
                  <div style={{ color: "#666", fontSize: 13 }}>Пока ничего не найдено.</div>
                ) : draft.components.map((item) => (
                  <div key={`${item.food_component_id}-${item.position_index || 0}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", border: "1px solid #f0f2f5", borderRadius: 10, padding: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.food_component_name || `ID ${item.food_component_id}`}</div>
                      <div style={{ color: "#666", fontSize: 12 }}>{item.component_text || "Фрагмент состава не сохранен"}</div>
                    </div>
                    <button type="button" style={btn} onClick={() => removeComponent(item.food_component_id)}>Убрать</button>
                  </div>
                ))}
              </div>

              <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Добавить базовый продукт вручную</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                  <select
                    style={input}
                    value={componentFilterGroup}
                    onChange={(event) => {
                      setComponentFilterGroup(event.target.value);
                      setComponentFilterSubgroup("");
                    }}
                  >
                    <option value="">Все группы</option>
                    {groups.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <select
                    style={input}
                    value={componentFilterSubgroup}
                    onChange={(event) => setComponentFilterSubgroup(event.target.value)}
                  >
                    <option value="">Все подгруппы</option>
                    {componentFilterSubgroups.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <input
                  style={input}
                  value={componentSearch}
                  onChange={(event) => setComponentSearch(event.target.value)}
                  placeholder="Поиск по названию базового продукта"
                />
                <div style={{ maxHeight: 220, overflow: "auto", display: "grid", gap: 6 }}>
                  {manualComponentOptions.length === 0 ? (
                    <div style={{ color: "#666", fontSize: 13 }}>Подходящие базовые продукты не найдены.</div>
                  ) : (
                    manualComponentOptions.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 8,
                          alignItems: "center",
                          border: "1px solid #f0f2f5",
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div style={{ color: "#666", fontSize: 12 }}>{item.subtypeName || item.typeName || "Без подгруппы"}</div>
                        </div>
                        <button type="button" style={btn} onClick={() => addManualComponent(item)}>
                          Добавить
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Найденные пищевые добавки</div>
                {draft.additives.length === 0 ? (
                  <div style={{ color: "#666", fontSize: 13 }}>Пока ничего не найдено.</div>
                ) : draft.additives.map((item) => (
                  <div key={`${item.food_additive_id}-${item.position_index || 0}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", border: "1px solid #f0f2f5", borderRadius: 10, padding: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {item.food_additive_code ? `${item.food_additive_code} · ` : ""}{item.food_additive_name || `ID ${item.food_additive_id}`}
                      </div>
                      <div style={{ color: "#666", fontSize: 12 }}>{item.additive_text || "Фрагмент состава не сохранен"}</div>
                    </div>
                    <button type="button" style={btn} onClick={() => removeAdditive(item.food_additive_id)}>Убрать</button>
                  </div>
                ))}
              </div>

              <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Добавить пищевую добавку вручную</div>
                <select
                  style={input}
                  value={additiveFilterGroup}
                  onChange={(event) => setAdditiveFilterGroup(event.target.value)}
                >
                  <option value="">Все группы добавок</option>
                  {additiveGroups.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <input
                  style={input}
                  value={additiveSearch}
                  onChange={(event) => setAdditiveSearch(event.target.value)}
                  placeholder="Поиск по E-коду или названию добавки"
                />
                <div style={{ maxHeight: 220, overflow: "auto", display: "grid", gap: 6 }}>
                  {additiveOptions.length === 0 ? (
                    <div style={{ color: "#666", fontSize: 13 }}>Подходящие пищевые добавки не найдены.</div>
                  ) : (
                    additiveOptions.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 8,
                          alignItems: "center",
                          border: "1px solid #f0f2f5",
                          borderRadius: 10,
                          padding: 10,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {item.code ? `${item.code} · ` : ""}{item.name}
                          </div>
                          <div style={{ color: "#666", fontSize: 12 }}>
                            {additiveGroups.find((group) => String(group.id) === String(item.group))?.name || "Без группы"}
                          </div>
                        </div>
                        <button type="button" style={btn} onClick={() => addManualAdditive(item)}>
                          Добавить
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label>Как заполнять пустые поля</label>
                <select
                  style={input}
                  value={draft.nutrition_fill_mode}
                  onChange={(event) => applyField("nutrition_fill_mode", event.target.value)}
                >
                  <option value="label_only">Только данные с маркировки</option>
                  <option value="label_plus_reference">Дополнить пустые поля из эталона</option>
                  <option value="reference_only">Взять значения только из эталона</option>
                  <option value="manual">Полностью вручную</option>
                </select>
              </div>

              <div style={{ display: "grid", alignItems: "end" }}>
                <button type="button" style={{ ...btn, borderColor: "#2e7d32", color: "#1f5f26" }} onClick={handlePreviewFill} disabled={loading}>
                  Показать, как заполнятся пустые поля
                </button>
              </div>
            </div>

            {fillPreview && (
              <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12, background: "#fafcfd", display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Предпросмотр заполнения</div>
                <div style={{ fontSize: 13, color: "#555" }}>
                  Если подтвердить, в форму будут подставлены значения из блока <code>merged_values</code>.
                </div>
                <button type="button" style={{ ...btn, width: "fit-content" }} onClick={applyPreviewValues}>
                  Применить значения
                </button>
              </div>
            )}

            {nutrientSections.map((section) => (
              <div key={section.title} style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>{section.title}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  {section.fields.map(([fieldName, label, unit]) => (
                    <label key={fieldName} style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontSize: 13 }}>{label}</span>
                      <input
                        style={input}
                        inputMode="decimal"
                        value={draft[fieldName]}
                        onChange={(event) => applyField(fieldName, event.target.value)}
                        placeholder={unit}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Проверка готовности</div>
              <div style={{ color: requiredReady.hasName ? "#1f5f26" : "#a23442" }}>
                {requiredReady.hasName ? "Название заполнено" : "Название пока не заполнено"}
              </div>
              <div style={{ color: requiredReady.hasCoreNutrients ? "#1f5f26" : "#a23442" }}>
                {requiredReady.hasCoreNutrients
                  ? "Есть базовые нутриенты для расчета"
                  : "Нужен хотя бы один показатель из базовой пищевой ценности"}
              </div>
              <div style={{ color: requiredReady.isReady ? "#1f5f26" : "#8a6d1d" }}>
                {requiredReady.isReady
                  ? "После сохранения продукт сможет стать готовым к рекомендациям."
                  : "После сохранения продукт останется черновиком или статусом требует уточнения."}
              </div>
            </div>

            <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Краткое резюме</div>
              <div>Название: <strong>{draft.name || "—"}</strong></div>
              <div>Эталонный продукт: <strong>{draft.related_food_product || "не выбран"}</strong></div>
              <div>Компонентов найдено: <strong>{draft.components.length}</strong></div>
              <div>Добавок найдено: <strong>{draft.additives.length}</strong></div>
              <div>Режим заполнения нутриентов: <strong>{draft.nutrition_fill_mode}</strong></div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn} onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
              Назад
            </button>
            <button type="button" style={btn} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))} disabled={step === steps.length - 1}>
              Далее
            </button>
          </div>

          <button
            type="button"
            style={{ ...btn, borderColor: "#2e7d32", color: "#1f5f26", fontWeight: 700 }}
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? "Сохранение..." : "Сохранить продукт"}
          </button>
        </div>
      </div>
    </div>
  );
}
