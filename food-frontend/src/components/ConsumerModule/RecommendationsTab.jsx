import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchRecommendations,
  fetchFoodProductTypes,
  fetchFoodProductSubtypes,
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

const softCard = {
  border: "1px solid #e8e8e8",
  borderRadius: 12,
  background: "#fafafa",
  padding: 14,
};

const infoGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const chip = (border, bg, color = "#333") => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 999,
  border: `1px solid ${border}`,
  background: bg,
  color,
  fontSize: 12,
  fontWeight: 600,
});

const smallMuted = {
  fontSize: 12,
  color: "#666",
};

const sectionBtn = {
  padding: "6px 10px",
  border: "1px solid #ddd",
  background: "#fff",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
};

const explainStepCard = (border, bg) => ({
  border: `1px solid ${border}`,
  background: bg,
  borderRadius: 12,
  padding: 12,
});

const explainValue = {
  fontWeight: 600,
};

const formulaBox = {
  border: "1px dashed #cfcfcf",
  background: "#fff",
  borderRadius: 10,
  padding: 10,
  fontSize: 13,
  lineHeight: 1.45,
};

function fmtNum(value, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function ExpandSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div style={{ borderTop: "1px solid #ececec", paddingTop: 10, marginTop: 4 }}>
      <button
        type="button"
        style={sectionBtn}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Скрыть" : "Показать"}: {title}
      </button>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

const input = {
  padding: 8,
  border: "1px solid #ddd",
  borderRadius: 8,
};

const linkBtn = {
  padding: "8px 12px",
  border: "1px solid #2e7d32",
  background: "rgba(46,125,50,0.08)",
  borderRadius: 8,
  cursor: "pointer",
  color: "#1b5e20",
  fontWeight: 600,
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
  width: "min(900px, 100%)",
  maxHeight: "85vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
  padding: 20,
  display: "grid",
  gap: 14,
};

const colorMeta = {
  green: { title: "Зелёные", border: "#2e7d32", bg: "rgba(46,125,50,0.08)" },
  yellow: { title: "Жёлтые", border: "#f9a825", bg: "rgba(249,168,37,0.10)" },
  red: { title: "Красные", border: "#e53935", bg: "rgba(229,57,53,0.10)" },
  blocked: { title: "Недопустимо", border: "#616161", bg: "rgba(97,97,97,0.10)" },
};

const NUTRIENT_LABELS = {
  energy_kcal: "Калорийность",
  protein_g: "Белок",
  fats_g: "Жиры",
  carbs_g: "Углеводы",
  na_mg: "Соль (натрий)",
  nlc_g: "НЖК",
};

const LEVEL_LABELS = {
  low: "низко",
  medium: "умеренно",
  high: "много",
};

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function normalizeItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function pickScore01(item) {
  if (typeof item?.explain?.score === "number") return item.explain.score;
  if (typeof item?.score_components?.final_score === "number") return item.score_components.final_score;
  if (typeof item?.preference_score === "number") return item.preference_score;
  if (typeof item?.preferencescore === "number") return item.preferencescore;
  return null;
}

function scoreTo100(score01) {
  if (typeof score01 !== "number" || !Number.isFinite(score01)) return null;
  const x = Math.round(score01 * 100);
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}

function getBaseSignals(item) {
  const arr = item?.explain?.base_signals;
  return Array.isArray(arr) ? arr : null;
}

function parseLegacyReasonLine(line) {
  if (typeof line !== "string") return null;
  const m = line.match(/^([a-z0-9_]+):\s*([a-z]+)\s*\(([-0-9.]+)%\/100g\)\s*$/i);
  if (!m) return null;
  const code = m[1];
  const level = m[2].toLowerCase();
  const sharePct = Number(m[3]);
  return { code, level, share_pct: Number.isFinite(sharePct) ? sharePct : null };
}

function pctText(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  return Math.round(x * 100);
}

function levelName(share) {
  if (typeof share !== "number" || !Number.isFinite(share)) return "неизвестно";
  if (share <= 0.10) return "мало";
  if (share <= 0.25) return "умеренно";
  return "много";
}

function renderHumanText(item) {
  const color = item?.color || item?.explain?.color || null;
  const signals = getBaseSignals(item) || [];
  const targets = item?.explain?.targets_day || {};
  const score01 = pickScore01(item);
  const score100 = scoreTo100(score01);

  const byCode = {};
  for (const s of signals) {
    if (s?.code) byCode[s.code] = s;
  }

  const kcalShare = byCode.energy_kcal?.share ?? null;
  const proteinShare = byCode.protein_g?.share ?? null;
  const fatsShare = byCode.fats_g?.share ?? null;
  const carbsShare = byCode.carbs_g?.share ?? null;
  const naShare = byCode.na_mg?.share ?? null;

  const kcalVal = byCode.energy_kcal?.value_100g ?? null;
  const kcalDay = targets.energy_kcal ?? null;

  const kcalPct = pctText(kcalShare);
  const proteinPct = pctText(proteinShare);

  const fatsLevel = levelName(fatsShare);
  const carbsLevel = levelName(carbsShare);
  const saltLevel = levelName(naShare);

  let warning = "";

  if (color === "red") {
    if (naShare != null && naShare > 0.25) {
      warning = `Главное ограничение: в 100 г продукта высокая солевая нагрузка по натрию — около ${Math.round(naShare * 100)}% от дневной нормы натрия.`;
    } else if (fatsShare != null && fatsShare > 0.25) {
      warning = `Главное ограничение: в 100 г продукта много жиров — около ${Math.round(fatsShare * 100)}% от дневной нормы.`;
    } else if (carbsShare != null && carbsShare > 0.25) {
      warning = `Главное ограничение: в 100 г продукта много углеводов — около ${Math.round(carbsShare * 100)}% от дневной нормы.`;
    } else if (kcalShare != null && kcalShare > 0.25) {
      warning = "Главное ограничение: продукт даёт слишком большую калорийную нагрузку на 100 г.";
    }
  }

  let title = "";
  let reason = "";
  let norms = "";
  let conclusion = "";

  if (color === "blocked") {
    title = "Этот продукт не рекомендуется для вашего профиля.";
    reason = "Он исключён из рекомендаций из-за ограничений профиля, например аллергенов или специальных правил.";
    norms = "";
    conclusion = "Лучше выбрать другой продукт.";
  } else if (color === "red") {
    title = `Этот продукт нежелателен для вашей цели — даже если общий балл составляет около ${score100 ?? "—"} из 100.`;
    reason = "У него есть как полезные свойства, так и выраженный неблагоприятный показатель, который делает продукт рискованным для частого употребления.";
    norms =
      kcalPct != null && proteinPct != null && kcalVal != null && kcalDay != null
        ? `100 г продукта дают около ${kcalPct}% от вашей дневной нормы калорий (${Math.round(kcalVal)} ккал из примерно ${Math.round(kcalDay)} ккал в день) и около ${proteinPct}% от дневной нормы белка.`
        : "Продукт даёт заметную нагрузку по одному или нескольким показателям.";
    conclusion = "Такой продукт лучше употреблять редко, небольшими порциями и с учётом остальных продуктов за день.";
  } else if (color === "yellow") {
    title = `Этот продукт умеренно подходит для вашей цели — примерно на ${score100 ?? "—"} из 100.`;
    reason = "У продукта есть полезные стороны, но по части состава нужна умеренность.";
    norms =
      kcalPct != null && proteinPct != null && kcalVal != null && kcalDay != null
        ? `100 г продукта дают около ${kcalPct}% от вашей дневной нормы калорий (${Math.round(kcalVal)} ккал из примерно ${Math.round(kcalDay)} ккал в день) и около ${proteinPct}% от дневной нормы белка.`
        : "Продукт даёт среднюю нагрузку на суточный рацион.";
    conclusion = "Его можно включать в рацион, но лучше следить за размером порции.";
  } else {
    title = `Этот продукт хорошо подходит для вашей цели — примерно на ${score100 ?? "—"} из 100.`;
    reason = "Он хорошо вписывается в ваши дневные нормы по ключевым показателям.";
    norms =
      kcalPct != null && proteinPct != null && kcalVal != null && kcalDay != null
        ? `100 г продукта дают около ${kcalPct}% от вашей дневной нормы калорий (${Math.round(kcalVal)} ккал из примерно ${Math.round(kcalDay)} ккал в день) и около ${proteinPct}% от дневной нормы белка.`
        : "Продукт хорошо вписывается в суточный рацион.";
    conclusion = "Такой продукт удобно использовать как более безопасный выбор для повседневного питания.";
  }

  const extra = `По жирам нагрузка ${fatsLevel}, по углеводам — ${carbsLevel}, по натрию/солевой нагрузке — ${saltLevel}.`;
  const lines = [title, reason, norms, warning, extra, conclusion].filter(Boolean);

  return (
    <div style={{ marginTop: 8, fontSize: 12, color: "#333", display: "grid", gap: 4 }}>
      {lines.map((text, idx) => (
        <div key={idx}>{text}</div>
      ))}
    </div>
  );
}

function renderLegacyReasonLine(line, idx) {
  const parsed = parseLegacyReasonLine(line);
  if (!parsed) return <div key={idx}>{line}</div>;

  const label = NUTRIENT_LABELS[parsed.code] || parsed.code;
  const level = LEVEL_LABELS[parsed.level] || parsed.level;
  const pct =
    typeof parsed.share_pct === "number" && Number.isFinite(parsed.share_pct)
      ? `${parsed.share_pct.toFixed(1)}%`
      : null;

  return (
    <div key={idx}>
      {label}: {level}
      {pct ? ` (${pct} от дневной нормы на 100 г)` : ""}
    </div>
  );
}

function signalChipMeta(level) {
  if (level === "high") {
    return {
      label: "много",
      style: chip("#e53935", "rgba(229,57,53,0.10)", "#b71c1c"),
    };
  }
  if (level === "medium") {
    return {
      label: "умеренно",
      style: chip("#f9a825", "rgba(249,168,37,0.12)", "#8a6d1d"),
    };
  }
  return {
    label: "низко",
    style: chip("#2e7d32", "rgba(46,125,50,0.10)", "#1b5e20"),
  };
}

function renderSignalChip(signal) {
  const code = signal?.code;
  const label = NUTRIENT_LABELS[code] || code || "—";
  const meta = signalChipMeta(signal?.level);
  const pct =
    typeof signal?.share_pct === "number" && Number.isFinite(signal.share_pct)
      ? `${signal.share_pct.toFixed(1)}%`
      : "—";

  return (
    <div
      key={code}
      style={{
        ...softCard,
        padding: 10,
        background: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <span style={meta.style}>{meta.label}</span>
      </div>
      <div style={{ ...smallMuted, marginTop: 6 }}>
        {pct} от дневной нормы на 100 г
      </div>
    </div>
  );
}

function colorRankForAlternatives(color) {
  if (color === "green") return 3;
  if (color === "yellow") return 2;
  if (color === "red") return 1;
  if (color === "blocked") return 0;
  return -1;
}

function getAllowedAlternativeColors(currentColor) {
  if (currentColor === "yellow") return ["green"];
  if (currentColor === "red") return ["green", "yellow"];
  if (currentColor === "blocked") return ["green", "yellow"];
  return [];
}

function pickAlternativesFromItems({
  currentItem,
  allItems,
  excludeIds = [],
  limit = 3,
}) {
  const currentProductId = currentItem?.product?.id;
  const currentSubtypeId =
    currentItem?.product?.subtype_id ??
    currentItem?.product?.subtype?.id ??
    null;

  const allowedColors = getAllowedAlternativeColors(currentItem?.color);

  if (!currentSubtypeId || allowedColors.length === 0) {
    return [];
  }

  const candidates = allItems.filter((it) => {
    const productId = it?.product?.id;
    const subtypeId =
      it?.product?.subtype_id ??
      it?.product?.subtype?.id ??
      null;

    if (!productId || productId === currentProductId) return false;
    if (excludeIds.includes(productId)) return false;
    if (subtypeId !== currentSubtypeId) return false;
    if (!allowedColors.includes(it?.color)) return false;

    return true;
  });

  candidates.sort((a, b) => {
    const colorDiff =
      colorRankForAlternatives(b?.color) - colorRankForAlternatives(a?.color);
    if (colorDiff !== 0) return colorDiff;

    const scoreA =
      typeof a?.score_components?.final_score === "number"
        ? a.score_components.final_score
        : typeof a?.explain?.score === "number"
          ? a.explain.score
          : 0;

    const scoreB =
      typeof b?.score_components?.final_score === "number"
        ? b.score_components.final_score
        : typeof b?.explain?.score === "number"
          ? b.explain.score
          : 0;

    if (scoreB !== scoreA) return scoreB - scoreA;

    return String(a?.product?.name || "").localeCompare(String(b?.product?.name || ""));
  });

  return candidates.slice(0, limit);
}

function getAlternativeReason(currentItem, altItem) {
  const currentSignals = Array.isArray(currentItem?.explain?.base_signals)
    ? currentItem.explain.base_signals
    : [];

  const altSignals = Array.isArray(altItem?.explain?.base_signals)
    ? altItem.explain.base_signals
    : [];

  const currentByCode = {};
  currentSignals.forEach((s) => {
    if (s?.code) currentByCode[s.code] = s;
  });

  const altByCode = {};
  altSignals.forEach((s) => {
    if (s?.code) altByCode[s.code] = s;
  });

  const currentEnergy = currentByCode.energy_kcal?.share_pct;
  const altEnergy = altByCode.energy_kcal?.share_pct;

  const currentFat = currentByCode.fats_g?.share_pct;
  const altFat = altByCode.fats_g?.share_pct;

  const currentNa = currentByCode.na_mg?.share_pct;
  const altNa = altByCode.na_mg?.share_pct;

  const currentProtein = currentByCode.protein_g?.share_pct;
  const altProtein = altByCode.protein_g?.share_pct;

  if (
    typeof currentFat === "number" &&
    typeof altFat === "number" &&
    altFat + 0.1 < currentFat
  ) {
    return "Меньше жиров";
  }

  if (
    typeof currentEnergy === "number" &&
    typeof altEnergy === "number" &&
    altEnergy + 0.1 < currentEnergy
  ) {
    return "Ниже калорийность";
  }

  if (
    typeof currentNa === "number" &&
    typeof altNa === "number" &&
    altNa + 0.1 < currentNa
  ) {
    return "Ниже натрий и солевая нагрузка";
  }

  if (
    typeof currentProtein === "number" &&
    typeof altProtein === "number" &&
    altProtein > currentProtein + 0.1
  ) {
    return "Больше белка";
  }

  return "Более подходящий вариант в этой подкатегории";
}

function AlternativeProductsBlock({ currentItem, allItems }) {
  const [page, setPage] = React.useState(0);

  const currentColor = currentItem?.color;
  const allowedColors = getAllowedAlternativeColors(currentColor);

  const alternativesPool = React.useMemo(() => {
    return pickAlternativesFromItems({
      currentItem,
      allItems,
      excludeIds: [],
      limit: 1000,
    });
  }, [currentItem, allItems]);

  const visibleAlternatives = React.useMemo(() => {
    if (!alternativesPool.length) return [];

    const start = (page * 3) % alternativesPool.length;
    const result = [];

    for (let i = 0; i < Math.min(3, alternativesPool.length); i += 1) {
      result.push(alternativesPool[(start + i) % alternativesPool.length]);
    }

    return result;
  }, [alternativesPool, page]);

  if (!allowedColors.length || !alternativesPool.length) {
    return null;
  }

  const title =
    currentColor === "yellow"
      ? "Более подходящие альтернативы"
      : currentColor === "red"
        ? "Рекомендуемые замены"
        : "Безопасные альтернативы";

  return (
    <div
      style={{
        ...softCard,
        background: "#fffdf7",
        border: "1px solid #f1d7a1",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={smallMuted}>
          В этой же подкатегории
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {visibleAlternatives.map((alt) => {
          const score01 = pickScore01(alt);
          const score100 = scoreTo100(score01);
          const meta = colorMeta[alt?.color] || colorMeta.green;
          const reason = getAlternativeReason(currentItem, alt);

          return (
            <div
              key={alt?.product?.id}
              style={{
                border: "1px solid #eadfbf",
                borderRadius: 10,
                background: "#fff",
                padding: 10,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 600 }}>
                  {alt?.product?.name || "Без названия"}
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={chip(meta.border, meta.bg, "#333")}>
                    {meta.title.slice(0, -1)}
                  </span>
                  <span style={chip("#ddd", "#fff", "#333")}>
                    {score100 ?? "—"} / 100
                  </span>
                </div>
              </div>

              <div style={{ ...smallMuted, fontWeight: 600, color: "#555" }}>
                Почему лучше: {reason}
              </div>
            </div>
          );
        })}
      </div>

      {alternativesPool.length > 0 && (
        <div>
          <button
            type="button"
            style={{
              ...btn,
              borderColor: "#e0b45d",
              background: "rgba(255,193,7,0.08)",
            }}
            onClick={() => setPage((p) => p + 1)}
          >
            Изменить альтернативы
          </button>
        </div>
      )}
    </div>
  );
}

function RecommendationExplainBlock({ item }) {
  const [mode, setMode] = React.useState("brief"); // brief | detailed | formulas

  const signals = Array.isArray(item?.explain?.base_signals) ? item.explain.base_signals : [];
  const score = item?.score_components || item?.explain?.score_components || {};
  const method = item?.explain?.method || {};
  const color = item?.color || item?.explain?.color || "red";

  const byCode = {};
  for (const s of signals) {
    if (s?.code) byCode[s.code] = s;
  }

  const rows = [
    {
      code: "energy_kcal",
      label: "Калорийность",
      unit: "ккал",
      productValue: byCode.energy_kcal?.value_100g,
      targetValue: item?.explain?.targets_day?.energy_kcal,
      sharePct: byCode.energy_kcal?.share_pct,
      level: byCode.energy_kcal?.level,
    },
    {
      code: "protein_g",
      label: "Белок",
      unit: "г",
      productValue: byCode.protein_g?.value_100g,
      targetValue: item?.explain?.targets_day?.protein_g,
      sharePct: byCode.protein_g?.share_pct,
      level: byCode.protein_g?.level,
    },
    {
      code: "fats_g",
      label: "Жиры",
      unit: "г",
      productValue: byCode.fats_g?.value_100g,
      targetValue: item?.explain?.targets_day?.fats_g,
      sharePct: byCode.fats_g?.share_pct,
      level: byCode.fats_g?.level,
    },
    {
      code: "carbs_g",
      label: "Углеводы",
      unit: "г",
      productValue: byCode.carbs_g?.value_100g,
      targetValue: item?.explain?.targets_day?.carbs_g,
      sharePct: byCode.carbs_g?.share_pct,
      level: byCode.carbs_g?.level,
    },
    {
      code: "na_mg",
      label: "Соль (натрий)",
      unit: "мг",
      productValue: byCode.na_mg?.value_100g,
      targetValue: item?.explain?.targets_day?.na_mg,
      sharePct: byCode.na_mg?.share_pct,
      level: byCode.na_mg?.level,
    },
    {
      code: "nlc_g",
      label: "НЖК",
      unit: "г",
      productValue: byCode.nlc_g?.value_100g,
      targetValue: item?.explain?.targets_day?.nlc_g,
      sharePct: byCode.nlc_g?.share_pct,
      level: byCode.nlc_g?.level,
    },
  ].filter((r) => r.productValue != null || r.targetValue != null || r.sharePct != null);

  const colorLabel =
    color === "green"
      ? "зелёный"
      : color === "yellow"
        ? "жёлтый"
        : color === "blocked"
          ? "исключён"
          : "красный";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          style={{
            ...sectionBtn,
            borderColor: mode === "brief" ? "#2e7d32" : "#ddd",
            background: mode === "brief" ? "rgba(46,125,50,0.08)" : "#fff",
          }}
          onClick={() => setMode("brief")}
        >
          Кратко
        </button>
        <button
          type="button"
          style={{
            ...sectionBtn,
            borderColor: mode === "detailed" ? "#2e7d32" : "#ddd",
            background: mode === "detailed" ? "rgba(46,125,50,0.08)" : "#fff",
          }}
          onClick={() => setMode("detailed")}
        >
          Подробно
        </button>
        <button
          type="button"
          style={{
            ...sectionBtn,
            borderColor: mode === "formulas" ? "#2e7d32" : "#ddd",
            background: mode === "formulas" ? "rgba(46,125,50,0.08)" : "#fff",
          }}
          onClick={() => setMode("formulas")}
        >
          Формулы
        </button>
      </div>

      {mode === "brief" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={explainStepCard("#90caf9", "rgba(33,150,243,0.06)")}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Шаг 1. Что система взяла из продукта</div>
            <div style={{ ...smallMuted, lineHeight: 1.5 }}>
              Для 100 г продукта система использует ключевые показатели: калорийность, белок, жиры,
              углеводы, натрий и при наличии насыщенные жирные кислоты.
            </div>
          </div>

          <div style={explainStepCard("#b39ddb", "rgba(103,58,183,0.06)")}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Шаг 2. С чем сравнили</div>
            <div style={{ ...smallMuted, lineHeight: 1.5 }}>
              Эти значения сравниваются с вашими персональными суточными ориентирами,
              рассчитанными для выбранного профиля и активной цели питания.
            </div>
          </div>

          <div style={explainStepCard("#ffcc80", "rgba(255,152,0,0.08)")}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Шаг 3. Как интерпретировали нагрузку</div>
            <div style={{ ...smallMuted, lineHeight: 1.5 }}>
              Для каждого показателя определяется доля от вашей дневной нормы.
              Затем она интерпретируется как низкая, умеренная или высокая нагрузка.
            </div>
          </div>

          <div style={explainStepCard("#a5d6a7", "rgba(76,175,80,0.08)")}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Шаг 4. Как получился итог</div>
            <div style={{ ...smallMuted, lineHeight: 1.5 }}>
              На основе этих сигналов формируется базовая оценка продукта. Если у вас заданы
              нутриентные предпочтения, они учитываются отдельно и объединяются с базовой оценкой.
              Итоговый цвет для этого продукта: <span style={{ fontWeight: 700 }}>{colorLabel}</span>.
            </div>
          </div>
        </div>
      )}

      {mode === "detailed" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={explainStepCard("#90caf9", "rgba(33,150,243,0.06)")}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Входные данные по продукту и вашим нормам</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "180px 120px 140px 1fr",
                gap: 8,
                alignItems: "start",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700 }}>Показатель</div>
              <div style={{ fontWeight: 700 }}>В 100 г</div>
              <div style={{ fontWeight: 700 }}>Ваша норма/сут</div>
              <div style={{ fontWeight: 700 }}>Интерпретация</div>

              {rows.map((r) => {
                const meta = signalChipMeta(r.level);
                return (
                  <React.Fragment key={r.code}>
                    <div>{r.label}</div>
                    <div style={explainValue}>
                      {fmtNum(r.productValue, r.unit === "мг" ? 0 : 1)} {r.unit}
                    </div>
                    <div>
                      {fmtNum(r.targetValue, r.unit === "мг" ? 0 : 1)} {r.unit}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={meta.style}>{meta.label}</span>
                      <span style={smallMuted}>
                        {fmtNum(r.sharePct, 1)}% от дневной нормы
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div style={explainStepCard("#ffcc80", "rgba(255,152,0,0.08)")}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Как это повлияло на оценку</div>
            <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
              <div>
                <span style={{ fontWeight: 600 }}>Базовая оценка:</span>{" "}
                {score?.base_score != null ? fmtNum(score.base_score, 3) : "—"}
              </div>
              <div>
                <span style={{ fontWeight: 600 }}>Оценка по предпочтениям:</span>{" "}
                {score?.preference_score != null ? fmtNum(score.preference_score, 3) : "—"}
              </div>
              <div>
                <span style={{ fontWeight: 600 }}>Итоговая оценка:</span>{" "}
                {score?.final_score != null ? fmtNum(score.final_score, 3) : "—"}
              </div>
              <div>
                <span style={{ fontWeight: 600 }}>Итоговый цвет:</span> {colorLabel}
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === "formulas" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={formulaBox}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>1. Доля от дневной нормы</div>
            <div>
              Доля = значение нутриента в 100 г продукта / суточная целевая норма
            </div>
          </div>

          <div style={formulaBox}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>2. Пороговые уровни</div>
            <div>Низкая нагрузка: до 10% дневной нормы на 100 г</div>
            <div>Умеренная нагрузка: 10–25%</div>
            <div>Высокая нагрузка: 25% и более</div>
          </div>

          <div style={formulaBox}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>3. Логика базовой оценки</div>
            <div style={{ lineHeight: 1.5 }}>
              Для показателей, которые желательно ограничивать, меньшая доля от нормы повышает оценку.
              Для показателей, которые желательно получать в большем количестве, более высокая доля
              от нормы повышает оценку.
            </div>
          </div>

          <div style={formulaBox}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>4. Итоговая оценка</div>
            <div style={{ lineHeight: 1.5 }}>
              Если у пользователя есть дополнительные предпочтения:
              <br />
              <strong>Итог = 0.6 × базовая оценка + 0.4 × оценка по предпочтениям</strong>
              <br />
              Если предпочтений нет:
              <br />
              <strong>Итог = базовая оценка</strong>
            </div>
          </div>

          {method?.share_formula && (
            <div style={formulaBox}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Техническая запись из системы</div>
              <div style={{ ...smallMuted, lineHeight: 1.5 }}>
                Основа: {method?.basis || "—"}
                <br />
                Формула доли: {method?.share_formula || "—"}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductDetailsBlock({
  item,
  baseSignals,
  shortReasons,
  renderPrefDetails,
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {baseSignals.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Ключевые сигналы</div>
          <div style={infoGrid}>
            {baseSignals.map(renderSignalChip)}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Почему система так оценила продукт</div>
        <div style={{ display: "grid", gap: 6 }}>
          {shortReasons.length > 0 ? (
            shortReasons.map((line, i) => (
              <div key={i} style={{ ...softCard, background: "#fff", padding: 10 }}>
                {renderLegacyReasonLine(line, i)}
              </div>
            ))
          ) : (
            <div style={smallMuted}>Подробные причины не указаны.</div>
          )}
        </div>
      </div>

      {Array.isArray(item?.matched_preferences) && item.matched_preferences.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Как учтены ваши предпочтения</div>
          <div style={{ display: "grid", gap: 8 }}>
            {item.matched_preferences.map(renderPrefDetails)}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Разобрать расчёт рекомендации</div>
        <RecommendationExplainBlock item={item} />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Технические подробности расчёта</div>
        <div style={{ ...softCard, background: "#fff" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Компоненты оценки</div>
          <div style={smallMuted}>
            Базовая оценка: {item?.score_components?.base_score ?? item?.explain?.score_components?.base_score ?? "—"}
          </div>
          <div style={smallMuted}>
            Оценка по предпочтениям: {item?.score_components?.preference_score ?? item?.explain?.score_components?.preference_score ?? "—"}
          </div>
          <div style={smallMuted}>
            Итоговая оценка: {item?.score_components?.final_score ?? item?.explain?.score_components?.final_score ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RecommendationsTab({ profileId }) {
  const [mode, setMode] = useState("catalog"); // catalog | cart
  const [cartId, setCartId] = useState("");
  const [limit, setLimit] = useState(50);

  const [searchText, setSearchText] = useState("");
  const [typeId, setTypeId] = useState("");
  const [subtypeId, setSubtypeId] = useState("");

  const [types, setTypes] = useState([]);
  const [subtypes, setSubtypes] = useState([]);

  const [loading, setLoading] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const items = useMemo(() => normalizeItems(payload?.items ?? payload), [payload]);

  const profileIdNum = useMemo(() => {
    const x = Number(profileId);
    return Number.isFinite(x) && x > 0 ? x : null;
  }, [profileId]);

  const filteredSubtypes = useMemo(() => {
    if (!typeId) return subtypes;
    return subtypes.filter((s) => Number(s.product_type) === Number(typeId));
  }, [subtypes, typeId]);

  const grouped = useMemo(() => {
    const g = { green: [], yellow: [], red: [], blocked: [] };
    for (const it of items) {
      const c = it?.color || "red";
      if (!g[c]) g[c] = [];
      g[c].push(it);
    }
    return g;
  }, [items]);

  const canSearchCatalog = useMemo(() => {
    if (!profileIdNum || mode !== "catalog") return false;
    return (
      searchText.trim().length > 0 ||
      String(typeId).trim().length > 0 ||
      String(subtypeId).trim().length > 0
    );
  }, [profileIdNum, mode, searchText, typeId, subtypeId]);

  const canLoadCart = useMemo(() => {
    return !!profileIdNum && mode === "cart" && String(cartId).trim().length > 0;
  }, [profileIdNum, mode, cartId]);

  const load = useCallback(async () => {
    if (!(canSearchCatalog || canLoadCart)) return;

    setLoading(true);
    setError("");

    try {
      const data = await fetchRecommendations({
        profileId: profileIdNum,
        mode,
        cartId: mode === "cart" ? Number(cartId) : null,
        limit: Number(limit) || 50,
        q: searchText.trim(),
        typeId: typeId || null,
        subtypeId: subtypeId || null,
      });

      setPayload(data);
      setHasSearched(true);
    } catch (e) {
      setPayload(null);
      setError(e?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [canSearchCatalog, canLoadCart, profileIdNum, mode, cartId, limit, searchText, typeId, subtypeId]);

  useEffect(() => {
    let cancelled = false;

    const loadFilters = async () => {
      setFiltersLoading(true);
      try {
        const [typesRaw, subtypesRaw] = await Promise.all([
          fetchFoodProductTypes(),
          fetchFoodProductSubtypes(),
        ]);

        if (!cancelled) {
          setTypes(normalizeList(typesRaw));
          setSubtypes(normalizeList(subtypesRaw));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Ошибка загрузки фильтров");
        }
      } finally {
        if (!cancelled) {
          setFiltersLoading(false);
        }
      }
    };

    loadFilters();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSubtypeId("");
  }, [typeId]);

  useEffect(() => {
    if (!canLoadCart) return;
    load();
  }, [canLoadCart, load]);

  const handleResetFilters = () => {
    setSearchText("");
    setTypeId("");
    setSubtypeId("");
    setPayload(null);
    setHasSearched(false);
    setError("");
  };

  const renderPrefDetails = (pref) => {
    const parts = [];
    if (pref?.runame) parts.push(pref.runame);
    if (pref?.code) parts.push(pref.code);
    const title = parts.join(" — ") || pref?.code || "Нутриент";

    const dir =
      pref?.direction === "more"
        ? "желательно больше"
        : pref?.direction === "less"
          ? "желательно меньше"
          : "—";

    return (
      <div
        key={pref?.code || title}
        style={{ ...softCard, background: "#fff", padding: 12 }}
      >
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ ...smallMuted, marginTop: 4 }}>
          Направление: {dir}
        </div>
        {typeof pref?.value === "number" && (
          <div style={{ ...smallMuted, marginTop: 2 }}>
            Значение в продукте: {pref.value}
          </div>
        )}
      </div>
    );
  };

  const renderItemCard = (item, idx) => {
    const meta = colorMeta[item?.color] || colorMeta.red;
    const score01 = pickScore01(item);
    const score100 = scoreTo100(score01);
    const baseSignals = getBaseSignals(item) || [];

    const shortReasons = Array.isArray(item?.reasons)
      ? item.reasons.filter((x) => typeof x === "string").slice(0, 4)
      : [];

    return (
      <div
        key={`${item?.product?.id ?? "x"}-${idx}`}
        style={{
          border: `1px solid ${meta.border}`,
          background: meta.bg,
          borderRadius: 14,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 24 }}>
              {item?.product?.name || "Без названия"}
            </div>
            <div style={{ ...smallMuted, marginTop: 2 }}>
              ID: {item?.product?.id ?? "—"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span
              style={chip(meta.border, "#fff", "#333")}
            >
              {meta.title.slice(0, -1)}
            </span>

            <span
              style={chip(meta.border, "#fff", "#333")}
            >
              {item?.color === "blocked" ? "Без оценки" : `${score100 ?? "—"} / 100`}
            </span>
          </div>
        </div>

        <div
          style={{
            ...softCard,
            background: "#fff",
            display: "grid",
            gap: 6,
          }}
        >
          <div style={{ fontWeight: 700 }}>Краткий вывод</div>
          {renderHumanText(item)}
        </div>

        <AlternativeProductsBlock currentItem={item} allItems={items} />

        <ExpandSection title="Подробности о продукте">
          <ProductDetailsBlock
            item={item}
            baseSignals={baseSignals}
            shortReasons={shortReasons}
            renderPrefDetails={renderPrefDetails}
          />
        </ExpandSection>
      </div>
    );
  };

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ ...box, padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>Рекомендации</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#555" }}>Режим:</span>
          <button
            type="button"
            style={{ ...btn, borderColor: mode === "catalog" ? "#2e7d32" : "#ddd" }}
            onClick={() => setMode("catalog")}
          >
            Каталог
          </button>
          <button
            type="button"
            style={{ ...btn, borderColor: mode === "cart" ? "#2e7d32" : "#ddd" }}
            onClick={() => setMode("cart")}
          >
            Корзина
          </button>
        </div>

        {mode === "catalog" && (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#555" }}>Поиск:</span>
              <input
                style={{ ...input, width: 220 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Введите название продукта"
              />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#555" }}>Категория:</span>
              <select
                style={{ ...input, width: 220 }}
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                disabled={filtersLoading}
              >
                <option value="">Все категории</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#555" }}>Подкатегория:</span>
              <select
                style={{ ...input, width: 240 }}
                value={subtypeId}
                onChange={(e) => setSubtypeId(e.target.value)}
                disabled={filtersLoading}
              >
                <option value="">Все подкатегории</option>
                {filteredSubtypes.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {mode === "cart" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#555" }}>Cart ID:</span>
            <input
              style={{ ...input, width: 120 }}
              value={cartId}
              onChange={(e) => setCartId(e.target.value)}
              placeholder="1"
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#555" }}>Лимит:</span>
          <input
            style={{ ...input, width: 90 }}
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min={1}
            max={500}
          />
        </div>

        {mode === "catalog" ? (
          <>
            <button
              type="button"
              style={{ ...btn, borderColor: "#2e7d32" }}
              onClick={load}
              disabled={loading || !canSearchCatalog}
            >
              {loading ? "Загрузка…" : "Подобрать"}
            </button>

            <button
              type="button"
              style={btn}
              onClick={handleResetFilters}
            >
              Сбросить
            </button>
          </>
        ) : (
          <button
            type="button"
            style={{ ...btn, borderColor: "#2e7d32" }}
            onClick={load}
            disabled={loading || !canLoadCart}
          >
            {loading ? "Загрузка…" : "Обновить"}
          </button>
        )}

        {!profileIdNum ? (
          <div style={{ fontSize: 12, color: "#666" }}>Выберите профиль</div>
        ) : (
          <div style={{ fontSize: 12, color: "#666" }}>
            profileId: {profileIdNum ?? "-"}, goalId: {payload?.goal_id ?? "—"}
          </div>
        )}

        <button
          type="button"
          style={linkBtn}
          onClick={() => setIsHelpOpen(true)}
        >
          Как рассчитываются результаты?
        </button>
      </div>

      {error && (
        <div style={{ ...box, padding: 14, color: "crimson" }}>
          {error}
        </div>
      )}

      {mode === "catalog" && !hasSearched && !loading && (
        <div style={{ ...box, padding: 16, color: "#666" }}>
          Выберите категорию, подкатегорию или введите название продукта, чтобы получить персональные рекомендации.
        </div>
      )}

      {loading && (
        <div style={{ ...box, padding: 16 }}>
          Загрузка рекомендаций…
        </div>
      )}

      {!loading && hasSearched && items.length === 0 && (
        <div style={{ ...box, padding: 16, color: "#666" }}>
          По заданным условиям продукты не найдены.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: "grid", gap: 14 }}>
          {["green", "yellow", "red", "blocked"].map((color) => {
            const groupItems = grouped[color] || [];
            if (!groupItems.length) return null;

            const meta = colorMeta[color];
            return (
              <div key={color} style={{ ...box, padding: 14 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${meta.border}`,
                    background: meta.bg,
                    marginBottom: 12,
                    fontWeight: 700,
                  }}
                >
                  {meta.title}: {groupItems.length}
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {groupItems.map(renderItemCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isHelpOpen && (
        <div style={modalOverlay} onClick={() => setIsHelpOpen(false)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Как рассчитываются результаты</div>
                <div style={{ ...smallMuted, marginTop: 4 }}>
                  Короткое объяснение логики рекомендаций простым языком.
                </div>
              </div>

              <button type="button" style={btn} onClick={() => setIsHelpOpen(false)}>
                Закрыть
              </button>
            </div>

            <div style={infoGrid}>
              <div style={softCard}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Что сравнивает система</div>
                <div style={{ fontSize: 14, color: "#333", lineHeight: 1.45 }}>
                  Система сопоставляет показатели продукта на 100 г с персональными суточными нормами пользователя:
                  калорийностью, белком, жирами, углеводами, натрием и некоторыми дополнительными нутриентами.
                </div>
              </div>

              <div style={softCard}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Что означают цвета</div>
                <div style={{ display: "grid", gap: 8 }}>
                  <span style={chip("#2e7d32", "rgba(46,125,50,0.10)", "#1b5e20")}>Зелёный — более предпочтительный</span>
                  <span style={chip("#f9a825", "rgba(249,168,37,0.12)", "#8a6d1d")}>Жёлтый — умеренно подходит</span>
                  <span style={chip("#e53935", "rgba(229,57,53,0.10)", "#b71c1c")}>Красный — нежелателен</span>
                  <span style={chip("#616161", "rgba(97,97,97,0.10)", "#424242")}>Серый — исключён ограничениями</span>
                </div>
              </div>

              <div style={softCard}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Как считается итог</div>
                <div style={{ fontSize: 14, color: "#333", lineHeight: 1.45 }}>
                  Сначала считается базовая пригодность продукта по ключевым нутриентам.
                  Если у пользователя есть дополнительные предпочтения, они учитываются отдельно
                  и объединяются с базовой частью в итоговую оценку.
                </div>
              </div>
            </div>

            <ExpandSection title="Показать технические детали">
              <div style={{ display: "grid", gap: 10 }}>
                <div style={softCard}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Основа расчёта</div>
                  <div style={{ fontSize: 14, lineHeight: 1.45 }}>
                    Сравнение 100 г продукта с персональными суточными нормами, рассчитанными для выбранного профиля.
                  </div>
                </div>

                <div style={softCard}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Формула доли</div>
                  <div style={{ fontSize: 14, lineHeight: 1.45 }}>
                    Доля от дневной нормы = значение нутриента в 100 г продукта / суточная целевая норма.
                  </div>
                </div>

                <div style={softCard}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Пороговые уровни</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <span style={chip("#2e7d32", "rgba(46,125,50,0.10)", "#1b5e20")}>Низкая нагрузка — до 10%</span>
                    <span style={chip("#f9a825", "rgba(249,168,37,0.12)", "#8a6d1d")}>Умеренная — 10–25%</span>
                    <span style={chip("#e53935", "rgba(229,57,53,0.10)", "#b71c1c")}>Высокая — 25% и более</span>
                  </div>
                </div>
              </div>
            </ExpandSection>
          </div>
        </div>
      )}
    </div>
  );
}
