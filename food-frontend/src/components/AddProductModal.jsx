import React, { useMemo, useState } from "react";
import { parseRuNumber } from "../utils/number";

const overlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50
};
const modal = { background: "#fff", borderRadius: 12, padding: 20, width: 640, maxHeight: "90vh", overflow: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.18)" };
const row = { display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, alignItems: "center", marginBottom: 10 };
const input = { padding: 8, border: "1px solid #ddd", borderRadius: 6, width: "100%" };
const btn = { padding: "8px 12px", border: "1px solid #ddd", background: "#fff", borderRadius: 6, cursor: "pointer" };

// утилита-валидатор для onBeforeInput / onKeyDown
function allowDigitComma(e) {
  const k = e.key;
  const isControl =
    k === "Backspace" || k === "Delete" || k === "ArrowLeft" || k === "ArrowRight" ||
    k === "Tab" || e.ctrlKey || e.metaKey;
  if (isControl) return;

  // Разрешаем цифры и запятую
  if (!/[0-9,]/.test(k)) {
    e.preventDefault();
    return;
  }

  // не даём вторую запятую
  const target = e.target;
  const value = target.value;
  const selection = value.slice(0, target.selectionStart) + k + value.slice(target.selectionEnd);
  if ((k === "," && value.includes(",")) || (selection.match(/,/g)?.length > 1)) {
    e.preventDefault();
  }
}

// авто-замена точки на запятую во время ввода
function dotToComma(e, setValue) {
  const v = e.target.value.replace(/\./g, ",").replace(/[^0-9,]/g, "");
  // только одна запятая
  const parts = v.split(",");
  const norm = parts.length > 1 ? parts[0] + "," + parts.slice(1).join("").replace(/,/g, "") : v;
  setValue(norm);
}

export default function AddProductModal({ open, onClose, onSubmit, types }) {
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("");
  const [newType, setNewType] = useState("");
  const [form, setForm] = useState({
    protein_g: "",
    fats_g: "",
    carbs_g: "",
    energy_kcal: "",
    fiber_g: "",
    mds_g: "",
    starch_g: "",
    water_g: "",
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
    alcohol_pct: ""
  });

  const canSubmit = useMemo(() => {
    const hasType = (typeId && typeId !== "__new__") || (newType.trim().length > 0);
    return name.trim().length > 0 && hasType;
  }, [name, typeId, newType]);

  if (!open) return null;

  const submit = () => {
    // локальный уникальный id: отрицательный timestamp (чтобы не конфликтовал с серверными положительными id)
    const id = -Date.now();

    const finalTypeName = typeId === "__new__" ? newType.trim() : (types.find(t => String(t.id) === String(typeId))?.name || "");
    const finalTypeId   = typeId === "__new__" ? -Math.floor(Math.random() * 1e9) : (typeId ? Number(typeId) : null);

    const payload = {
      id,
      name: name.trim(),
      typeId: finalTypeId,
      typeName: finalTypeName || `Группа #${finalTypeId ?? "?"}`,
      protein_g:    parseRuNumber(form.protein_g),
      fats_g:       parseRuNumber(form.fats_g),
      carbs_g:      parseRuNumber(form.carbs_g),
      energy_kcal:  parseRuNumber(form.energy_kcal),
      fiber_g:      parseRuNumber(form.fiber_g),
      mds_g:        parseRuNumber(form.mds_g),
      starch_g:     parseRuNumber(form.starch_g),
      water_g:      parseRuNumber(form.water_g),
      na_mg:        parseRuNumber(form.na_mg),
      k_mg:         parseRuNumber(form.k_mg),
      ca_mg:        parseRuNumber(form.ca_mg),
      mg_mg:        parseRuNumber(form.mg_mg),
      p_mg:         parseRuNumber(form.p_mg),
      fe_mg:        parseRuNumber(form.fe_mg),
      ash_g:        parseRuNumber(form.ash_g),
      a_mg:         parseRuNumber(form.a_mg),
      beta_carotene_mg: parseRuNumber(form.beta_carotene_mg),
      b1_mg:        parseRuNumber(form.b1_mg),
      b2_mg:        parseRuNumber(form.b2_mg),
      pp_mg:        parseRuNumber(form.pp_mg),
      c_mg:         parseRuNumber(form.c_mg),
      retinol_index: parseRuNumber(form.retinol_index),
      tocopherol_index: parseRuNumber(form.tocopherol_index),
      niacin_index: parseRuNumber(form.niacin_index),
      nlc_g:        parseRuNumber(form.nlc_g),
      pufa_g:       parseRuNumber(form.pufa_g),
      cholesterol_g:parseRuNumber(form.cholesterol_g),
      organic_acids_g: parseRuNumber(form.organic_acids_g),
      alcohol_pct:  parseRuNumber(form.alcohol_pct)
    };

    onSubmit(payload);
    onClose();
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Добавить продукт локально</h2>
        <div style={{ marginBottom: 12, color: "#666", fontSize: 13 }}>
          Запись сохранится только в локальной базе браузера и не изменит общий серверный справочник.
        </div>

        <div style={row}>
          <label>Название</label>
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Творог 5%" />
        </div>

        <div style={row}>
          <label>Тип продукции</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              style={{ ...input, width: "60%" }}
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
            >
              <option value="">— выбрать —</option>
              {types.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              <option value="__new__">+ Новый тип…</option>
            </select>
            {typeId === "__new__" && (
              <input style={{ ...input, width: "40%" }} value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="Введите новый тип" />
            )}
          </div>
        </div>

        <hr style={{ margin: "12px 0", border: 0, borderTop: "1px solid #eee" }} />

        {/* Базовые нутриенты */}
        {[
          ["protein_g",   "Белки, г"],
          ["fats_g",      "Жиры, г"],
          ["carbs_g",     "Углеводы, г"],
          ["energy_kcal", "Энергия, ккал"],
          ["fiber_g",     "Пищ. волокна, г"],
          ["mds_g",       "МДС, г"],
          ["starch_g",    "Крахмал, г"],
          ["water_g",     "Вода, г"],
          ["na_mg",       "Содержание Na, мг"],
          ["k_mg",        "Содеражние K, мг"],
          ["ca_mg",       "Содержание Ca, мг"],
          ["mg_mg",       "Содержание Mg, мг"],
          ["p_mg",        "Содержание P, мг"],
          ["fe_mg",       "Содержание Fe, мг"],
          ["ash_g",       "Содержание золы, г"],
          ["a_mg",        "Витамин A, мг"],
          ["beta_carotene_mg", "Бета-каротин, мг"],
          ["b1_mg",       "Витамин B1, мг"],
          ["b2_mg",       "Витамин B2, мг"],
          ["pp_mg",       "Витамин PP, мг"],
          ["c_mg",        "Витамин C, мг"],
          ["retinol_index", "Ретиноловый эквив., мг"],
          ["tocopherol_index", "Токофероловый эквив., мг"],
          ["niacin_index", "Ниациновый эквив., мг"],
          ["nlc_g",       "Насыщенные жирные кислоты, г"],
          ["pufa_g",      "Полиненасыщенные жирные кислоты, г"],
          ["cholesterol_g", "Холестерин, мг"],
          ["organic_acids_g", "Органические кислоты, г"],
          ["alcohol_pct", "Алкоголь, %"],
        ].map(([key, label]) => (
          <div key={key} style={row}>
            <label>{label}</label>
            <input
              style={input}
              inputMode="decimal"
              value={form[key]}
              onChange={(e) => dotToComma(e, (val) => setForm({ ...form, [key]: val }))}
              onKeyDown={allowDigitComma}
              placeholder="например: 3,5"
            />
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" style={btn} onClick={onClose}>Отмена</button>
          <button
            type="button"
            style={{ ...btn, borderColor: "#2e7d32" }}
            onClick={submit}
            disabled={!canSubmit}
            title={!canSubmit ? "Заполните название и тип" : "Добавить"}
          >
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
