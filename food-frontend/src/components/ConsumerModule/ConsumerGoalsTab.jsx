import React, { useEffect, useMemo, useState } from "react";
import {
  fetchGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  setActiveGoal,
  fetchProfile,
  fetchProfileTargets,
  fetchGoalPreferences,
  replaceGoalPreferences,
  fetchNutrientsDictionary,
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

const input = {
  padding: 8,
  border: "1px solid #ddd",
  borderRadius: 8,
  width: "100%",
};

const row = {
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  gap: 12,
  alignItems: "center",
  marginBottom: 10,
};

const goalTypeLabels = {
  lose_weight: "Похудение",
  gain_muscle: "Набор мышечной массы",
  maintain: "Поддержание",
};

function HelpPopover({ title, children }) {
  const [open, setOpen] = React.useState(false);

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span
        onClick={() => setOpen((v) => !v)}
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
          userSelect: "none",
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
            width: 360,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 12,
            boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
          <div style={{ fontSize: 13, color: "#333", lineHeight: 1.45 }}>
            {children}
          </div>
          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                fontSize: 12,
                padding: "4px 8px",
                border: "1px solid #ddd",
                borderRadius: 6,
                background: "#fff",
                cursor: "pointer",
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

function TargetHelp({ type, targets, profile }) {
  const energy = targets?.target_energy_kcal_day;
  const pct = targets?.macros_pct || {};
  const tdee = targets?.energy_calc?.tdee_kcal_day;
  const delta = targets?.energy_delta_kcal ?? 0;
  const debug = targets?.debug || {};
  const mr = targets?.mr_norms || {};

  if (type === "targets") {
    return (
      <>
        <div>Это суточные ориентиры, которые дальше используются в модуле рекомендаций.</div>
        <div style={{ marginTop: 6 }}>
          Они рассчитываются из данных профиля, активной цели питания и нормативов МР 2.3.1.0253-21.
        </div>
      </>
    );
  }

  if (type === "tdee") {
    return (
      <>
        <div>TDEE — суточные энерготраты с учётом физической активности.</div>
        {targets?.energy_calc && (
          <div style={{ marginTop: 6 }}>
            Пример: BMR {targets.energy_calc.bmr_kcal_day} × КФА {targets.energy_calc.kfa} = {tdee} ккал/сут.
          </div>
        )}
      </>
    );
  }

  if (type === "baseEnergy") {
    return (
      <>
        <div>База целевой энергии — это TDEE с поправкой из выбранной цели питания.</div>
        <div style={{ marginTop: 6 }}>
          Пример: {tdee ?? "TDEE"} + {delta} = {targets?.target_energy_base_kcal_day ?? "—"} ккал/сут.
        </div>
      </>
    );
  }

  if (type === "targetEnergy") {
    return (
      <>
        <div>Это итоговая энергия, от которой считаются БЖУ и часть показателей рекомендаций.</div>
        <div style={{ marginTop: 6 }}>
          Сейчас она равна базе целевой энергии: {targets?.target_energy_base_kcal_day ?? "—"} ккал/сут.
        </div>
      </>
    );
  }

  if (type === "macrosMode") {
    return (
      <>
        <div>
          Если режим ручной, проценты БЖУ взяты из формы цели. Если режим по нормативам МР,
          проценты рассчитаны из строки нормативной таблицы.
        </div>
        <div style={{ marginTop: 6 }}>
          На строку МР повлияли: пол {profile?.sex === "female" ? "женский" : "мужской"},
          возраст {profile?.age_years ?? debug.age_years} лет, группа труда {debug.work_group_id ?? "—"}.
        </div>
      </>
    );
  }

  if (type === "macrosPct") {
    return (
      <>
        <div>Проценты показывают, какая доля целевой энергии приходится на белки, жиры и углеводы.</div>
        {targets?.macros_mode === "mr_table" && (
          <div style={{ marginTop: 6 }}>
            В МР для текущего профиля найдена строка: энергия {mr.energy_kcal_day} ккал,
            белок {mr.protein_g_day} г, жиры {mr.fat_g_day} г, углеводы {mr.carb_g_day} г.
            Из неё получены проценты: Б {pct.protein_pct}% / Ж {pct.fat_pct}% / У {pct.carb_pct}%.
          </div>
        )}
        {targets?.macros_mode === "manual" && (
          <div style={{ marginTop: 6 }}>
            Эти проценты введены вручную в активной цели питания.
          </div>
        )}
      </>
    );
  }

  if (type === "protein") {
    return <div>Белок = {energy} × {pct.protein_pct}% / 4 = {targets?.target_macros_g_day?.protein_g} г/сут.</div>;
  }

  if (type === "fat") {
    return <div>Жиры = {energy} × {pct.fat_pct}% / 9 = {targets?.target_macros_g_day?.fat_g} г/сут.</div>;
  }

  if (type === "carb") {
    return <div>Углеводы = {energy} × {pct.carb_pct}% / 4 = {targets?.target_macros_g_day?.carb_g} г/сут.</div>;
  }

  if (type === "sodium") {
    return (
      <>
        <div>Натрий берётся из нормативов минералов для пола профиля.</div>
        <div style={{ marginTop: 6 }}>
          Если норматив в базе не найден, используется fallback 1300 мг/сут.
        </div>
      </>
    );
  }

  if (type === "nlc") {
    return <div>НЖК = {energy} × 10% / 9 = {targets?.target_fat_acids_day?.nlc_g} г/сут.</div>;
  }

  return null;
}

export default function ConsumerGoalsTab({ profileId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [goals, setGoals] = useState([]);
  const [selectedGoalId, setSelectedGoalId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [targets, setTargets] = useState(null);
  const [nutrients, setNutrients] = useState([]);
  const [prefs, setPrefs] = useState([]); // [{ nutrient_code, direction }]
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);

  // форма добавления новой preference
  const [newPref, setNewPref] = useState({
    nutrient_code: "",
    direction: "more",
  });

  // false = auto by backend (MR), true = user enters %
  const [manualMacros, setManualMacros] = useState(false);

  const [form, setForm] = useState({
    title: "",
    goal_type: "maintain",
    energy_delta_kcal: "",
    protein_pct: "",
    fat_pct: "",
    carb_pct: "",
  });

  const selectedGoal = useMemo(
    () => goals.find((g) => g.id === selectedGoalId) || null,
    [goals, selectedGoalId]
  );

  const normalizeList = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  };

  const loadAll = async () => {
    if (!profileId) return;
    setLoading(true);
    setError("");
    try {
      const profileData = await fetchProfile(profileId);
      setProfile(profileData);

      const gRaw = await fetchGoals(profileId);
      const g = normalizeList(gRaw);
      setGoals(g);

      const active = g.find((x) => x.is_active) || g[0] || null;
      setSelectedGoalId(active?.id ?? null);

      const t = await fetchProfileTargets(profileId);
      setTargets(t);
    } catch (e) {
      setError(
        e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || "Ошибка")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  useEffect(() => {
    if (!selectedGoal) return;

    const hasManual =
      selectedGoal.protein_pct != null &&
      selectedGoal.fat_pct != null &&
      selectedGoal.carb_pct != null;

    setManualMacros(hasManual);

    setForm({
      title: selectedGoal.title ?? "",
      goal_type: selectedGoal.goal_type ?? "maintain",
      energy_delta_kcal: selectedGoal.energy_delta_kcal ?? "",
      protein_pct: selectedGoal.protein_pct ?? "",
      fat_pct: selectedGoal.fat_pct ?? "",
      carb_pct: selectedGoal.carb_pct ?? "",
    });
  }, [selectedGoal]);

  useEffect(() => {
    let cancelled = false;

    const loadPrefs = async () => {
      if (!selectedGoalId) {
        setPrefs([]);
        return;
      }

      setPrefsLoading(true);
      setError("");

      try {
        // 1) справочник нутриентов (грузим один раз)
        if (nutrients.length === 0) {
          const dictRaw = await fetchNutrientsDictionary();
          const dict = normalizeList(dictRaw);
          if (!cancelled) setNutrients(dict);
        }

        // 2) preferences по цели
        const pRaw = await fetchGoalPreferences(selectedGoalId);
        const p = normalizeList(pRaw);

        if (!cancelled) {
          setPrefs(
            (p || []).map((x) => ({
              nutrient_code: x.nutrient_code,
              direction: x.direction,
            }))
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e?.response?.data
              ? JSON.stringify(e.response.data)
              : (e?.message || "Ошибка загрузки предпочтений")
          );
        }
      } finally {
        if (!cancelled) setPrefsLoading(false);
      }
    };

    loadPrefs();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGoalId]);

  const normalizePayload = () => {
    const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

    const payload = {
      profile_id: profileId,
      title: form.title || null,
      goal_type: form.goal_type,
      energy_delta_kcal: numOrNull(form.energy_delta_kcal),
    };

    if (manualMacros) {
      payload.protein_pct = numOrNull(form.protein_pct);
      payload.fat_pct = numOrNull(form.fat_pct);
      payload.carb_pct = numOrNull(form.carb_pct);
    } else {
      // Авто по МР: проценты не задаём, бек сам посчитает в /targets/
      payload.protein_pct = null;
      payload.fat_pct = null;
      payload.carb_pct = null;
    }

    return payload;
  };

  const validateManualMacros = () => {
    if (!manualMacros) return true;

    const p = Number(form.protein_pct);
    const f = Number(form.fat_pct);
    const c = Number(form.carb_pct);

    // требуем, чтобы в manual все 3 были числами
    if (!Number.isFinite(p) || !Number.isFinite(f) || !Number.isFinite(c)) {
      setError("В ручном режиме заполните проценты Б, Ж, У.");
      return false;
    }

    const sum = p + f + c;
    if (Math.abs(sum - 100) > 0.01) {
      setError("Сумма процентов БЖУ должна быть 100.");
      return false;
    }

    return true;
  };

  const refreshTargets = async () => {
    if (!profileId) return;
    const [profileData, t] = await Promise.all([
      fetchProfile(profileId),
      fetchProfileTargets(profileId),
    ]);
    setProfile(profileData);
    setTargets(t);
  };

  const handleSave = async () => {
    try {
      setError("");
      if (!validateManualMacros()) return;

      const payload = normalizePayload();

      if (selectedGoalId) {
        const updated = await updateGoal(selectedGoalId, payload);
        setGoals((prev) => prev.map((g) => (g.id === selectedGoalId ? updated : g)));
      } else {
        const created = await createGoal(payload);
        setGoals((prev) => [created, ...prev]);
        setSelectedGoalId(created.id);
      }

      await refreshTargets();
    } catch (e) {
      setError(
        e?.response?.data
          ? JSON.stringify(e.response.data)
          : (e?.message || "Ошибка сохранения")
      );
    }
  };

  const handleCreateNew = () => {
    setSelectedGoalId(null);
    setManualMacros(false);
    setPrefs([]);
    setForm({
      title: "",
      goal_type: "maintain",
      energy_delta_kcal: "",
      protein_pct: "",
      fat_pct: "",
      carb_pct: "",
    });
  };

  const handleDelete = async () => {
    if (!selectedGoalId) return;
    if (!window.confirm("Удалить цель?")) return;

    try {
      setError("");
      await deleteGoal(selectedGoalId);

      const next = goals.filter((g) => g.id !== selectedGoalId);
      setGoals(next);

      const nextSelected = next.find((x) => x.is_active) || next[0] || null;
      setSelectedGoalId(nextSelected?.id ?? null);

      await refreshTargets();
    } catch (e) {
      setError(e?.message || "Ошибка удаления");
    }
  };

    const addPref = () => {
    const code = (newPref.nutrient_code || "").trim();
    if (!code) {
      setError("Выберите нутриент.");
      return;
    }

    // строго одна запись на нутриент
    if (prefs.some((p) => p.nutrient_code === code)) {
      setError("Этот нутриент уже добавлен в предпочтения.");
      return;
    }

    setPrefs((prev) => [
      ...prev,
      {
        nutrient_code: code,
        direction: newPref.direction,
      },
    ]);
  };

  const removePref = (code) => {
    setPrefs((prev) => prev.filter((p) => p.nutrient_code !== code));
  };

  const updatePref = (code, patch) => {
    setPrefs((prev) =>
      prev.map((p) => (p.nutrient_code === code ? { ...p, ...patch } : p))
    );
  };

  const savePrefs = async () => {
    if (!selectedGoalId) {
      setError("Сначала выберите или создайте цель.");
      return;
    }

    setPrefsSaving(true);
    setError("");
    try {
      // PUT replace целиком
      const updated = await replaceGoalPreferences(selectedGoalId, prefs);
      // backend возвращает список — синхронизируемся с ним
      const p = normalizeList(updated);
      setPrefs(
        (p || []).map((x) => ({
          nutrient_code: x.nutrient_code,
          direction: x.direction,
        }))
      );
    } catch (e) {
      setError(
        e?.response?.data
          ? JSON.stringify(e.response.data)
          : (e?.message || "Ошибка сохранения предпочтений")
      );
    } finally {
      setPrefsSaving(false);
    }
  };

  const nutrientLabel = (code) => {
    const n = nutrients.find((x) => x.code === code);
    return n ? `${n.ru_name} (${n.unit || "-"})` : code;
  };

  const handleSetActive = async (id) => {
    try {
      setError("");
      await setActiveGoal(id);
      await loadAll(); // чтобы список целей и targets обновились консистентно
    } catch (e) {
      setError(e?.message || "Ошибка установки активной цели");
    }
  };

  if (!profileId) {
    return <div style={{ ...box, padding: 16 }}>Сначала выберите профиль.</div>;
  }

  if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;

  const macrosModeLabel =
  targets?.macros_mode === "manual"
    ? "ручной"
    : targets?.macros_mode === "mr_table"
      ? "по нормативам МР"
      : targets?.macros_mode || "—";
  const bmiValue = Number(profile?.bmi);
  const isObesityProfile = Number.isFinite(bmiValue) && bmiValue >= 30;
  const selectedGoalTitle = selectedGoal
    ? `${selectedGoal.title || goalTypeLabels[selectedGoal.goal_type] || selectedGoal.goal_type}${selectedGoal.energy_delta_kcal ? `, ${selectedGoal.energy_delta_kcal > 0 ? "+" : ""}${selectedGoal.energy_delta_kcal} ккал/сут` : ""}`
    : "Новая цель";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}>
      <div style={{ ...box, padding: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>Цели</div>
          <button type="button" style={btn} onClick={handleCreateNew}>
            + Новая
          </button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {goals.map((g) => (
            <div
              key={g.id}
              style={{
                ...btn,
                textAlign: "left",
                borderColor: g.id === selectedGoalId ? "#2e7d32" : "#ddd",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
              }}
            >
              <div
                onClick={() => setSelectedGoalId(g.id)}
                style={{ cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>{g.title || goalTypeLabels[g.goal_type] || g.goal_type}</div>
                  {g.is_active && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        border: "1px solid #2e7d32",
                        color: "#2e7d32",
                      }}
                    >
                      Активная
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  Δ {g.energy_delta_kcal ?? 0} ккал/сут
                </div>
              </div>

              <button
                type="button"
                style={{
                  ...btn,
                  padding: "6px 10px",
                  fontSize: 13,
                  opacity: g.is_active ? 0.6 : 1,
                }}
                disabled={g.is_active}
                onClick={() => handleSetActive(g.id)}
              >
                Активировать
              </button>
            </div>
          ))}
          {goals.length === 0 && (
            <div style={{ color: "#666", fontSize: 13 }}>Целей пока нет.</div>
          )}
        </div>
      </div>

      <div style={{ ...box, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700 }}>
            {selectedGoalTitle}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {selectedGoalId && (
              <button
                type="button"
                style={{ ...btn, borderColor: "#e57373" }}
                onClick={handleDelete}
              >
                Удалить
              </button>
            )}
            <button
              type="button"
              style={{ ...btn, borderColor: "#2e7d32" }}
              onClick={handleSave}
            >
              Сохранить
            </button>
          </div>
        </div>

        {error && <div style={{ marginTop: 10, color: "crimson" }}>{error}</div>}

        <div style={{ marginTop: 14 }}>
          <div style={row}>
            <label>Название (опц.)</label>
            <input
              style={input}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div style={row}>
            <label>Цель</label>
            <select
              style={input}
              value={form.goal_type}
              onChange={(e) => setForm({ ...form, goal_type: e.target.value })}
            >
              <option value="lose_weight">Похудение</option>
              <option value="gain_muscle">Набор мышечной массы</option>
              <option value="maintain">Поддержание</option>
            </select>
          </div>

          <div style={row}>
            <label>Изменение целевой энергии, ккал/сут</label>
            <input
              style={input}
              type="number"
              value={form.energy_delta_kcal}
              onChange={(e) => setForm({ ...form, energy_delta_kcal: e.target.value })}
            />
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Показывает, насколько целевая энергия должна отличаться от базовой нормы для текущего профиля.
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {form.goal_type === "lose_weight" && (
                <>
                <button type="button" style={btn} onClick={() => setForm({ ...form, energy_delta_kcal: isObesityProfile ? -500 : -250 })}>
                  {isObesityProfile ? "-500" : "-250"}
                </button>
                <button type="button" style={btn} onClick={() => setForm({ ...form, energy_delta_kcal: -500 })}>-500</button>
                {isObesityProfile && (
                  <>
                  <button type="button" style={btn} onClick={() => setForm({ ...form, energy_delta_kcal: -600 })}>-600</button>
                  <button type="button" style={btn} onClick={() => setForm({ ...form, energy_delta_kcal: -700 })}>-700</button>
                  </>
                )}
                <div style={{ fontSize: 12, color: "#666", alignSelf: "center" }}>
                    {isObesityProfile
                      ? "Для профилей с ИМТ >= 30 можно ориентироваться на типовой дефицит 500–700 ккал/сут по клиническим рекомендациям по ожирению."
                      : "Диапазон 500–700 ккал/сут из клинических рекомендаций по ожирению применяют при ИМТ >= 30; в остальных случаях дефицит подбирают индивидуально."}
                </div>
                </>
            )}

            {form.goal_type === "maintain" && (
                <button type="button" style={btn} onClick={() => setForm({ ...form, energy_delta_kcal: 0 })}>0</button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 8px" }}>
            <div style={{ fontWeight: 600 }}>БЖУ (в % от калорийности)</div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#444" }}>
              <input
                type="checkbox"
                checked={manualMacros}
                onChange={(e) => setManualMacros(e.target.checked)}
              />
              Задать вручную (иначе значения будут рассчитаны автоматически по МР 2.3.1.0253-21)
            </label>
          </div>

          <div style={row}>
            <label>Белки, %</label>
            <input
              style={input}
              type="number"
              disabled={!manualMacros}
              value={form.protein_pct}
              onChange={(e) => setForm({ ...form, protein_pct: e.target.value })}
            />
          </div>
          <div style={row}>
            <label>Жиры, %</label>
            <input
              style={input}
              type="number"
              disabled={!manualMacros}
              value={form.fat_pct}
              onChange={(e) => setForm({ ...form, fat_pct: e.target.value })}
            />
          </div>
          <div style={row}>
            <label>Углеводы, %</label>
            <input
              style={input}
              type="number"
              disabled={!manualMacros}
              value={form.carb_pct}
              onChange={(e) => setForm({ ...form, carb_pct: e.target.value })}
            />
          </div>

          {!manualMacros && (
            <div style={{ fontSize: 12, color: "#666" }}>
              В режиме «Авто» целевые значения БЖУ определяются по нормативам МР 2.3.1.0253-21 с учётом пола, возраста и группы труда профиля.
            </div>
          )}
        </div>

                {/* Preferences по нутриентам */}
        <div style={{ marginTop: 18, padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fff" }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Предпочтения по нутриентам</div>

          {!selectedGoalId ? (
            <div style={{ color: "#666", fontSize: 13 }}>
              Сначала сохраните/выберите цель, чтобы редактировать предпочтения.
            </div>
          ) : prefsLoading ? (
            <div style={{ color: "#666", fontSize: 13 }}>Загрузка...</div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px auto",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                <select
                  style={input}
                  value={newPref.nutrient_code}
                  onChange={(e) => setNewPref((p) => ({ ...p, nutrient_code: e.target.value }))}
                >
                  <option value="">Выберите нутриент…</option>
                  {nutrients.map((n) => (
                    <option key={n.code} value={n.code}>
                      {n.ru_name} ({n.unit || "-"})
                    </option>
                  ))}
                </select>

                <select
                  style={input}
                  value={newPref.direction}
                  onChange={(e) => setNewPref((p) => ({ ...p, direction: e.target.value }))}
                >
                  <option value="more">Больше</option>
                  <option value="less">Меньше</option>
                </select>

                <button type="button" style={btn} onClick={addPref}>
                  Добавить
                </button>
              </div>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 10 }}>
                Эти предпочтения смещают рекомендации: «Больше» повышает оценку продуктов с высоким содержанием выбранного нутриента,
                «Меньше» — продуктов с низким содержанием. Все выбранные нутриенты учитываются одинаково.
              </div>

              {prefs.length === 0 ? (
                <div style={{ color: "#666", fontSize: 13 }}>Предпочтения не заданы.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {prefs.map((p) => (
                    <div
                      key={p.nutrient_code}
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 10,
                        padding: 10,
                        display: "grid",
                        gridTemplateColumns: "1fr 140px auto",
                        gap: 8,
                        alignItems: "center",
                        background: "#fafafa",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{nutrientLabel(p.nutrient_code)}</div>

                      <select
                        style={input}
                        value={p.direction}
                        onChange={(e) => updatePref(p.nutrient_code, { direction: e.target.value })}
                      >
                        <option value="more">Больше</option>
                        <option value="less">Меньше</option>
                      </select>

                      <button
                        type="button"
                        style={{ ...btn, borderColor: "#e57373" }}
                        onClick={() => removePref(p.nutrient_code)}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button
                  type="button"
                  style={{ ...btn, borderColor: "#2e7d32" }}
                  onClick={savePrefs}
                  disabled={prefsSaving}
                >
                  {prefsSaving ? "Сохранение..." : "Сохранить предпочтения"}
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
          Ниже показаны целевые значения питания, рассчитанные для выбранного профиля и активной цели.
        </div>

        <div
          style={{
            marginTop: 18,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Расчёт суточных целевых показателей
            <HelpPopover title="Что это за блок">
              <TargetHelp type="targets" targets={targets} profile={profile} />
            </HelpPopover>
          </div>
          {!targets ? (
            <div style={{ color: "#666", fontSize: 13 }}>Нет данных</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 8, fontSize: 14 }}>
              <div>
                TDEE, ккал/сут
                <HelpPopover title="TDEE">
                  <TargetHelp type="tdee" targets={targets} profile={profile} />
                </HelpPopover>
              </div>
              <div>{targets?.energy_calc?.tdee_kcal_day ?? "—"}</div>

              <div>
                База целевой энергии, ккал/сут
                <HelpPopover title="База целевой энергии">
                  <TargetHelp type="baseEnergy" targets={targets} profile={profile} />
                </HelpPopover>
              </div>
              <div>{targets?.target_energy_base_kcal_day ?? "—"}</div>

              <div>
                Целевая энергия, ккал/сут
                <HelpPopover title="Целевая энергия">
                  <TargetHelp type="targetEnergy" targets={targets} profile={profile} />
                </HelpPopover>
              </div>
              <div>{targets.target_energy_kcal_day}</div>

              {"macros_mode" in targets && (
                <>
                  <div>
                    Режим БЖУ
                    <HelpPopover title="Откуда взят режим БЖУ">
                      <TargetHelp type="macrosMode" targets={targets} profile={profile} />
                    </HelpPopover>
                  </div>
                  <div>{macrosModeLabel}</div>
                </>
              )}

              {targets.macros_pct && (
                <>
                  <div>
                    БЖУ, %
                    <HelpPopover title="Почему именно такие проценты БЖУ">
                      <TargetHelp type="macrosPct" targets={targets} profile={profile} />
                    </HelpPopover>
                  </div>
                  <div>
                    Б {targets.macros_pct.protein_pct} / Ж {targets.macros_pct.fat_pct} / У{" "}
                    {targets.macros_pct.carb_pct}
                  </div>
                </>
              )}

              {targets.target_macros_g_day && (
                <>
                  <div>
                    Белок, г/сут
                    <HelpPopover title="Расчёт белка">
                      <TargetHelp type="protein" targets={targets} profile={profile} />
                    </HelpPopover>
                  </div>
                  <div>{targets.target_macros_g_day.protein_g}</div>
                  <div>
                    Жиры, г/сут
                    <HelpPopover title="Расчёт жиров">
                      <TargetHelp type="fat" targets={targets} profile={profile} />
                    </HelpPopover>
                  </div>
                  <div>{targets.target_macros_g_day.fat_g}</div>
                  <div>
                    Углеводы, г/сут
                    <HelpPopover title="Расчёт углеводов">
                      <TargetHelp type="carb" targets={targets} profile={profile} />
                    </HelpPopover>
                  </div>
                  <div>{targets.target_macros_g_day.carb_g}</div>
                </>
              )}

              {targets.target_minerals_day && (
                <>
                  <div>
                    Натрий, мг/сут
                    <HelpPopover title="Откуда взят натрий">
                      <TargetHelp type="sodium" targets={targets} profile={profile} />
                    </HelpPopover>
                  </div>
                  <div>{targets.target_minerals_day.na_mg ?? "—"}</div>
                </>
              )}

              {targets.target_fat_acids_day && (
                <>
                  <div>
                    НЖК, г/сут
                    <HelpPopover title="Расчёт НЖК">
                      <TargetHelp type="nlc" targets={targets} profile={profile} />
                    </HelpPopover>
                  </div>
                  <div>{targets.target_fat_acids_day.nlc_g ?? "—"}</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
