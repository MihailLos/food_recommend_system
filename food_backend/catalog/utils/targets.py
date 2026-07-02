from typing import Dict, Optional

from catalog.models import (
    ConsumerGoal,
    ConsumerProfile,
    FatAcidsNormsMR,
    MacronutrientsNormsMR,
    MineralsNormsMR,
    GoalNutrientPreference,
    GoalNutrientTarget,
    OtherNutrientsNormsMR,
    VitaminsNormsMR,
)
from catalog.utils.energy_calc import calculate_tdee_for_profile

ADULT_SODIUM_NORM_MG_DAY = 1300.0
ADULT_CHOLESTEROL_NORM_MG_DAY = 300.0
DEFAULT_WATER_G_DAY = 2000.0
DEFAULT_GUIDANCE_TITLE = "Пищевые ориентиры"

DEFAULT_COVERAGE_CODES = [
    "protein_g",
    "dietary_fiber_g",
    "ca_mg",
    "k_mg",
    "mg_mg",
    "p_mg",
    "fe_mg",
    "a_mg",
    "b1_mg",
    "b2_mg",
    "pp_mg",
    "c_mg",
    "beta_carotene_mg",
    "tocopherol_index",
    "niacin_index",
    "retinol_index",
    "pufa_g",
]

DEFAULT_LIMIT_CODES = [
    "na_mg",
    "nlc_g",
    "mds_g",
    "cholesterol_g",
    "alcohol_pct",
]

TARGET_FIELD_ALIASES = {
    "energy_kcal": ("target_energy_kcal_day",),
    "protein_g": ("target_macros_g_day", "protein_g"),
    "fats_g": ("target_macros_g_day", "fat_g"),
    "carbs_g": ("target_macros_g_day", "carb_g"),
    "dietary_fiber_g": ("target_fiber_g_day", "min"),
    "water_g": ("target_water_g_day", "min"),
    "mds_g": ("target_mds_g_day", "min"),
    "organic_acids_g": ("target_other_nutrients_day", "organic_acids_g"),
    "nlc_g": ("target_fat_acids_day", "nlc_g"),
    "pufa_g": ("target_fat_acids_day", "pufa_g"),
    "cholesterol_g": ("target_cholesterol_mg_day",),
    "a_mg": ("target_vitamins_day", "A_Vitamin (mg)"),
    "beta_carotene_mg": ("target_vitamins_day", "Beta_Carotene (mg)"),
    "b1_mg": ("target_vitamins_day", "B1_Vitamin (mg)"),
    "b2_mg": ("target_vitamins_day", "B2_Vitamin (mg)"),
    "pp_mg": ("target_vitamins_day", "PP_Vitamin (mg)"),
    "c_mg": ("target_vitamins_day", "C_Vitamin (mg)"),
    "retinol_index": ("target_vitamins_day", "Retinol_Index"),
    "tocopherol_index": ("target_vitamins_day", "Tocopherol_Index"),
    "niacin_index": ("target_vitamins_day", "Niacin_Index"),
    "na_mg": ("target_minerals_day", "na_mg"),
    "k_mg": ("target_minerals_day", "K (mg)"),
    "ca_mg": ("target_minerals_day", "Ca (mg)"),
    "mg_mg": ("target_minerals_day", "Mg (mg)"),
    "p_mg": ("target_minerals_day", "P (mg)"),
    "fe_mg": ("target_minerals_day", "Fe (mg)"),
    "alcohol_pct": ("target_limit_only_day", "alcohol_pct"),
}


def ensure_active_goal(profile: ConsumerProfile) -> ConsumerGoal:
    goal = (
        ConsumerGoal.objects.filter(profile_id=profile.id, is_active=True)
        .order_by("-id")
        .first()
    )
    if goal is not None:
        return goal

    goal = ConsumerGoal.objects.create(
        profile=profile,
        title=DEFAULT_GUIDANCE_TITLE,
        goal_type=ConsumerGoal.GOAL_MAINTAIN,
        energy_delta_kcal=0,
        preferences_replace_base=False,
        is_active=True,
    )
    return goal


def _set_payload_value(payload: Dict, path: tuple[str, ...], value: float) -> None:
    if len(path) == 1:
        payload[path[0]] = round(float(value), 2)
        return

    container = payload.setdefault(path[0], {})
    container[path[1]] = round(float(value), 2)


def _apply_target_overrides(payload: Dict, goal: Optional[ConsumerGoal]) -> Dict[str, float]:
    if goal is None:
        return {}

    overrides = {
        row.nutrient_code_id: float(row.target_value)
        for row in GoalNutrientTarget.objects.filter(goal_id=goal.id)
    }

    for code, value in overrides.items():
        path = TARGET_FIELD_ALIASES.get(code)
        if path:
            _set_payload_value(payload, path, value)

    return overrides


def _load_guidance_lists(goal: Optional[ConsumerGoal]) -> Dict[str, list[str]]:
    if goal is None:
        return {
            "coverage_codes": list(DEFAULT_COVERAGE_CODES),
            "limit_codes": list(DEFAULT_LIMIT_CODES),
        }

    rows = list(GoalNutrientPreference.objects.filter(goal_id=goal.id).order_by("id"))
    if not rows or not goal.preferences_replace_base:
        return {
            "coverage_codes": list(DEFAULT_COVERAGE_CODES),
            "limit_codes": list(DEFAULT_LIMIT_CODES),
        }

    coverage_codes = [row.nutrient_code_id for row in rows if row.direction == "more"]
    limit_codes = [row.nutrient_code_id for row in rows if row.direction == "less"]
    return {
        "coverage_codes": coverage_codes,
        "limit_codes": limit_codes,
    }


def _find_macro_norm_row(profile: ConsumerProfile) -> MacronutrientsNormsMR:
    age = int(profile.age_years)
    qs = MacronutrientsNormsMR.objects.filter(
        sex=profile.sex,
        work_group=profile.work_group,
    ).order_by("age_min")

    matched = None
    for r in qs:
        age_max = None if r.age_max is None else int(r.age_max)
        if age < int(r.age_min):
            continue
        if age_max is None or age <= age_max:
            matched = r
            break

    if matched is None:
        # Для возрастов старше верхней границы таблицы берём последнюю доступную строку
        # той же группы труда и пола, чтобы расчёт не падал на пограничных профилях.
        matched = qs.order_by("-age_min").first()

    if matched is None:
        raise ValueError(
            f"No MacronutrientsNormsMR row for sex={profile.sex}, "
            f"work_group={profile.work_group_id}, age={age}"
        )

    return matched


def _load_vitamin_norms(sex: str) -> Dict[str, float]:
    rows = VitaminsNormsMR.objects.filter(sex=sex)
    return {str(r.name): float(r.norm) for r in rows}


def _load_mineral_norms(sex: str) -> Dict[str, float]:
    rows = MineralsNormsMR.objects.filter(sex=sex)
    return {str(r.name): float(r.norm) for r in rows}


def _load_other_nutrient_norms() -> Dict[str, float]:
    row = OtherNutrientsNormsMR.objects.order_by("id").first()
    if row is None:
        return {}
    return {
        "organic_acids_g": float(row.organic_acids_g)
        if row.organic_acids_g not in (None, "")
        else 0.0,
    }


def _load_fat_acid_norms() -> Dict[str, float]:
    row = FatAcidsNormsMR.objects.order_by("id").first()
    if row is None:
        return {}
    return {
        "nlc_g_ev": float(row.nlc_g_ev) if row.nlc_g_ev not in (None, "") else 0.0,
        "pufa_g_ev": float(row.pufa_g_ev) if row.pufa_g_ev not in (None, "") else 0.0,
        "cholesterol_mg": float(row.cholesterol_mg)
        if row.cholesterol_mg not in (None, "")
        else ADULT_CHOLESTEROL_NORM_MG_DAY,
    }


def compute_targets_for_profile(profile: ConsumerProfile) -> Dict:
    res = calculate_tdee_for_profile(profile)
    tdee_kcal_day = float(res.tdee_kcal_day)

    goal = ensure_active_goal(profile)

    macro_row = _find_macro_norm_row(profile)

    mr_energy_kcal_day = float(macro_row.energy_kcal)
    mr_protein_g_day = float(macro_row.protein_g)
    mr_fat_g_day = float(macro_row.fats_g)
    mr_carb_g_day = float(macro_row.carbs_g)
    mr_protein_pct = (mr_protein_g_day * 4.0 / mr_energy_kcal_day * 100.0) if mr_energy_kcal_day > 0 else 0.0
    mr_fat_pct = (mr_fat_g_day * 9.0 / mr_energy_kcal_day * 100.0) if mr_energy_kcal_day > 0 else 0.0
    mr_carb_pct = (mr_carb_g_day * 4.0 / mr_energy_kcal_day * 100.0) if mr_energy_kcal_day > 0 else 0.0

    energy_delta_kcal = (
        float(goal.energy_delta_kcal)
        if goal and goal.energy_delta_kcal is not None
        else 0.0
    )

    manual = bool(
        goal
        and goal.protein_pct is not None
        and goal.fat_pct is not None
        and goal.carb_pct is not None
    )

    target_energy_pre_limit_kcal_day = tdee_kcal_day + energy_delta_kcal
    target_energy_kcal_day = target_energy_pre_limit_kcal_day
    target_energy_kcal_day = max(target_energy_kcal_day, 0.0)

    if manual:
        protein_pct = float(goal.protein_pct)
        fat_pct = float(goal.fat_pct)
        carb_pct = float(goal.carb_pct)

        target_protein_g_day = round(target_energy_kcal_day * protein_pct / 100.0 / 4.0, 2)
        target_fat_g_day = round(target_energy_kcal_day * fat_pct / 100.0 / 9.0, 2)
        target_carb_g_day = round(target_energy_kcal_day * carb_pct / 100.0 / 4.0, 2)

        macros_mode = "manual"
    else:
        protein_pct = mr_protein_pct
        fat_pct = mr_fat_pct
        carb_pct = mr_carb_pct

        target_protein_g_day = round(target_energy_kcal_day * protein_pct / 100.0 / 4.0, 2)
        target_fat_g_day = round(target_energy_kcal_day * fat_pct / 100.0 / 9.0, 2)
        target_carb_g_day = round(target_energy_kcal_day * carb_pct / 100.0 / 4.0, 2)

        macros_mode = "mr_table"

    vitamin_norms = _load_vitamin_norms(profile.sex)
    mineral_norms = _load_mineral_norms(profile.sex)
    other_nutrient_norms = _load_other_nutrient_norms()
    fat_acid_norms = _load_fat_acid_norms()

    water_min_g_day = float(macro_row.water_min_g) if macro_row.water_min_g not in (None, "") else DEFAULT_WATER_G_DAY
    water_max_g_day = float(macro_row.water_max_g) if macro_row.water_max_g not in (None, "") else water_min_g_day
    mds_min_pct_ev = float(macro_row.mds_min_g_ev) if macro_row.mds_min_g_ev not in (None, "") else 0.0
    mds_max_pct_ev = float(macro_row.mds_max_g_ev) if macro_row.mds_max_g_ev not in (None, "") else mds_min_pct_ev
    target_mds_g_day = round(target_energy_kcal_day * (mds_min_pct_ev / 100.0) / 4.0, 2) if target_energy_kcal_day > 0 else 0.0
    target_nlc_g_day = round(target_energy_kcal_day * (fat_acid_norms.get("nlc_g_ev", 0.0) / 100.0) / 9.0, 2) if target_energy_kcal_day > 0 else 0.0
    target_pufa_g_day = round(target_energy_kcal_day * (fat_acid_norms.get("pufa_g_ev", 0.0) / 100.0) / 9.0, 2) if target_energy_kcal_day > 0 else 0.0

    payload = {
        "profile_id": profile.id,

        "goal_id": goal.id if goal else None,
        "goal_type": goal.goal_type if goal else None,
        "energy_delta_kcal": energy_delta_kcal,
        "energy_calc": {
            "bmr_kcal_day": round(float(res.bmr_kcal_day), 2),
            "kfa": round(float(res.kfa), 2),
            "tdee_kcal_day": round(float(res.tdee_kcal_day), 2),
        },

        "mr_norms": {
            "energy_kcal_day": round(mr_energy_kcal_day, 2),
            "protein_g_day": round(mr_protein_g_day, 2),
            "fat_g_day": round(mr_fat_g_day, 2),
            "carb_g_day": round(mr_carb_g_day, 2),
            "dietary_fibers_min_g_day": float(macro_row.dietary_fibers_min_g),
            "dietary_fibers_max_g_day": float(macro_row.dietary_fibers_max_g),
            "water_min_g_day": water_min_g_day,
            "water_max_g_day": water_max_g_day,
            "mds_min_g_pct_ev_day": mds_min_pct_ev,
            "mds_max_g_pct_ev_day": mds_max_pct_ev,
            "protein_pct": round(mr_protein_pct, 2),
            "fat_pct": round(mr_fat_pct, 2),
            "carb_pct": round(mr_carb_pct, 2),
        },

        "target_energy_kcal_day": round(target_energy_kcal_day, 2),
        "target_energy_base_kcal_day": round(target_energy_pre_limit_kcal_day, 2),
        "macros_mode": macros_mode,

        "macros_pct": {
            "protein_pct": round(protein_pct, 2),
            "fat_pct": round(fat_pct, 2),
            "carb_pct": round(carb_pct, 2),
        },

        "target_macros_g_day": {
            "protein_g": round(target_protein_g_day, 2),
            "fat_g": round(target_fat_g_day, 2),
            "carb_g": round(target_carb_g_day, 2),
        },

        "target_fiber_g_day": {
            "min": float(macro_row.dietary_fibers_min_g),
            "max": float(macro_row.dietary_fibers_max_g),
        },

        "target_water_g_day": {
            "min": round(water_min_g_day, 2),
            "max": round(water_max_g_day, 2),
        },

        "target_mds_g_day": {
            "min": round(target_mds_g_day, 2),
            "max": round(target_energy_kcal_day * (mds_max_pct_ev / 100.0) / 4.0, 2) if target_energy_kcal_day > 0 else 0.0,
            "min_pct_ev": round(mds_min_pct_ev, 2),
            "max_pct_ev": round(mds_max_pct_ev, 2),
        },

        "target_fat_acids_day": {
            "nlc_g": target_nlc_g_day,
            "pufa_g": target_pufa_g_day,
        },

        "target_cholesterol_mg_day": round(
            fat_acid_norms.get("cholesterol_mg", ADULT_CHOLESTEROL_NORM_MG_DAY), 2
        ),

        "target_vitamins_day": vitamin_norms,
        "target_minerals_day": {
            **mineral_norms,
            "na_mg": float(
                mineral_norms.get("Na")
                or mineral_norms.get("Натрий")
                or ADULT_SODIUM_NORM_MG_DAY
            ),
        },
        "target_other_nutrients_day": other_nutrient_norms,

        "debug": {
            "work_group_id": profile.work_group_id,
            "sex": profile.sex,
            "age_years": int(profile.age_years),
            "macro_norm_row_id": macro_row.id,
            "target_energy_source": "tdee_plus_goal_delta",
        },
    }

    recommended = None
    if goal and goal.goal_type == "lose_weight":
        recommended = {"min": -700, "max": -500}
    payload["recommended_energy_delta_kcal"] = recommended

    overrides = _apply_target_overrides(payload, goal)
    payload["guidance_lists"] = _load_guidance_lists(goal)
    payload["manual_target_overrides"] = overrides
    payload["guidance_meta"] = {
        "title": goal.title or DEFAULT_GUIDANCE_TITLE,
        "goal_id": goal.id,
        "auto_save": True,
    }

    return payload
