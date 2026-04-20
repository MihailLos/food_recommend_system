from typing import Dict, Optional

from catalog.models import (
    ConsumerGoal,
    ConsumerProfile,
    MacronutrientsNormsMR,
    VitaminsNormsMR,
    MineralsNormsMR,
)
from catalog.utils.energy_calc import calculate_tdee_for_profile

ADULT_SODIUM_NORM_MG_DAY = 1300.0


def _find_macro_norm_row(profile: ConsumerProfile) -> MacronutrientsNormsMR:
    age = int(profile.age_years)

    row = (
        MacronutrientsNormsMR.objects
        .filter(
            sex=profile.sex,
            work_group=profile.work_group,
            age_min__lte=age,
        )
        .filter(age_max__isnull=True) | MacronutrientsNormsMR.objects.none()
    )

    # Надёжнее без union:
    qs = MacronutrientsNormsMR.objects.filter(
        sex=profile.sex,
        work_group=profile.work_group,
        age_min__lte=age,
    ).order_by("age_min")

    matched = None
    for r in qs:
        if r.age_max is None or age <= int(r.age_max):
            matched = r
            break

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


def compute_targets_for_profile(profile: ConsumerProfile) -> Dict:
    res = calculate_tdee_for_profile(profile)
    tdee_kcal_day = float(res.tdee_kcal_day)

    goal = (
        ConsumerGoal.objects.filter(profile_id=profile.id, is_active=True)
        .order_by("-id")
        .first()
    )

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

        "target_fat_acids_day": {
            "nlc_g": round(target_energy_kcal_day * 0.10 / 9.0, 2),
        },

        "target_vitamins_day": vitamin_norms,
        "target_minerals_day": {
            **mineral_norms,
            "na_mg": float(
                mineral_norms.get("Na")
                or mineral_norms.get("Натрий")
                or ADULT_SODIUM_NORM_MG_DAY
            ),
        },

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

    return payload
