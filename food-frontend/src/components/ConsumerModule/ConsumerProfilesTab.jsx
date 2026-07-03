// src/components/ConsumerPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  fetchWorkGroups,
  fetchAllergens,
  fetchActiveProfile,
  setActiveProfile
} from "../../api/consumer";

const box = { background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.08)" };
const btn = { padding: "8px 12px", border: "1px solid #ddd", background: "#fff", borderRadius: 8, cursor: "pointer" };
const input = { padding: 8, border: "1px solid #ddd", borderRadius: 8, width: "100%" };
const row = { display: "grid", gap: 12, alignItems: "center", marginBottom: 10 };
const requiredInput = {
  borderColor: "#f0b24b",
  background: "#fffaf0",
};

function getBmiMeta(bmi) {
  const value = Number(bmi);
  if (!Number.isFinite(value)) {
    return {
      label: "Нет данных",
      color: "#777",
      bg: "#f3f3f3",
    };
  }

  if (value < 18.5) {
    return {
      label: "Недостаточная масса тела",
      color: "#8a6d1d",
      bg: "rgba(249,168,37,0.12)",
    };
  }

  if (value < 25) {
    return {
      label: "Нормальная масса тела",
      color: "#1b5e20",
      bg: "rgba(46,125,50,0.10)",
    };
  }

  if (value < 30) {
    return {
      label: "Избыточная масса тела",
      color: "#8a6d1d",
      bg: "rgba(249,168,37,0.12)",
    };
  }

  return {
    label: "Ожирение",
    color: "#b71c1c",
    bg: "rgba(229,57,53,0.10)",
  };
}

function HelpPopover({ title, children }) {
  const [open, setOpen] = React.useState(false);

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span
        onClick={() => setOpen(v => !v)}
        style={{
          marginLeft: 6,
          cursor: "pointer",
          color: "#2e7d32",
          fontWeight: 700,
          border: "1px solid #2e7d32",
          borderRadius: "50%",
          width: 18,
          height: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          userSelect: "none"
        }}
      >
        i
      </span>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 26,
            left: 0,
            zIndex: 100,
            width: 320,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 12,
            boxShadow: "0 4px 14px rgba(0,0,0,0.15)"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
          <div style={{ fontSize: 13, color: "#333", lineHeight: 1.4 }}>
            {children}
          </div>

          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                fontSize: 12,
                padding: "4px 8px",
                border: "1px solid #ddd",
                borderRadius: 6,
                background: "#fff",
                cursor: "pointer"
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

function BmiHelp({ weight, height, bmi }) {
  const h = height ? height / 100 : null;
  const calc = h ? (weight / (h * h)).toFixed(2) : null;

  return (
    <>
      <div>
        Индекс массы тела (ИМТ) используется для оценки соответствия массы тела росту.
      </div>

      <div style={{ marginTop: 6 }}>
        Формула:
        <br />
        ИМТ = масса (кг) / рост² (м²)
      </div>

      {weight && height && (
        <div style={{ marginTop: 6 }}>
          Пример:
          <br />
          {weight} / {h.toFixed(2)}² = {calc}
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        Интерпретация:
        <br />
        &lt; 18.5 — недостаточная масса<br />
        18.5–24.9 — норма<br />
        25–29.9 — избыточная масса<br />
        ≥ 30 — ожирение
      </div>
    </>
  );
}

function BmrHelp({ profile }) {
  const debug = profile?.energy?.debug;

  return (
    <>
      <div>
        BMR (Basal Metabolic Rate) — базовый обмен, минимальное количество энергии,
        необходимое организму в состоянии покоя.
      </div>

      <div style={{ marginTop: 6 }}>
        В системе используется табличный метод расчёта.
      </div>

      {debug && (
        <div style={{ marginTop: 6 }}>
          Параметры профиля:
          <br />
          Возраст: {profile.age_years} лет<br />
          Масса: {profile.weight_kg} кг<br />
          Диапазон: {debug.age_band}
        </div>
      )}

      {debug?.weight_nodes && (
        <div style={{ marginTop: 6 }}>
          Табличные значения:
          <br />
          {debug.weight_nodes.left} кг → {debug.weight_nodes.bmr_left} ккал<br />
          {debug.weight_nodes.right} кг → {debug.weight_nodes.bmr_right} ккал
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        Итог получен интерполяцией между ближайшими значениями.
      </div>
    </>
  );
}

function KfaHelp({ profile }) {
  return (
    <>
      <div>
        КФА — коэффициент физической активности, отражает уровень повседневной нагрузки.
      </div>

      <div style={{ marginTop: 6 }}>
        Определяется по группе труда.
      </div>

      {profile?.work_group && (
        <div style={{ marginTop: 6 }}>
          В текущем профиле:
          <br />
          {profile.work_group.name}
          <br />
          КФА = {profile.energy?.kfa}
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        Источник: МР 2.3.1.0253-21
      </div>
    </>
  );
}

function TdeeHelp({ profile }) {
  const e = profile?.energy;

  return (
    <>
      <div>
        TDEE — суточные энерготраты организма с учётом физической активности.
      </div>

      <div style={{ marginTop: 6 }}>
        Рассчитывается ускоренным методом.
      </div>

      {e && (
        <div style={{ marginTop: 6 }}>
          Расчёт:
          <br />
          {e.bmr_kcal_day} × {e.kfa} = {e.tdee_kcal_day} ккал/сут
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        Формула:
        <br />
        TDEE = BMR × КФА
      </div>
    </>
  );
}

function EnergyHelp() {
  return (
    <>
      <div>
        В данном блоке представлены ключевые показатели,
        используемые для расчёта суточных норм питания.
      </div>

      <div style={{ marginTop: 6 }}>
        Включает:
        <br />
        • ИМТ — оценка состояния организма<br />
        • BMR — базовый обмен<br />
        • КФА — уровень активности<br />
        • TDEE — итоговые энерготраты
      </div>

      <div style={{ marginTop: 6 }}>
        Расчёты выполняются на основе нормативов МР 2.3.1.0253-21.
      </div>
    </>
  );
}

export default function ConsumerProfilesTab({ selectedProfileId, onSelectProfile }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [profiles, setProfiles] = useState([]);
  const [workGroups, setWorkGroups] = useState([]);
  const [allergens, setAllergens] = useState([]);

  const selectedId = selectedProfileId;
  const setSelectedId = onSelectProfile;

  // форма
  const [form, setForm] = useState({
    display_name: "",
    sex: "male",
    age_years: 30,
    height_cm: 170,
    weight_kg: 70,
    work_group_id: "",
    has_minor_children: false,
    allergen_ids: [],
  });

  const selected = useMemo(
    () => profiles.find(p => p.id === selectedId) || null,
    [profiles, selectedId]
  );

  const bmiMeta = getBmiMeta(selected?.bmi);
  const energy = selected?.energy || null;

  const normalizeList = (data) => {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.results)) return data.results; // DRF pagination
        if (Array.isArray(data?.items)) return data.items;
        if (Array.isArray(data?.profiles)) return data.profiles;
        return [];
    };

  const didInitRef = useRef(false);
  const lastSavedProfileRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const [saveStatus, setSaveStatus] = useState("idle");

  const profileFormHasRequiredData = useCallback((draft) => (
    Boolean(draft.sex) &&
    Number.isFinite(Number(draft.age_years)) &&
    Number(draft.age_years) > 0 &&
    Number.isFinite(Number(draft.height_cm)) &&
    Number(draft.height_cm) > 0 &&
    Number.isFinite(Number(draft.weight_kg)) &&
    Number(draft.weight_kg) > 0 &&
    Number.isFinite(Number(draft.work_group_id)) &&
    Number(draft.work_group_id) > 0
  ), []);

  const profileFormHasAnyContent = useCallback((draft) => (
    Boolean((draft.display_name || "").trim()) ||
    Number(draft.age_years) !== 30 ||
    Number(draft.height_cm) !== 170 ||
    Number(draft.weight_kg) !== 70 ||
    Boolean(draft.work_group_id) ||
    Boolean(draft.has_minor_children) ||
    (draft.allergen_ids || []).length > 0
  ), []);

  const buildProfilePayload = useCallback((draft) => ({
    display_name: draft.display_name || null,
    sex: draft.sex,
    age_years: Number(draft.age_years),
    height_cm: Number(draft.height_cm),
    weight_kg: Number(draft.weight_kg),
    work_group_id: Number(draft.work_group_id),
    has_minor_children: !!draft.has_minor_children,
    allergen_ids: [...(draft.allergen_ids || [])].sort((a, b) => a - b),
  }), []);

  const profilePayloadSignature = useCallback(
    (draft) => JSON.stringify(buildProfilePayload(draft)),
    [buildProfilePayload]
  );

  // загрузка справочников + профилей
  useEffect(() => {
    let cancelled = false;

    (async () => {
        try {
        setLoading(true);
        setError("");

        const [wgRaw, alRaw, prRaw, activeraw] = await Promise.all([
            fetchWorkGroups(),
            fetchAllergens(),
            fetchProfiles(),
            fetchActiveProfile().catch(() => null),
        ]);

        if (cancelled) return;

        const pr = normalizeList(prRaw);
        setProfiles(pr);
        setWorkGroups(normalizeList(wgRaw));
        setAllergens(normalizeList(alRaw));

        const activeId = activeraw?.id ?? pr.find(p => p.is_active)?.id ?? pr[0]?.id ?? null;

        // ВАЖНО: используем selectedProfileId из props в этом же рендере
        if (!didInitRef.current) {
          didInitRef.current = true;
          if (!selectedProfileId) {
            onSelectProfile(activeId);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Ошибка загрузки данных модуля потребителя");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    }, [selectedProfileId, onSelectProfile]);


  // когда выбрали профиль — заполнить форму (чтобы можно было редактировать)
  useEffect(() => {
    if (!selected) return;

    setForm({
      display_name: selected.display_name ?? "",
      sex: selected.sex ?? "male",
      age_years: selected.age_years ?? 30,
      height_cm: selected.height_cm ?? 170,
      weight_kg: selected.weight_kg ?? 70,
      work_group_id: selected.work_group?.id ?? "",
      has_minor_children: !!selected.has_minor_children,
      allergen_ids: (selected.allergens || []).map(a => a.id),
    });
    lastSavedProfileRef.current = profilePayloadSignature({
      display_name: selected.display_name ?? "",
      sex: selected.sex ?? "male",
      age_years: selected.age_years ?? 30,
      height_cm: selected.height_cm ?? 170,
      weight_kg: selected.weight_kg ?? 70,
      work_group_id: selected.work_group?.id ?? "",
      has_minor_children: !!selected.has_minor_children,
      allergen_ids: (selected.allergens || []).map(a => a.id),
    });
    setSaveStatus("idle");
  }, [profilePayloadSignature, selected]);

  useEffect(() => {
    if (selectedId || loading) return;
    lastSavedProfileRef.current = null;
    setSaveStatus("idle");
  }, [selectedId, loading]);

  useEffect(() => {
    if (loading) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    if (selectedId == null && !profileFormHasAnyContent(form)) {
      setSaveStatus("idle");
      return;
    }

    if (!profileFormHasRequiredData(form)) {
      setSaveStatus("idle");
      return;
    }

    const nextSignature = profilePayloadSignature(form);
    if (lastSavedProfileRef.current === nextSignature) {
      setSaveStatus("saved");
      return;
    }

    autosaveTimerRef.current = setTimeout(async () => {
      try {
        setError("");
        setSaveStatus("saving");
        const payload = buildProfilePayload(form);

        if (selectedId) {
          const updated = await updateProfile(selectedId, payload);
          setProfiles((prev) => prev.map((p) => (p.id === selectedId ? updated : p)));
        } else {
          const created = await createProfile(payload);
          setProfiles((prev) => [created, ...prev]);
          setSelectedId(created.id);
        }

        lastSavedProfileRef.current = nextSignature;
        setSaveStatus("saved");
      } catch (e) {
        setSaveStatus("error");
        setError(e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || "Ошибка сохранения"));
      }
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    buildProfilePayload,
    form,
    loading,
    profileFormHasAnyContent,
    profileFormHasRequiredData,
    profilePayloadSignature,
    selectedId,
    setSelectedId,
  ]);

  const toggleAllergen = (id) => {
    setForm(prev => {
      const set = new Set(prev.allergen_ids);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...prev, allergen_ids: Array.from(set) };
    });
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setError("");
    setSaveStatus("idle");
    setForm({
      display_name: "",
      sex: "male",
      age_years: 30,
      height_cm: 170,
      weight_kg: 70,
      work_group_id: "",
      has_minor_children: false,
      allergen_ids: [],
    });
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm("Удалить профиль?")) return;

    try {
      setError("");
      await deleteProfile(selectedId);
      const next = profiles.filter(p => p.id !== selectedId);
      setProfiles(next);
      setSelectedId(next[0]?.id ?? null);
    } catch (e) {
      setError(e?.message || "Ошибка удаления");
    }
  };

  const handleSetActive = async (id) => {
    try {
        setError("");
        const updated = await setActiveProfile(id); // ожидаем, что вернётся профиль (уже is_active=true)

        // 1) обновим список профилей: снимем is_active со всех, выставим для выбранного
        setProfiles(prev =>
        prev.map(p => ({ ...p, is_active: p.id === id }))
        );

        // 2) выберем его в редакторе
        setSelectedId(id);

        // 3) если бэк возвращает актуальную модель профиля (с energy/bmi) — можно точечно обновить
        if (updated?.id) {
        setProfiles(prev => prev.map(p => (p.id === updated.id ? { ...p, ...updated, is_active: true } : p)));
        }
    } catch (e) {
        setError(e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || "Ошибка установки активного профиля"));
    }
  };

  const profileTitle = selected
    ? (
      selected.display_name
        || `${selected.sex === "male" ? "Мужчина" : "Женщина"}, ${selected.age_years} лет, ${selected.weight_kg} кг`
    )
    : "Новый профиль";

  if (loading) return <div style={{ padding: 16 }}>Загрузка модуля потребителя…</div>;

  return (
    <div className="app-page">
      <div className="app-two-col">
        {/* Список профилей */}
        <div style={{ ...box, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>Профили</div>
            <button style={btn} onClick={handleCreateNew}>+ Новый</button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {profiles.map(p => (
                <div
                    key={p.id}
                    style={{
                    ...btn,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    textAlign: "left",
                    borderColor: p.id === selectedId ? "#2e7d32" : "#ddd",
                    cursor: "default",
                    }}
                >
                    <div
                    onClick={() => setSelectedId(p.id)}
                    style={{ cursor: "pointer" }}
                    >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontWeight: 600 }}>
                        {p.display_name
                            ? p.display_name
                            : `${p.sex === "male" ? "Мужчина" : "Женщина"}, ${p.age_years} лет`}
                        </div>

                        {p.is_active && (
                        <span
                            style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid #2e7d32",
                            color: "#2e7d32",
                            }}
                        >
                            Активный
                        </span>
                        )}
                    </div>

                    <div style={{ fontSize: 12, color: "#666" }}>
                        Вес {p.weight_kg} кг • Рост {p.height_cm} см
                    </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center" }}>
                    <button
                        type="button"
                        style={{
                        ...btn,
                        padding: "6px 10px",
                        fontSize: 13,
                        opacity: p.is_active ? 0.6 : 1,
                        }}
                        disabled={p.is_active}
                        onClick={() => handleSetActive(p.id)}
                    >
                        {p.is_active ? "Выбран" : "Сделать активным"}
                    </button>
                    </div>
                </div>
                ))}
            {profiles.length === 0 && (
              <div style={{ color: "#666", fontSize: 13 }}>Пока нет профилей. Создай первый.</div>
            )}
          </div>
        </div>

        {/* Редактор профиля + расчёты */}
        <div style={{ ...box, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700 }}>
              {profileTitle}
            </div>
            <div className="app-header-actions">
              <div style={{ fontSize: 12, color: saveStatus === "error" ? "crimson" : "#666", alignSelf: "center" }}>
                {saveStatus === "saving" && "Сохранение..."}
                {saveStatus === "saved" && "Сохранено"}
                {saveStatus === "error" && "Ошибка сохранения"}
              </div>
              {selectedId && <button style={{ ...btn, borderColor: "#e57373" }} onClick={handleDelete}>Удалить</button>}
            </div>
          </div>

          {error && <div style={{ marginTop: 10, color: "crimson" }}>Ошибка: {error}</div>}

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Основные данные</div>

            <div style={row} className="app-form-row">
                <label>Название профиля</label>
                <input
                    style={input}
                    value={form.display_name}
                    onChange={e => setForm({ ...form, display_name: e.target.value })}
                    placeholder="Например: Я / Снижение веса / Набор массы"
                />
                </div>

            <div style={row} className="app-form-row">
              <label>Пол <span style={{ color: "#c62828" }}>*</span></label>
              <select style={{ ...input, ...requiredInput }} value={form.sex} onChange={e => setForm({ ...form, sex: e.target.value })}>
                <option value="male">Мужчина</option>
                <option value="female">Женщина</option>
              </select>
            </div>

            <div style={row} className="app-form-row">
              <label>Возраст (лет) <span style={{ color: "#c62828" }}>*</span></label>
              <input style={{ ...input, ...requiredInput }} type="number" value={form.age_years}
                onChange={e => setForm({ ...form, age_years: e.target.value })} />
            </div>

            <div style={row} className="app-form-row">
              <label>Рост (см) <span style={{ color: "#c62828" }}>*</span></label>
              <input style={{ ...input, ...requiredInput }} type="number" value={form.height_cm}
                onChange={e => setForm({ ...form, height_cm: e.target.value })} />
            </div>

            <div style={row} className="app-form-row">
              <label>Вес (кг) <span style={{ color: "#c62828" }}>*</span></label>
              <input style={{ ...input, ...requiredInput }} type="number" value={form.weight_kg}
                onChange={e => setForm({ ...form, weight_kg: e.target.value })} />
            </div>

            <div style={row} className="app-form-row">
              <label>Группа труда <span style={{ color: "#c62828" }}>*</span></label>
              <select
                style={{ ...input, ...requiredInput }}
                value={form.work_group_id}
                onChange={e => setForm({ ...form, work_group_id: e.target.value })}
              >
                <option value="">— выбрать —</option>
                {workGroups
                  .filter(g => String(g.id) !== "5" || Number(form.age_years) >= 65)
                  .map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} (КФА: {form.sex === "male" ? g.kfa_male : g.kfa_female})
                    </option>
                  ))}
              </select>
            </div>
            {Number(form.age_years) < 65 && (
              <div style={{ fontSize: 12, color: "#666", marginTop: -2 }}>
                Группа труда V доступна только для профилей 65+.
              </div>
            )}

            <div style={row} className="app-form-row">
              <label>Включить режим подбора продуктов для организации питания детей?</label>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    checked={form.has_minor_children === true}
                    onChange={() => setForm({ ...form, has_minor_children: true })}
                  />
                  Да
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="radio"
                    checked={form.has_minor_children === false}
                    onChange={() => setForm({ ...form, has_minor_children: false })}
                  />
                  Нет
                </label>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#8a6d1d", marginTop: 6 }}>
            Поля, отмеченные <span style={{ color: "#c62828" }}>*</span>, обязательны для расчётов ИМТ, BMR, КФА и TDEE.
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Аллергии</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {allergens.map(a => {
                const active = form.allergen_ids.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAllergen(a.id)}
                    style={{
                      ...btn,
                      borderRadius: 999,
                      borderColor: active ? "#2e7d32" : "#ddd",
                      background: active ? "rgba(46,125,50,0.08)" : "#fff",
                      padding: "6px 10px",
                      fontSize: 13,
                    }}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* расчётный блок берём прямо из ответа профиля (bmi + energy) */}
          <div style={{ marginTop: 16, padding: 16, border: "1px solid #eee", borderRadius: 12, background: "#fafafa" }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>
              Расчёты
              <HelpPopover title="О показателях">
                <EnergyHelp />
              </HelpPopover>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  ИМТ
                  <HelpPopover title="Индекс массы тела">
                    <BmiHelp
                      weight={selected?.weight_kg}
                      height={selected?.height_cm}
                      bmi={selected?.bmi}
                    />
                  </HelpPopover>
                </div>
                <div style={{ fontWeight: 600, color: bmiMeta.color, display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                  <div>{selected?.bmi ?? "—"}</div>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: bmiMeta.bg,
                      color: bmiMeta.color,
                      border: `1px solid ${bmiMeta.color}`,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {bmiMeta.label}
                  </span>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600 }}>
                  Основной обмен (BMR)
                  <HelpPopover title="Базовый обмен">
                    <BmrHelp profile={selected} />
                  </HelpPopover>
                </div>
                <div style={{ marginTop: 4 }}>
                  {energy?.bmr_kcal_day ?? "—"} ккал/сут
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  Количество калорий для поддержания жизненно важных функций организма в состоянии покоя.
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600 }}>
                  Коэффициент физической активности (КФА)
                  <HelpPopover title="КФА">
                    <KfaHelp profile={selected} />
                  </HelpPopover>
                </div>
                <div style={{ marginTop: 4 }}>
                  {energy?.kfa ?? "—"}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600 }}>
                  Суточные энерготраты (TDEE)
                  <HelpPopover title="Суточные энерготраты">
                    <TdeeHelp profile={selected} />
                  </HelpPopover>
                </div>
                <div style={{ marginTop: 4 }}>
                  {energy?.tdee_kcal_day ?? "—"} ккал/сут
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
