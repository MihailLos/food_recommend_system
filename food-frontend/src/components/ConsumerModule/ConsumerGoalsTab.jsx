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
  boxSizing: "border-box",
};
const requiredInput = {
  borderColor: "#f0b24b",
  background: "#fffaf0",
};

const row = {
  display: "grid",
  gap: 12,
  alignItems: "center",
  marginBottom: 10,
};

const goalTypeLabels = {
  lose_weight: "Снижение массы",
  gain_muscle: "Увеличение энергетической обеспеченности",
  maintain: "Поддержание массы",
};

const dragItemStyles = {
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "#fff",
  cursor: "grab",
  fontSize: 13,
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
        <div style={{ marginTop: 6 }}>
          Важно: это не просто копия строк МР. Для БЖУ система берёт пропорции из МР и пересчитывает их
          под персональную целевую энергию пользователя.
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
        <div style={{ marginTop: 6 }}>
          Если цель питания задаёт дефицит или профицит энергии, он уже учтён в этом значении.
        </div>
      </>
    );
  }

  if (type === "macrosMode") {
    return (
      <>
        <div>
          Если режим ручной, проценты БЖУ взяты из формы цели. Если режим по нормативам МР,
          проценты рассчитаны из строки нормативной таблицы и затем применены к персональной целевой энергии.
        </div>
        <div style={{ marginTop: 6 }}>
          На строку МР повлияли: пол {profile?.sex === "female" ? "женский" : "мужской"},
          возраст {profile?.age_years ?? debug.age_years} лет, группа труда {debug.work_group_id ?? "—"}.
        </div>
        <div style={{ marginTop: 6 }}>
          Поэтому граммы БЖУ ниже могут отличаться от граммов в таблице МР: МР даёт структуру рациона,
          а финальные граммы пересчитаны под текущую цель.
        </div>
      </>
    );
  }

  if (type === "macrosPct") {
    return (
      <>
        <div>Проценты показывают, какая доля целевой энергии приходится на белки, жиры и углеводы.</div>
        {targets?.macros_mode === "mr_table" && (
          <>
            <div style={{ marginTop: 6 }}>
              В МР для текущего профиля найдена строка: энергия {mr.energy_kcal_day} ккал,
              белок {mr.protein_g_day} г, жиры {mr.fat_g_day} г, углеводы {mr.carb_g_day} г.
            </div>
            <div style={{ marginTop: 6 }}>
              Проценты получаются так: белок = г × 4 / энергия × 100,
              жиры = г × 9 / энергия × 100, углеводы = г × 4 / энергия × 100.
            </div>
            <div style={{ marginTop: 6 }}>
              Для текущей строки: Б {pct.protein_pct}% / Ж {pct.fat_pct}% / У {pct.carb_pct}%.
            </div>
          </>
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
    return (
      <>
        <div>Белок считается от персональной целевой энергии, а не берётся готовым числом из МР.</div>
        <div style={{ marginTop: 6 }}>
          Белок = {energy} × {pct.protein_pct}% / 4 = {targets?.target_macros_g_day?.protein_g} г/сут.
        </div>
        <div style={{ marginTop: 6 }}>4 ккал/г — энергетическая ценность белка.</div>
      </>
    );
  }

  if (type === "fat") {
    return (
      <>
        <div>Жиры считаются от персональной целевой энергии по выбранной доле БЖУ.</div>
        <div style={{ marginTop: 6 }}>
          Жиры = {energy} × {pct.fat_pct}% / 9 = {targets?.target_macros_g_day?.fat_g} г/сут.
        </div>
        <div style={{ marginTop: 6 }}>9 ккал/г — энергетическая ценность жира.</div>
      </>
    );
  }

  if (type === "carb") {
    return (
      <>
        <div>Углеводы считаются от персональной целевой энергии по выбранной доле БЖУ.</div>
        <div style={{ marginTop: 6 }}>
          Углеводы = {energy} × {pct.carb_pct}% / 4 = {targets?.target_macros_g_day?.carb_g} г/сут.
        </div>
        <div style={{ marginTop: 6 }}>4 ккал/г — энергетическая ценность углеводов.</div>
      </>
    );
  }

  if (type === "sodium") {
    return (
      <>
        <div>Натрий берётся из нормативов минералов для пола профиля.</div>
        <div style={{ marginTop: 6 }}>
          Если норматив в базе не найден, используется fallback 1300 мг/сут.
        </div>
        <div style={{ marginTop: 6 }}>
          В рекомендациях натрий используется как ограничиваемый показатель: чем выше доля натрия в 100 г продукта
          относительно суточного ориентира, тем выше солевая нагрузка.
        </div>
      </>
    );
  }

  if (type === "nlc") {
    return (
      <>
        <div>
          НЖК — насыщенные жирные кислоты. Это не цель «съесть столько», а верхний ориентир:
          желательно не превышать это значение.
        </div>
        <div style={{ marginTop: 6 }}>
          10% взято из МР 2.3.1.0253-21: потребление насыщенных жирных кислот должно быть
          не более 10% калорийности суточного рациона.
        </div>
        <div style={{ marginTop: 6 }}>
          НЖК = {energy} × 10% / 9 = {targets?.target_fat_acids_day?.nlc_g} г/сут.
        </div>
        <div style={{ marginTop: 6 }}>9 ккал/г — энергетическая ценность жиров.</div>
      </>
    );
  }

  return null;
}

function GoalChoiceHelp({ bmi }) {
  const value = Number(bmi);
  const currentRecommendation =
    !Number.isFinite(value)
      ? "Сначала заполните профиль, чтобы система могла рассчитать ИМТ."
      : value < 18.5
        ? "Для текущего ИМТ рекомендуется «Увеличение энергетической обеспеченности»."
        : value < 25
          ? "Для текущего ИМТ рекомендуется «Поддержание массы»."
          : "Для текущего ИМТ рекомендуется «Снижение массы».";
  return (
    <>
      <div>{currentRecommendation}</div>
      <div style={{ marginTop: 6 }}>Текущее значение ИМТ: {Number.isFinite(value) ? value.toFixed(2) : "—"}.</div>
      <div>Выбор цели питания рекомендуется соотносить с текущим ИМТ профиля.</div>
      <div style={{ marginTop: 6 }}>ИМТ &lt; 18.5: рекомендуется «Увеличение энергетической обеспеченности».</div>
      <div style={{ marginTop: 6 }}>ИМТ 18.5–24.9: рекомендуется «Поддержание массы».</div>
      <div style={{ marginTop: 6 }}>ИМТ ≥ 25: рекомендуется «Снижение массы».</div>
      <div style={{ marginTop: 6 }}>Это ориентир для выбора. Итоговую цель пользователь задаёт вручную.</div>
    </>
  );
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
  const [profileMode, setProfileMode] = useState("base");
  const [energyDirection, setEnergyDirection] = useState("-");
  const [dragTarget, setDragTarget] = useState("");

  // false = auto by backend (MR), true = user enters %
  const [manualMacros, setManualMacros] = useState(false);

  const [form, setForm] = useState({
    title: "",
    goal_type: "maintain",
    energy_delta_kcal: "",
    protein_pct: "",
    fat_pct: "",
    carb_pct: "",
    preferences_replace_base: false,
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
      energy_delta_kcal: Math.abs(selectedGoal.energy_delta_kcal ?? 0) || "",
      protein_pct: selectedGoal.protein_pct ?? "",
      fat_pct: selectedGoal.fat_pct ?? "",
      carb_pct: selectedGoal.carb_pct ?? "",
      preferences_replace_base: Boolean(selectedGoal.preferences_replace_base),
    });
    setProfileMode(Boolean(selectedGoal.preferences_replace_base) ? "custom_only" : "base");
    setEnergyDirection((selectedGoal.energy_delta_kcal ?? 0) < 0 ? "-" : "+");
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
          const replaceBase = Boolean(selectedGoal?.preferences_replace_base);
          setPrefs(
            (p || []).map((x) => ({
              nutrient_code: x.nutrient_code,
              direction: x.direction,
            }))
          );
          setProfileMode(replaceBase ? "custom_only" : ((p || []).length > 0 ? "base_plus_custom" : "base"));
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
    const rawDelta = numOrNull(form.energy_delta_kcal);
    const absDelta = rawDelta == null ? null : Math.abs(rawDelta);
    let signedDelta = absDelta;

    if (absDelta != null) {
      if (form.goal_type === "lose_weight") signedDelta = -absDelta;
      else if (form.goal_type === "gain_muscle") signedDelta = absDelta;
      else signedDelta = energyDirection === "-" ? -absDelta : absDelta;
    }

    const payload = {
      profile_id: profileId,
      title: form.title || null,
      goal_type: form.goal_type,
      energy_delta_kcal: signedDelta,
      preferences_replace_base: profileMode === "custom_only",
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

  const validateRequiredFields = () => {
    if (!form.goal_type) {
      setError("Выберите цель питания.");
      return false;
    }

    if (form.energy_delta_kcal === "" || !Number.isFinite(Number(form.energy_delta_kcal)) || Number(form.energy_delta_kcal) < 0) {
      setError("Введите корректное изменение целевой энергии.");
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
      if (!validateRequiredFields()) return;
      if (!validateManualMacros()) return;

      const payload = normalizePayload();
      let savedGoal = null;

      if (selectedGoalId) {
        const updated = await updateGoal(selectedGoalId, payload);
        savedGoal = updated;
        setGoals((prev) => prev.map((g) => (g.id === selectedGoalId ? updated : g)));
      } else {
        const created = await createGoal(payload);
        savedGoal = created;
        setGoals((prev) => [created, ...prev]);
        setSelectedGoalId(created.id);
      }

      if (savedGoal?.id) {
        const prefPayload = profileMode === "base" ? [] : prefs;
        await replaceGoalPreferences(savedGoal.id, prefPayload);
      }

      await refreshTargets();
      await loadAll();
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
    setProfileMode("base");
    setEnergyDirection("-");
    setPrefs([]);
    setForm({
      title: "",
      goal_type: "maintain",
      energy_delta_kcal: "",
      protein_pct: "",
      fat_pct: "",
      carb_pct: "",
      preferences_replace_base: false,
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

  const savePrefs = async () => {
    if (!selectedGoalId) {
      setError("Сначала выберите или создайте цель.");
      return;
    }

    setPrefsSaving(true);
    setError("");
    try {
      await updateGoal(selectedGoalId, normalizePayload());
      const updated = await replaceGoalPreferences(selectedGoalId, profileMode === "base" ? [] : prefs);
      // backend возвращает список — синхронизируемся с ним
      const p = normalizeList(updated);
      setPrefs(
        (p || []).map((x) => ({
          nutrient_code: x.nutrient_code,
          direction: x.direction,
        }))
      );
      await loadAll();
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

  const nutrientMeta = (code) => nutrients.find((x) => x.code === code) || null;

  const handleProfileModeChange = (nextMode) => {
    setProfileMode(nextMode);
    if (nextMode === "base") {
      setPrefs([]);
    }
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

  const macrosModeLabel =
  targets?.macros_mode === "manual"
    ? "ручной"
    : targets?.macros_mode === "mr_table"
      ? "по нормативам МР"
      : targets?.macros_mode || "—";
  const bmiValue = Number(profile?.bmi);
  const isObesityProfile = Number.isFinite(bmiValue) && bmiValue >= 30;
  const energyRange = form.goal_type === "lose_weight" && isObesityProfile ? { min: 500, max: 700 } : { min: 250, max: 500 };
  const selectedGoalTitle = selectedGoal
    ? `${selectedGoal.title || goalTypeLabels[selectedGoal.goal_type] || selectedGoal.goal_type}${selectedGoal.energy_delta_kcal ? `, ${selectedGoal.energy_delta_kcal > 0 ? "+" : ""}${selectedGoal.energy_delta_kcal} ккал/сут` : ""}`
    : "Новая цель";

  const basePreferredCodes = [
    "protein_g",
    "dietary_fiber_g",
    "pufa_g",
    "a_mg",
    "beta_carotene_mg",
    "b1_mg",
    "b2_mg",
    "c_mg",
    "niacin_index",
    "ca_mg",
    "fe_mg",
    "k_mg",
    "mg_mg",
    "p_mg",
  ];
  const baseRestrictedCodes = [
    "nlc_g",
    "mds_g",
    "na_mg",
    "cholesterol_g",
  ];
  const energyModeText =
    form.goal_type === "lose_weight"
      ? "Энергетическая ценность дополнительно относится к ограничиваемым."
      : form.goal_type === "gain_muscle"
        ? "Энергетическая ценность дополнительно относится к предпочтительным."
        : "Энергетическая ценность остаётся контрольным показателем и в базовые списки не включается.";

  const availableNutrients = useMemo(
    () => [...nutrients].sort((a, b) => String(a.ru_name || "").localeCompare(String(b.ru_name || ""), "ru")),
    [nutrients]
  );

  const customPreferredCodes = useMemo(
    () => prefs.filter((p) => p.direction === "more").map((p) => p.nutrient_code),
    [prefs]
  );
  const customRestrictedCodes = useMemo(
    () => prefs.filter((p) => p.direction === "less").map((p) => p.nutrient_code),
    [prefs]
  );

  const visiblePreferredCodes =
    profileMode === "custom_only"
      ? customPreferredCodes
      : Array.from(new Set([...basePreferredCodes, ...customPreferredCodes]));
  const visibleRestrictedCodes =
    profileMode === "custom_only"
      ? customRestrictedCodes
      : Array.from(new Set([...baseRestrictedCodes, ...customRestrictedCodes]));

  const poolCodes = useMemo(() => {
    const assigned = new Set([...visiblePreferredCodes, ...visibleRestrictedCodes]);
    return availableNutrients.map((item) => item.code).filter((code) => !assigned.has(code));
  }, [availableNutrients, visiblePreferredCodes, visibleRestrictedCodes]);

  if (!profileId) {
    return <div style={{ ...box, padding: 16 }}>Сначала выберите профиль.</div>;
  }

  if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;

  const handleDragStart = (event, code) => {
    event.dataTransfer.setData("text/plain", code);
  };

  const setCodeDirection = (code, direction) => {
    setPrefs((prev) => {
      const existing = prev.find((item) => item.nutrient_code === code);
      if (existing) {
        return prev.map((item) =>
          item.nutrient_code === code ? { ...item, direction } : item
        );
      }
      return [...prev, { nutrient_code: code, direction }];
    });
  };

  const removeCodeFromCustom = (code) => {
    setPrefs((prev) => prev.filter((item) => item.nutrient_code !== code));
  };

  const renderNutrientCard = (code) => {
    const meta = nutrientMeta(code);
    const isCustom = prefs.some((item) => item.nutrient_code === code);
    return (
      <div
        key={code}
        draggable={profileMode !== "base"}
        onDragStart={(event) => handleDragStart(event, code)}
        style={{
          ...dragItemStyles,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontWeight: 600 }}>{meta?.ru_name || code}</div>
          <div style={{ fontSize: 11, color: "#666" }}>{meta?.unit || "-"}</div>
        </div>
        {profileMode !== "base" && (profileMode === "custom_only" || isCustom) && (
          <button
            type="button"
            style={{ ...btn, padding: "4px 8px", fontSize: 12 }}
            onClick={() => removeCodeFromCustom(code)}
          >
            Убрать
          </button>
        )}
      </div>
    );
  };

  const renderDropList = (title, codes, direction) => (
    <div
      onDragEnter={(event) => {
        if (profileMode !== "base") {
          event.preventDefault();
          setDragTarget(direction);
        }
      }}
      onDragOver={(event) => {
        if (profileMode !== "base") {
          event.preventDefault();
          setDragTarget(direction);
        }
      }}
      onDragLeave={() => setDragTarget((current) => (current === direction ? "" : current))}
      onDrop={(event) => {
        if (profileMode === "base") return;
        event.preventDefault();
        const code = event.dataTransfer.getData("text/plain");
        if (code) setCodeDirection(code, direction);
        setDragTarget("");
      }}
      style={{
        minHeight: 160,
        border: "1px dashed #c8d0d8",
        borderRadius: 10,
        padding: 10,
        background:
          dragTarget === direction
            ? direction === "more"
              ? "rgba(46,125,50,0.10)"
              : "rgba(229,57,53,0.10)"
            : "#fafafa",
        display: "grid",
        alignContent: "start",
        gap: 8,
        transition: "background 120ms ease",
      }}
    >
      <div style={{ fontWeight: 700 }}>{title}</div>
      {codes.length === 0 ? (
        <div style={{ fontSize: 12, color: "#666" }}>
          Перетащите сюда нутриенты из общего списка.
        </div>
      ) : (
        codes.map(renderNutrientCard)
      )}
    </div>
  );

  return (
    <div className="app-two-col">
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
          <div className="app-header-actions">
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
          <div style={row} className="app-form-row">
            <label>Название (опц.)</label>
            <input
              style={input}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div style={row} className="app-form-row">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>Цель <span style={{ color: "#c62828" }}>*</span></span>
              <HelpPopover title="Рекомендация по выбору цели">
                <GoalChoiceHelp bmi={bmiValue} />
              </HelpPopover>
            </div>
            <select
              style={{ ...input, ...requiredInput }}
              value={form.goal_type}
              onChange={(e) => setForm({ ...form, goal_type: e.target.value })}
            >
              <option value="lose_weight">Снижение массы</option>
              <option value="gain_muscle">Увеличение энергетической обеспеченности</option>
              <option value="maintain">Поддержание массы</option>
            </select>
          </div>

          <div style={row} className="app-form-row">
            <label>Изменение целевой энергии, ккал/сут <span style={{ color: "#c62828" }}>*</span></label>
            <div style={{ display: "grid", gap: 8 }}>
              {form.goal_type === "maintain" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "#555" }}>Направление:</span>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="radio"
                      checked={energyDirection === "-"}
                      onChange={() => setEnergyDirection("-")}
                    />
                    Уменьшение
                  </label>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="radio"
                      checked={energyDirection === "+"}
                      onChange={() => setEnergyDirection("+")}
                    />
                    Увеличение
                  </label>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "88px minmax(0, 1fr)", gap: 8, alignItems: "center" }}>
                <div
                  style={{
                    ...input,
                    ...requiredInput,
                    background: "#fafafa",
                    color: "#555",
                    textAlign: "center",
                    fontWeight: 700,
                  }}
                >
                  {form.goal_type === "lose_weight" ? "−" : form.goal_type === "gain_muscle" ? "+" : energyDirection}
                </div>
                <input
                  style={{ ...input, ...requiredInput }}
                  type="number"
                  min="0"
                  step="10"
                  value={form.energy_delta_kcal}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setForm({
                      ...form,
                      energy_delta_kcal: raw === "" ? "" : Math.max(0, Number(raw)),
                    });
                  }}
                />
              </div>

              {(form.goal_type === "lose_weight" || form.goal_type === "gain_muscle") && (
                <div style={{ display: "grid", gap: 6 }}>
                  <input
                    type="range"
                    min={energyRange.min}
                    max={energyRange.max}
                    step="10"
                    value={form.energy_delta_kcal || energyRange.min}
                    onChange={(e) => setForm({ ...form, energy_delta_kcal: Number(e.target.value) })}
                  />
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Рекомендуемый диапазон: {energyRange.min}–{energyRange.max} ккал/сут.
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Показывает, насколько целевая энергия должна отличаться от базовой нормы для текущего профиля.
          </div>

          {form.goal_type === "lose_weight" && (
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#666", alignSelf: "center" }}>
                {isObesityProfile
                  ? "Для профилей с ИМТ >= 30 используется диапазон 500–700 ккал/сут как типовой дефицит при ожирении."
                  : "При ИМТ ниже 30 дефицит энергии подбирают индивидуально; в интерфейсе задан рабочий диапазон 250–500 ккал/сут."}
              </div>
            </div>
          )}

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

          <div style={row} className="app-form-row">
            <label>Белки, %</label>
            <input
              style={input}
              type="number"
              disabled={!manualMacros}
              value={form.protein_pct}
              onChange={(e) => setForm({ ...form, protein_pct: e.target.value })}
            />
          </div>
          <div style={row} className="app-form-row">
            <label>Жиры, %</label>
            <input
              style={input}
              type="number"
              disabled={!manualMacros}
              value={form.fat_pct}
              onChange={(e) => setForm({ ...form, fat_pct: e.target.value })}
            />
          </div>
          <div style={row} className="app-form-row">
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
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Нутриентный профиль рекомендации</div>

          {!selectedGoalId ? (
            <div style={{ color: "#666", fontSize: 13 }}>
              Сначала сохраните/выберите цель, чтобы редактировать предпочтения.
            </div>
          ) : prefsLoading ? (
            <div style={{ color: "#666", fontSize: 13 }}>Загрузка...</div>
          ) : (
            <>
              <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>Режим работы со списками нутриентов</div>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input
                    type="radio"
                    checked={profileMode === "base"}
                    onChange={() => handleProfileModeChange("base")}
                  />
                  <span>
                    <strong>Оставить базовый профиль как есть.</strong>
                    <div style={{ color: "#666", fontSize: 12 }}>
                      Система использует стандартные списки предпочтительных и ограничиваемых нутриентов для выбранной цели.
                    </div>
                  </span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input
                    type="radio"
                    checked={profileMode === "base_plus_custom"}
                    onChange={() => handleProfileModeChange("base_plus_custom")}
                  />
                  <span>
                    <strong>Дополнить базовый профиль.</strong>
                    <div style={{ color: "#666", fontSize: 12 }}>
                      Базовые списки сохраняются, а ниже можно добавлять или переназначать отдельные нутриенты.
                    </div>
                  </span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input
                    type="radio"
                    checked={profileMode === "custom_only"}
                    onChange={() => handleProfileModeChange("custom_only")}
                  />
                  <span>
                    <strong>Полностью задать профиль вручную.</strong>
                    <div style={{ color: "#666", fontSize: 12 }}>
                      Базовые списки отключаются. В расчёте участвуют только нутриенты, которые вы добавите ниже.
                    </div>
                  </span>
                </label>
              </div>
              <div style={{ fontSize: 12, color: "#8a6d1d", marginBottom: 10 }}>
                Поля, отмеченные <span style={{ color: "#c62828" }}>*</span>, обязательны для расчёта целевых показателей и рекомендаций.
              </div>

              <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: "#fafafa", border: "1px solid #eee" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {profileMode === "custom_only"
                    ? "Ручной профиль нутриентов"
                    : `Базовый набор для цели «${goalTypeLabels[form.goal_type] || form.goal_type}»`}
                </div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>{energyModeText}</div>
                {profileMode === "base" && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {renderDropList("Базовые предпочтительные нутриенты", basePreferredCodes, "more")}
                    {renderDropList("Базовые ограничиваемые нутриенты", baseRestrictedCodes, "less")}
                  </div>
                )}
              </div>

              {profileMode !== "base" && (
                <>
                  <div style={{ color: "#666", fontSize: 12, marginBottom: 10 }}>
                    Перетаскивайте нутриенты в списки «Предпочтительные» и «Ограничиваемые».
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    {renderDropList("Предпочтительные нутриенты", visiblePreferredCodes, "more")}
                    {renderDropList("Ограничиваемые нутриенты", visibleRestrictedCodes, "less")}
                    <div
                      style={{
                        minHeight: 160,
                        border: "1px dashed #c8d0d8",
                        borderRadius: 10,
                        padding: 10,
                        background: "#fff",
                        display: "grid",
                        alignContent: "start",
                        gap: 8,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>Остальные нутриенты</div>
                      {poolCodes.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#666" }}>Все доступные нутриенты уже распределены по спискам.</div>
                      ) : (
                        poolCodes.map((code) => (
                          <div
                            key={`pool-${code}`}
                            draggable
                            onDragStart={(event) => handleDragStart(event, code)}
                            style={dragItemStyles}
                          >
                            {nutrientLabel(code)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </>
              )}

              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button
                  type="button"
                  style={{ ...btn, borderColor: "#2e7d32" }}
                  onClick={savePrefs}
                  disabled={prefsSaving}
                >
                  {prefsSaving ? "Сохранение..." : "Сохранить нутриентный профиль"}
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
