import React, { useEffect, useMemo, useState } from "react";
import { fmt } from "../utils/number";
import { ALL_COLUMNS, COLUMN_GROUPS } from "../config/column";
import { exportJsonToExcel } from "../utils/exportExcel";
import { fetchProcessingOptions, fetchProcessedProduct } from "../api/products.js";

const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modal = { background: "#fff", borderRadius: 12, padding: 20, width: 760, maxHeight: "90vh", overflow: "auto", boxShadow: "0 10px 40px rgba(0,0,0,0.18)" };
const row = { display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, alignItems: "center", marginBottom: 10 };
const input = { padding: 8, border: "1px solid #ddd", borderRadius: 6, width: "100%" };
const btn = { padding: "8px 12px", border: "1px solid #ddd", background: "#fff", borderRadius: 6, cursor: "pointer" };
const subtitle = { margin: "12px 0 6px", fontWeight: 600 };

export default function NutritionCalculatorModal({
  open,
  onClose,
  allProducts,          // массив ВСЕХ продуктов (не отфильтрованных)
  defaultGrams = 100,
  onApplyToAll,         // (multiplier:number)=>void
}) {
  const [typeId, setTypeId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");
  const [productId, setProductId] = useState("");

  const [processingId, setProcessingId] = useState("none");
  const [processingOptions, setProcessingOptions] = useState([]);
  const [processed, setProcessed] = useState(null);

  const [grams, setGrams] = useState(String(defaultGrams));


  const product = useMemo(() => {
    if (!productId) return null;
    return allProducts.find(p => String(p.id) === String(productId)) || null;
  }, [productId, allProducts]);

  const types = useMemo(() => {
    const m = new Map();
    for (const p of allProducts) {
      if (p.typeId) m.set(String(p.typeId), p.typeName || `Тип #${p.typeId}`);
    }
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }))
      .sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  }, [allProducts]);

  const subtypes = useMemo(() => {
    if (!typeId) return [];
    const m = new Map();
    for (const p of allProducts) {
      if (String(p.typeId) !== String(typeId)) continue;
      if (p.subtypeId) m.set(String(p.subtypeId), p.subtypeName || `Подтип #${p.subtypeId}`);
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

      if (!productId) return;

      const data = await fetchProcessingOptions(productId);
      if (!cancelled) setProcessingOptions(data.options || []);
    })();
    return () => { cancelled = true; };
  }, [productId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProcessed(null);
      if (!productId) return;
      if (processingId === "none") return;

      const gramsNum = Number(grams);
      if (!gramsNum || gramsNum <= 0) return;

      const data = await fetchProcessedProduct(productId, Number(processingId), gramsNum);
      if (!cancelled) setProcessed(data);
      console.log("processed.weight_g", data?.weight_g, "gramsNum", gramsNum);
    })();
    return () => { cancelled = true; };
  }, [productId, processingId, grams]);

  const gramsNum = grams ? Number(grams) : 0;
  const effectiveWeight = (processingId !== "none" && processed?.weight_g != null)
  ? Number(processed.weight_g)
  : gramsNum;
  const multiplier = effectiveWeight > 0 ? effectiveWeight / 100 : 0;

  if (!open) return null;

  // только цифры для граммовки
  const handleGramsChange = (e) => {
    const clean = e.target.value.replace(/\D+/g, ""); // цифры
    setGrams(clean);
  };

  const getShownAndPct = (key) => {
    if (!product || multiplier <= 0) return { base100: null, shown: null, pct: null, new100: null };

    const base100 = product[key];
    let shown = base100 == null ? null : Number(base100) * multiplier;
    let new100 = null;
    let pct = null;

    // обработка включена и данные пришли
    if (processingId !== "none" && processed) {
      new100 = processed.per_100g_flat?.[key];
      const newShown = processed.per_weight_flat?.[key];

      if (newShown != null) shown = newShown;

      if (base100 != null && new100 != null && Number(base100) !== 0) {
        pct = ((Number(new100) - Number(base100)) / Number(base100)) * 100;
      }
    }

    return { base100, shown, pct, new100 };
  };


  const renderPreview = () => {
    if (!product || multiplier <= 0) return null;
    return (
      <div>
        <div style={subtitle}>
          Результат (на {Math.round(effectiveWeight)} г)
          {effectiveWeight !== gramsNum && gramsNum > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "#666", fontWeight: 400 }}>
              (введено: {gramsNum} г)
            </span>
          )}
          :
        </div>
        {processingId !== "none" && !processed && (
          <div style={{ color: "#666", fontSize: 13, margin: "6px 0 10px" }}>
            Пересчёт с учётом обработки…
          </div>
        )}
        {previewGroups.map(g => (
          <div key={g.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>{g.label}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 8 }}>
              {g.keys.map(key => {
                const meta = ALL_COLUMNS.find(c => c.key === key);
                const { shown, pct } = getShownAndPct(key);

                const bg =
                  pct == null ? "transparent"
                  : pct < 0 ? "rgba(220,38,38,0.12)"
                  : "rgba(34,197,94,0.15)";

                return (
                  <div key={key} style={{ display: "contents", background: bg }}>
                    <div style={{ color: "#333" }}>{meta?.label ?? key}</div>
                    <div>
                      {fmt(shown)}
                      {pct != null && (
                        <span style={{ marginLeft: 6, fontSize: 12, color: "#555" }}>
                          {pct > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
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

  const apply = () => {
    onClose();
  };

  const handleExportCalc = () => {
    if (!product || multiplier <= 0) {
      alert("Сначала выберите продукт и укажите граммовку больше 0");
      return;
    }

    const rows = [];

    // Первая строка — шапка с общей информацией
    rows.push({
      "Продукт": product.name,
      "Граммовка (г)": effectiveWeight,
      "Обработка": processingId === "none"
        ? "Без обработки"
        : (processingOptions.find(o => String(o.processing_id) === String(processingId))?.name || `ID=${processingId}`),
      "Примечание": "Пищевая ценность пересчитана на указанную граммовку; при наличии — учтены потери при обработке",
    });

    rows.push({}); // пустая строка

    // Далее — нутриенты по группам
    previewGroups.forEach(group => {
      rows.push({ "Группа": group.label }); // заголовок группы
      group.keys.forEach(key => {
        const { base100, shown, pct } = getShownAndPct(key);
        const meta = ALL_COLUMNS.find(c => c.key === key);

        rows.push({
          "Группа": group.label,
          "Показатель": meta?.label ?? key,
          "Значение на 100 г": base100 == null ? "" : Number(base100),
          [`Значение на ${effectiveWeight} г`]: shown == null ? "" : Number(shown),
          "Изменение, %": pct == null ? "" : Number(pct.toFixed(2)),
        });
      });

      rows.push({}); // пустая строка между группами
    });

    exportJsonToExcel(rows, `calc_${product.id}_${Math.round(effectiveWeight)}g.xlsx`);
  };


  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>Калькулятор пищевой ценности</h2>

        <div style={row}>
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

        <div style={row}>
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
        
        <div style={row}>
          <label>Продукт</label>
          <select style={input} value={productId} disabled={!subtypeId}
            onChange={e => setProductId(e.target.value)}>
            <option value="">— выбрать —</option>
            {filteredProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={row}>
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

        <div style={row}>
          <label>Граммовка (г)</label>
          <input
            style={input}
            inputMode="numeric"
            value={grams}
            onChange={handleGramsChange}
            placeholder="например: 150"
          />
        </div>

        {renderPreview()}

        <button
          type="button"
          style={btn}
          onClick={handleExportCalc}
          disabled={!product || multiplier <= 0}
        >
          📄 Экспорт в Excel
        </button>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" style={btn} onClick={onClose}>Закрыть</button>
          <button
            type="button"
            style={{ ...btn, borderColor: "#2e7d32" }}
            onClick={apply}
            disabled={!product || multiplier <= 0}
          >
            Показать
          </button>
        </div>
      </div>
    </div>
  );
}
