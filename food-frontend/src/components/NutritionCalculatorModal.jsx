import React, { useEffect, useMemo, useState } from "react";
import { fmt } from "../utils/number";
import { ALL_COLUMNS, COLUMN_GROUPS } from "../config/column";
import { exportJsonToExcel } from "../utils/exportExcel";
import { fetchProcessingOptions, fetchProcessedProduct } from "../api/products.js";

const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modal = { background: "#fff", borderRadius: 12, overflow: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.18)" };
const row = { display: "grid", gap: 12, alignItems: "center", marginBottom: 10 };
const input = { padding: 8, border: "1px solid #ddd", borderRadius: 6, width: "100%" };
const btn = { padding: "8px 12px", border: "1px solid #ddd", background: "#fff", borderRadius: 6, cursor: "pointer" };
const subtitle = { margin: "12px 0 6px", fontWeight: 600 };

export default function NutritionCalculatorModal({
  open,
  onClose,
  allProducts,          // массив ВСЕХ продуктов (не отфильтрованных)
  defaultGrams = 100,
}) {
  const [typeId, setTypeId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");
  const [productId, setProductId] = useState("");

  const [processingId, setProcessingId] = useState("none");
  const [processingOptions, setProcessingOptions] = useState([]);
  const [processed, setProcessed] = useState(null);
  const [processingLoading, setProcessingLoading] = useState(false);
  const [processingError, setProcessingError] = useState("");

  const [grams, setGrams] = useState(String(defaultGrams));


  const product = useMemo(() => {
    if (!productId) return null;
    return allProducts.find(p => String(p.id) === String(productId)) || null;
  }, [productId, allProducts]);

  const types = useMemo(() => {
    const m = new Map();
    for (const p of allProducts) {
      if (p.typeId) m.set(String(p.typeId), p.typeName || `Группа #${p.typeId}`);
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }))
      .sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  }, [allProducts]);

  const subtypes = useMemo(() => {
    if (!typeId) return [];
    const m = new Map();
    for (const p of allProducts) {
      if (String(p.typeId) !== String(typeId)) continue;
      if (p.subtypeId) m.set(String(p.subtypeId), p.subtypeName || `Подгруппа #${p.subtypeId}`);
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }))
      .sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  }, [allProducts, typeId]);

  const filteredProducts = useMemo(() => {
    if (!typeId || !subtypeId) return [];
    return allProducts
      .filter(p =>
        String(p.typeId) === String(typeId) &&
        String(p.subtypeId) === String(subtypeId)
      )
      .slice()
      .sort((a,b)=>String(a.name).localeCompare(String(b.name),"ru"));
  }, [allProducts, typeId, subtypeId]);

  // какие столбцы отображать в превью: берём группами, кроме name
  const previewGroups = useMemo(() => {
    const visibleKeys = new Set(ALL_COLUMNS.map(c => c.key)); // можно сузить если хочешь
    return COLUMN_GROUPS.map(g => ({
      ...g,
      keys: g.keys.filter(k => visibleKeys.has(k))
    })).filter(g => g.keys.length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProcessingOptions([]);
      setProcessingId("none");
      setProcessed(null);
      setProcessingLoading(false);
      setProcessingError("");

      if (!productId) return;

      try {
        const data = await fetchProcessingOptions(productId);
        if (!cancelled) setProcessingOptions(data.options || []);
      } catch {
        if (!cancelled) {
          setProcessingOptions([]);
          setProcessingError("Не удалось загрузить варианты кулинарной обработки.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProcessed(null);
      setProcessingError("");
      setProcessingLoading(false);
      if (!productId) return;
      if (processingId === "none") return;

      const gramsNum = Number(grams);
      if (!gramsNum || gramsNum <= 0) return;

      setProcessingLoading(true);
      try {
        const data = await fetchProcessedProduct(productId, Number(processingId), gramsNum);
        if (!cancelled) setProcessed(data);
      } catch {
        if (!cancelled) setProcessingError("Не удалось пересчитать продукт с учётом обработки.");
      } finally {
        if (!cancelled) setProcessingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId, processingId, grams]);

  const gramsNum = grams ? Number(grams) : 0;
  const effectiveWeight = gramsNum;
  const outputWeight = (processingId !== "none" && processed?.output_weight_g != null)
    ? Number(processed.output_weight_g)
    : null;
  const multiplier = effectiveWeight > 0 ? effectiveWeight / 100 : 0;

  if (!open) return null;

  // только цифры для граммовки
  const handleGramsChange = (e) => {
    const raw = e.target.value.replace(",", ".").replace(/[^0-9.]/g, "");
    const parts = raw.split(".");
    const clean = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : raw;
    setGrams(clean);
  };

  const getShownAndPct = (key) => {
    if (!product || multiplier <= 0) {
      return { base100: null, baseAmount: null, shown: null, pct: null, new100: null, lossPct: null };
    }

    const base100 = product[key];
    const baseAmount = base100 == null ? null : Number(base100) * multiplier;
    let shown = baseAmount;
    let new100 = null;
    let pct = null;
    let lossPct = null;

    // обработка включена и данные пришли
    if (processingId !== "none" && processed) {
      new100 = processed.per_100g_flat?.[key];
      const newShown = processed.per_weight_flat?.[key];
      lossPct = processed.loss_pct_flat?.[key] ?? null;

      if (newShown != null) shown = newShown;

      if (baseAmount != null && shown != null && Number(baseAmount) !== 0) {
        pct = ((Number(shown) - Number(baseAmount)) / Number(baseAmount)) * 100;
      }
    }

    return { base100, baseAmount, shown, pct, new100, lossPct };
  };


  const renderPreview = () => {
    if (!product || multiplier <= 0) return null;
    return (
      <div>
        <div style={subtitle}>
          Результат для {fmt(effectiveWeight)} г исходного продукта:
        </div>
        {processingLoading && (
          <div style={{ color: "#666", fontSize: 13, margin: "6px 0 10px" }}>
            Пересчёт с учётом обработки…
          </div>
        )}
        {processingError && (
          <div style={{ color: "#b42318", fontSize: 13, margin: "6px 0 10px" }}>
            {processingError}
          </div>
        )}
        {previewGroups.map(g => (
          <div key={g.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>{g.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>Показатель</div>
              <div style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>Исходное содержание без обработки</div>
              <div style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>Итого после обработки</div>
              <div style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>К исходной порции</div>
              {g.keys.map(key => {
                const meta = ALL_COLUMNS.find(c => c.key === key);
                const { baseAmount, shown, pct, lossPct } = getShownAndPct(key);

                const bg =
                  pct == null ? "transparent"
                  : pct < 0 ? "rgba(220,38,38,0.12)"
                  : "rgba(34,197,94,0.15)";
                const cell = { background: bg, padding: "2px 4px", borderRadius: 4 };

                return (
                  <div key={key} style={{ display: "contents" }}>
                    <div style={{ ...cell, color: "#333" }}>{meta?.label ?? key}</div>
                    <div style={cell}>{fmt(baseAmount)}</div>
                    <div style={cell}>{fmt(shown)}</div>
                    <div style={cell}>
                      {pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
                      {lossPct != null && (
                        <span style={{ marginLeft: 6, fontSize: 12, color: "#555" }}>
                          потери {fmt(lossPct)}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const handleExportCalc = () => {
    if (!product || multiplier <= 0) {
      alert("Сначала выберите продукт и укажите граммовку больше 0");
      return;
    }

    const rows = [];

    rows.push({
      "Продукт": product.name,
      "Граммовка исходного продукта (г)": effectiveWeight,
      "Масса готового продукта (г)": outputWeight ?? "",
      "Обработка": processingId === "none"
        ? "Без обработки"
        : (processingOptions.find(o => String(o.processing_id) === String(processingId))?.name || `ID=${processingId}`),
      "Примечание": "Сначала применены потери нутриентов к исходной порции, затем остаток пересчитан на 100 г готового продукта с учётом массы после обработки",
    });

    rows.push({}); // пустая строка

    // Далее — нутриенты по группам
    previewGroups.forEach(group => {
      rows.push({ "Группа": group.label }); // заголовок группы
      group.keys.forEach(key => {
        const { base100, baseAmount, shown, pct, lossPct } = getShownAndPct(key);
        const meta = ALL_COLUMNS.find(c => c.key === key);

        rows.push({
          "Группа": group.label,
          "Показатель": meta?.label ?? key,
          "Исходное значение на 100 г": base100 == null ? "" : Number(base100),
          "Исходное содержание без обработки": baseAmount == null ? "" : Number(baseAmount),
          "Итого после обработки": shown == null ? "" : Number(shown),
          "Потери по правилу, %": lossPct == null ? "" : Number(lossPct),
          "Изменение количества, %": pct == null ? "" : Number(pct.toFixed(2)),
        });
      });

      rows.push({}); // пустая строка между группами
    });

    exportJsonToExcel(rows, `calc_${product.id}_${String(effectiveWeight).replace(".", "_")}g.xlsx`);
  };


  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} className="app-form-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Калькулятор пищевой ценности</h2>

        <div style={row} className="app-form-row">
          <label>Тип продукта</label>
          <select style={input} value={typeId} onChange={e => {
            setTypeId(e.target.value);
            setSubtypeId("");
            setProductId("");
          }}>
            <option value="">— выбрать —</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div style={row} className="app-form-row">
          <label>Подтип</label>
          <select style={input} value={subtypeId} disabled={!typeId}
            onChange={e => {
              setSubtypeId(e.target.value);
              setProductId("");
            }}>
            <option value="">— выбрать —</option>
            {subtypes.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>
        
        <div style={row} className="app-form-row">
          <label>Продукт</label>
          <select style={input} value={productId} disabled={!subtypeId}
            onChange={e => setProductId(e.target.value)}>
            <option value="">— выбрать —</option>
            {filteredProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={row} className="app-form-row">
          <label>Кулинарная обработка</label>
          <select style={input} value={processingId} disabled={!productId}
            onChange={e => setProcessingId(e.target.value)}>
            <option value="none">Без обработки</option>
            {processingOptions.map(o => (
              <option key={o.processing_id} value={o.processing_id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <div style={row} className="app-form-row">
          <label>Граммовка (г)</label>
          <input
            style={input}
            inputMode="decimal"
            value={grams}
            onChange={handleGramsChange}
            placeholder="например: 150 или 12.5"
          />
        </div>

        {outputWeight != null && (
          <div style={{ fontSize: 13, color: "#666", margin: "4px 0 10px" }}>
            Расчёт выполнен для {effectiveWeight} г исходного продукта.
            Масса готового продукта: {fmt(outputWeight)} г.
            Сначала применены потери нутриентов, затем остаток пересчитан на массу готового продукта.
          </div>
        )}

        {renderPreview()}

        <button
          type="button"
          style={btn}
          onClick={handleExportCalc}
          disabled={!product || multiplier <= 0}
        >
          Экспорт в Excel
        </button>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" style={btn} onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
