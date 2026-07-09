import React, { useEffect, useMemo, useState } from "react";
import {
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
  const [nameMatch, setNameMatch] = useState(null);
  const [compositionMatch, setCompositionMatch] = useState(null);
  const [fillPreview, setFillPreview] = useState(null);
  const [referenceSearch, setReferenceSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setDraft(hydrateDraft(initialProduct));
    setStep(0);
    setLoading(false);
    setError("");
    setNameMatch(null);
    setCompositionMatch(null);
    setFillPreview(null);
    setReferenceSearch("");
  }, [initialProduct, open]);

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
      setDraft((current) => ({
        ...current,
        related_food_group: result?.suggested_group?.id || current.related_food_group,
        related_food_subgroup: result?.suggested_subgroup?.id || current.related_food_subgroup,
        related_food_product: result?.suggested_product?.id || current.related_food_product,
        group_match_confidence: result?.suggested_group?.confidence ?? current.group_match_confidence,
        subgroup_match_confidence: result?.suggested_subgroup?.confidence ?? current.subgroup_match_confidence,
        product_match_confidence: result?.suggested_product?.confidence ?? current.product_match_confidence,
        match_method: "auto_confirmed",
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

  const removeAdditive = (foodAdditiveId) => {
    setDraft((current) => ({
      ...current,
      additives: current.additives.filter((item) => String(item.food_additive_id) !== String(foodAdditiveId)),
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

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={{ ...btn, borderColor: "#2e7d32", color: "#1f5f26" }} onClick={handleMatchName} disabled={loading}>
                Подобрать эталон по названию
              </button>
            </div>

            {nameMatch && (
              <div style={{ border: "1px solid #edf0f2", borderRadius: 12, padding: 12, background: "#fafcfd", display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Предполагаемые совпадения</div>
                <div style={{ fontSize: 13, color: "#555" }}>
                  {nameMatch.suggested_group && `Группа: ${nameMatch.suggested_group.name} (${Math.round(nameMatch.suggested_group.confidence * 100)}%)`}
                  {nameMatch.suggested_group && nameMatch.suggested_subgroup ? " · " : ""}
                  {nameMatch.suggested_subgroup && `Подгруппа: ${nameMatch.suggested_subgroup.name} (${Math.round(nameMatch.suggested_subgroup.confidence * 100)}%)`}
                  {nameMatch.suggested_product && ` · Эталон: ${nameMatch.suggested_product.name} (${Math.round(nameMatch.suggested_product.confidence * 100)}%)`}
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label>Группа</label>
                <select
                  style={input}
                  value={draft.related_food_group}
                  onChange={(event) => {
                    applyField("related_food_group", event.target.value);
                    applyField("related_food_subgroup", "");
                    applyField("related_food_product", "");
                  }}
                >
                  <option value="">Не выбрана</option>
                  {groups.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label>Подгруппа</label>
                <select
                  style={input}
                  value={draft.related_food_subgroup}
                  onChange={(event) => {
                    applyField("related_food_subgroup", event.target.value);
                    applyField("related_food_product", "");
                  }}
                >
                  <option value="">Не выбрана</option>
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
                      style={{
                        ...btn,
                        textAlign: "left",
                        borderColor: String(draft.related_food_product) === String(item.id) ? "#2e7d32" : "#e3e7ec",
                        background: String(draft.related_food_product) === String(item.id) ? "rgba(46,125,50,0.07)" : "#fff",
                      }}
                      onClick={() => {
                        applyField("related_food_product", item.id);
                        applyField("related_food_group", item.typeId || "");
                        applyField("related_food_subgroup", item.subtypeId || "");
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ color: "#666", fontSize: 12 }}>{item.subtypeName || item.typeName || "Без подгруппы"}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
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
                Автоматически выделены компоненты и пищевые добавки. Ниже можно убрать лишние совпадения перед сохранением.
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
