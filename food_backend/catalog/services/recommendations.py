from statistics import median
from typing import Any, Dict, List, Optional, Tuple

from django.shortcuts import get_object_or_404

from catalog.models import (
    ConsumerGoal,
    ConsumerProfile,
    FoodProducts,
    GoalNutrientPreference,
    NutrientDictionary,
)
from catalog.utils.allergens import get_allergens_for_product
from catalog.utils.child_rules import pick_not_child_rule
from catalog.utils.targets import compute_targets_for_profile

ADULT_SODIUM_NORM_MG_DAY = 1300.0
ADULT_CHOLESTEROL_NORM_MG_DAY = 300.0
SALT_EQUIVALENT_FACTOR = 2.5

GROUP_ALIASES = {
    "fatacids": "fat_acids",
    "other": "other_nutrients",
}

BASE_PREFERRED_CODES = {
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
}

BASE_RESTRICTED_CODES = {
    "nlc_g",
    "mds_g",
    "na_mg",
    "cholesterol_g",
}

COMPARISON_MODE_SUBGROUP = "subgroup"
COMPARISON_MODE_GLOBAL = "global"
COMPARISON_MODE_CHOICES = {COMPARISON_MODE_SUBGROUP, COMPARISON_MODE_GLOBAL}

GOAL_RULE_SIGNAL_WEIGHT = 2

GOAL_NUTRIENT_PROFILES = {
    ConsumerGoal.GOAL_LOSE_WEIGHT: {
        "preferred": {
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
        },
        "restricted": {
            "energy_kcal",
            "nlc_g",
            "cholesterol_g",
            "na_mg",
            "alcohol_pct",
        },
    },
    ConsumerGoal.GOAL_MAINTAIN: {
        "preferred": {
            "protein_g",
            "fats_g",
            "carbs_g",
            "dietary_fiber_g",
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
        },
        "restricted": {
            "nlc_g",
            "mds_g",
            "na_mg",
            "alcohol_pct",
        },
    },
    ConsumerGoal.GOAL_GAIN_MUSCLE: {
        "preferred": {
            "energy_kcal",
            "protein_g",
            "fats_g",
            "carbs_g",
            "mg_mg",
            "fe_mg",
            "ca_mg",
            "water_g",
        },
        "restricted": {
            "nlc_g",
            "mds_g",
            "alcohol_pct",
        },
    },
}

GOAL_CATEGORY_RULES = {
    ConsumerGoal.GOAL_LOSE_WEIGHT: {
        "preferred_subtypes": (
            "овощ",
            "фрукт",
            "говядина 1",
            "свинина бекон",
            "свинина мясн",
            "баранина 1",
            "птиц",
            "рыб",
        ),
        "preferred_types": (
            "овощ",
            "фрукт",
            "рыб",
            "птиц",
        ),
        "restricted_subtypes": (
            "конфет",
            "шоколад",
            "кондитер",
            "морожен",
            "сладк",
            "лимонад",
            "газирован",
            "выпечк",
        ),
        "restricted_types": (
            "кондитер",
            "морожен",
            "выпечк",
        ),
    },
    ConsumerGoal.GOAL_MAINTAIN: {
        "preferred_subtypes": (
            "овощ",
            "фрукт",
        ),
        "preferred_types": (
            "овощ",
            "фрукт",
        ),
        "restricted_subtypes": (
            "конфет",
            "шоколад",
            "кондитер",
            "морожен",
            "сладк",
            "лимонад",
            "газирован",
            "выпечк",
        ),
        "restricted_types": (
            "кондитер",
            "морожен",
            "выпечк",
        ),
    },
    ConsumerGoal.GOAL_GAIN_MUSCLE: {
        "preferred_subtypes": (),
        "preferred_types": (),
        "restricted_subtypes": (),
        "restricted_types": (),
    },
}

CLASS_META = {
    "best_fit": {"label": "Наиболее подходит", "color": "green", "rank": 3},
    "limited_fit": {"label": "Подходит с ограничениями", "color": "yellow", "rank": 2},
    "not_recommended": {"label": "Не рекомендуется", "color": "red", "rank": 1},
    "excluded": {"label": "Исключено", "color": "blocked", "rank": 0},
}

VITAMIN_TARGET_NAMES = {
    "a_mg": "A_Vitamin (mg)",
    "beta_carotene_mg": "Beta_Carotene (mg)",
    "b1_mg": "B1_Vitamin (mg)",
    "b2_mg": "B2_Vitamin (mg)",
    "c_mg": "C_Vitamin (mg)",
    "niacin_index": "Niacin_Index",
}

MINERAL_TARGET_NAMES = {
    "na_mg": "Na (mg)",
    "k_mg": "K (mg)",
    "ca_mg": "Ca (mg)",
    "mg_mg": "Mg (mg)",
    "p_mg": "P (mg)",
    "fe_mg": "Fe (mg)",
}


def _safe_float(value) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_mapping(product: Any) -> bool:
    return isinstance(product, dict)


def _product_get(product: Any, *keys: str):
    if _is_mapping(product):
        for key in keys:
            if key in product and product[key] is not None:
                return product[key]
        return None
    for key in keys:
        value = getattr(product, key, None)
        if value is not None:
            return value
    return None


def _product_id(product: Any) -> Optional[int]:
    raw = _product_get(product, "id")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def _product_payload(product: Any) -> dict:
    if _is_mapping(product):
        return {
            "id": _product_get(product, "id"),
            "name": _product_get(product, "name"),
            "subtype_id": _product_get(product, "subtype_id", "subtypeId"),
            "subtype_name": _product_get(product, "subtype_name", "subtypeName"),
            "type_id": _product_get(product, "type_id", "typeId"),
            "type_name": _product_get(product, "type_name", "typeName"),
        }

    subtype = getattr(product, "subtype", None)
    product_type = getattr(product, "type", None)
    return {
        "id": product.id,
        "name": product.name,
        "subtype_id": getattr(subtype, "id", None),
        "subtype_name": getattr(subtype, "name", None),
        "type_id": getattr(product_type, "id", None),
        "type_name": getattr(product_type, "name", None),
    }


def _resolve_related(product: FoodProducts, source_group: str):
    rel_name = GROUP_ALIASES.get(source_group, source_group)
    return getattr(product, rel_name, None)


def get_nutrient_value(product: Any, nd: NutrientDictionary) -> Optional[float]:
    if _is_mapping(product):
        code = nd.code
        aliases = {
            "dietary_fiber_g": "fiber_g",
        }
        value = _product_get(product, code, aliases.get(code, ""))
        return _safe_float(value)
    related = _resolve_related(product, nd.source_group)
    if related is None:
        return None
    return _safe_float(getattr(related, nd.source_field, None))


def build_targets_day_from_profile_targets(targets: Dict) -> Dict[str, float]:
    minerals = targets.get("target_minerals_day") or {}
    fat_acids = targets.get("target_fat_acids_day") or {}
    na = minerals.get("Na (mg)") or minerals.get("Na") or minerals.get("Натрий") or minerals.get("na_mg")

    out = {
        "energy_kcal": float(targets["target_energy_kcal_day"]),
        "protein_g": float(targets["target_macros_g_day"]["protein_g"]),
        "fats_g": float(targets["target_macros_g_day"]["fat_g"]),
        "carbs_g": float(targets["target_macros_g_day"]["carb_g"]),
        "dietary_fiber_g": float((targets.get("target_fiber_g_day") or {}).get("min") or 0),
        "na_mg": float(na) if na not in (None, "", 0) else ADULT_SODIUM_NORM_MG_DAY,
        "cholesterol_g": float(targets.get("target_cholesterol_mg_day") or ADULT_CHOLESTEROL_NORM_MG_DAY),
    }
    out["salt_eq_g"] = round((out["na_mg"] / 1000.0) * SALT_EQUIVALENT_FACTOR, 2)
    out["nlc_g"] = float(fat_acids.get("nlc_g") or round(out["energy_kcal"] * 0.10 / 9.0, 2))
    out["pufa_g"] = float(fat_acids.get("pufa_g") or round(out["energy_kcal"] * 0.10 / 9.0, 2))

    for code, name in VITAMIN_TARGET_NAMES.items():
        value = (targets.get("target_vitamins_day") or {}).get(name)
        if value not in (None, "", 0):
            out[code] = float(value)

    for code, name in MINERAL_TARGET_NAMES.items():
        value = minerals.get(name)
        if value not in (None, "", 0):
            out[code] = float(value)

    return out


def _is_blocked_orm(profile: ConsumerProfile, product: FoodProducts) -> Tuple[bool, List[str]]:
    prod_allergens = get_allergens_for_product(product)
    if not hasattr(profile, "_recommendation_allergen_ids_cache"):
        profile._recommendation_allergen_ids_cache = set(
            profile.profile_allergens.values_list("allergen_id", flat=True)
        )
    profile_allergen_ids = profile._recommendation_allergen_ids_cache
    prod_allergen_ids = set()
    for allergen in prod_allergens:
        if isinstance(allergen, dict) and "id" in allergen:
            prod_allergen_ids.add(int(allergen["id"]))
        elif hasattr(allergen, "id"):
            prod_allergen_ids.add(int(allergen.id))

    if profile_allergen_ids & prod_allergen_ids:
        return True, ["Продукт исключён: содержит аллерген, отмеченный в профиле пользователя."]

    if profile.has_minor_children:
        rule, _level = pick_not_child_rule(product)
        if rule is not None:
            return True, ["Продукт исключён: не подходит для выбранного критерия организации питания детей."]

    return False, []


def is_blocked(
    profile: ConsumerProfile,
    product: Any,
    server_product_map: Optional[Dict[int, FoodProducts]] = None,
) -> Tuple[bool, List[str]]:
    if not _is_mapping(product):
        return _is_blocked_orm(profile, product)

    product_id = _product_id(product)
    if server_product_map and product_id in server_product_map:
        return _is_blocked_orm(profile, server_product_map[product_id])

    if not hasattr(profile, "_recommendation_allergen_ids_cache"):
        profile._recommendation_allergen_ids_cache = set(
            profile.profile_allergens.values_list("allergen_id", flat=True)
        )
    profile_allergen_ids = profile._recommendation_allergen_ids_cache

    raw_allergens = _product_get(product, "allergens") or []
    product_allergen_ids = set()
    for allergen in raw_allergens:
        if isinstance(allergen, dict) and allergen.get("id") is not None:
            product_allergen_ids.add(int(allergen["id"]))

    if profile_allergen_ids and product_allergen_ids and (profile_allergen_ids & product_allergen_ids):
        return True, ["Продукт исключён: содержит аллерген, отмеченный в профиле пользователя."]

    if profile.has_minor_children:
        child_allowed = _product_get(product, "is_child_allowed", "isChildAllowed")
        if child_allowed is False:
            return True, ["Продукт исключён: не подходит для выбранного критерия организации питания детей."]

    return False, []


def _normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _build_default_roles(
    goal_type: Optional[str],
    nutrient_map: Dict[str, NutrientDictionary],
    targets_day: Dict[str, float],
) -> Dict[str, str]:
    roles: Dict[str, str] = {}
    profile = GOAL_NUTRIENT_PROFILES.get(goal_type) or {
        "preferred": BASE_PREFERRED_CODES,
        "restricted": BASE_RESTRICTED_CODES,
    }

    del targets_day

    for code in profile["preferred"]:
        if code in nutrient_map:
            roles[code] = "preferred"

    for code in profile["restricted"]:
        if code in nutrient_map:
            roles[code] = "restricted"

    return roles


def _build_active_roles(
    goal: Optional[ConsumerGoal],
    prefs: List[GoalNutrientPreference],
    nutrient_map: Dict[str, NutrientDictionary],
    targets_day: Dict[str, float],
) -> Dict[str, str]:
    replace_base = bool(getattr(goal, "preferences_replace_base", False)) if goal else False
    roles = {} if replace_base else _build_default_roles(getattr(goal, "goal_type", None), nutrient_map, targets_day)

    for pref in prefs:
        code = pref.nutrient_code_id
        if code not in nutrient_map:
            continue
        roles[code] = "preferred" if pref.direction == "more" else "restricted"

    return roles


def _comparison_group_key(product: Any) -> Tuple[str, Optional[int]]:
    subtype_id = _product_get(product, "subtype_id", "subtypeId")
    if subtype_id:
        return ("subtype", int(subtype_id))
    type_id = _product_get(product, "type_id", "typeId") or getattr(getattr(product, "type", None), "id", None)
    return ("type", int(type_id) if type_id else None)


def _fetch_comparison_pools(
    products: List[Any],
    comparison_mode: str = COMPARISON_MODE_SUBGROUP,
) -> Dict[Tuple[str, Optional[int]], List[Any]]:
    if comparison_mode == COMPARISON_MODE_GLOBAL:
        return {("global", None): list(products)}

    if products and _is_mapping(products[0]):
        pools: Dict[Tuple[str, Optional[int]], List[Any]] = {}
        for product in products:
            pools.setdefault(_comparison_group_key(product), []).append(product)
        return pools

    subtype_ids = {int(p.subtype_id) for p in products if getattr(p, "subtype_id", None)}
    type_ids = {
        int(getattr(p, "type_id", None) or getattr(getattr(p, "type", None), "id", None))
        for p in products
        if not getattr(p, "subtype_id", None) and (getattr(p, "type_id", None) or getattr(getattr(p, "type", None), "id", None))
    }

    pools: Dict[Tuple[str, Optional[int]], List[FoodProducts]] = {}

    if subtype_ids:
        subtype_products = list(
            FoodProducts.objects.filter(subtype_id__in=subtype_ids)
            .select_related("subtype", "subtype__product_type")
            .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")
        )
        for product in subtype_products:
            pools.setdefault(("subtype", int(product.subtype_id)), []).append(product)

    if type_ids:
        type_products = list(
            FoodProducts.objects.filter(subtype__product_type_id__in=type_ids)
            .select_related("subtype", "subtype__product_type")
            .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")
        )
        for product in type_products:
            product_type_id = getattr(product, "type_id", None) or getattr(getattr(product, "type", None), "id", None)
            if product_type_id:
                pools.setdefault(("type", int(product_type_id)), []).append(product)

    return pools


def _match_goal_category_rule(goal_type: Optional[str], product: Any) -> Optional[dict]:
    rules = GOAL_CATEGORY_RULES.get(goal_type)
    if not rules:
        return None

    subtype_name = _normalize_text(_product_get(product, "subtype_name", "subtypeName"))
    type_name = _normalize_text(_product_get(product, "type_name", "typeName"))
    if not type_name and not _is_mapping(product):
        type_name = _normalize_text(getattr(getattr(product, "type", None), "name", None))
    if not subtype_name and not _is_mapping(product):
        subtype_name = _normalize_text(getattr(getattr(product, "subtype", None), "name", None))

    for token in rules["preferred_subtypes"]:
        if token in subtype_name:
            return {
                "scope": "subtype",
                "scope_name": _product_get(product, "subtype_name", "subtypeName") or getattr(getattr(product, "subtype", None), "name", None),
                "effect": "preferred",
                "token": token,
            }
    for token in rules["restricted_subtypes"]:
        if token in subtype_name:
            return {
                "scope": "subtype",
                "scope_name": _product_get(product, "subtype_name", "subtypeName") or getattr(getattr(product, "subtype", None), "name", None),
                "effect": "restricted",
                "token": token,
            }

    for token in rules["preferred_types"]:
        if token in type_name:
            return {
                "scope": "type",
                "scope_name": _product_get(product, "type_name", "typeName") or getattr(getattr(product, "type", None), "name", None),
                "effect": "preferred",
                "token": token,
            }
    for token in rules["restricted_types"]:
        if token in type_name:
            return {
                "scope": "type",
                "scope_name": _product_get(product, "type_name", "typeName") or getattr(getattr(product, "type", None), "name", None),
                "effect": "restricted",
                "token": token,
            }
    return None


def _median(values: List[float]) -> Optional[float]:
    if not values:
        return None
    return float(median(values))


def _compute_quartiles(values: List[float]) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    if not values:
        return None, None, None

    ordered = sorted(float(v) for v in values)
    q2 = _median(ordered)
    if q2 is None:
        return None, None, None

    n = len(ordered)
    mid = n // 2
    if n % 2 == 0:
        lower = ordered[:mid]
        upper = ordered[mid:]
    else:
        lower = ordered[:mid]
        upper = ordered[mid + 1 :]

    q1 = _median(lower) if lower else ordered[0]
    q3 = _median(upper) if upper else ordered[-1]
    return q1, q2, q3


def _build_percentile_map(products: List[Any], nd: NutrientDictionary) -> Dict[int, float]:
    values = []
    for product in products:
        value = get_nutrient_value(product, nd)
        if value is not None:
            product_id = _product_id(product)
            if product_id is not None:
                values.append((product_id, float(value)))

    if not values:
        return {}

    values.sort(key=lambda pair: pair[1])
    total = len(values)
    percentile_map: Dict[int, float] = {}

    i = 0
    while i < total:
        j = i
        while j + 1 < total and values[j + 1][1] == values[i][1]:
            j += 1

        count_less = i
        count_equal = j - i + 1
        q = (count_less + 0.5 * count_equal) / float(total)
        for idx in range(i, j + 1):
            percentile_map[values[idx][0]] = q
        i = j + 1

    return percentile_map


def _build_score_percentile_map(values_by_product: Dict[int, float]) -> Dict[int, float]:
    if not values_by_product:
        return {}

    ordered = sorted(values_by_product.items(), key=lambda pair: pair[1])
    total = len(ordered)
    percentile_map: Dict[int, float] = {}

    i = 0
    while i < total:
        j = i
        while j + 1 < total and ordered[j + 1][1] == ordered[i][1]:
            j += 1

        count_less = i
        count_equal = j - i + 1
        q = (count_less + 0.5 * count_equal) / float(total)
        for idx in range(i, j + 1):
            percentile_map[ordered[idx][0]] = q
        i = j + 1

    return percentile_map


def _format_level(share_pct: Optional[float]) -> Optional[str]:
    if share_pct is None:
        return None
    if share_pct < 10:
        return "низкий вклад"
    if share_pct < 25:
        return "умеренный вклад"
    return "высокий вклад"


def _format_percentile_text(percentile_q: float) -> str:
    pct = round(percentile_q * 100.0, 1)
    return f"выше, чем у {pct}% аналогов"


def _format_correspondence_text(direction: str, correspondence_a: float) -> str:
    pct = round(correspondence_a * 100.0, 1)
    if direction == "preferred":
        return f"полезный вклад {pct}%"
    return f"ограничивающий вклад {pct}%"


def _build_signal(
    product: Any,
    code: str,
    role: str,
    nd: NutrientDictionary,
    percentile_q: float,
    targets_day: Dict[str, float],
    source: str,
) -> dict:
    value_100g = get_nutrient_value(product, nd)
    target_day = targets_day.get(code)
    share = None
    if value_100g is not None and target_day not in (None, 0):
        share = float(value_100g) / float(target_day)
    direction = "preferred" if role == "preferred" else "restricted"
    correspondence_a = percentile_q if role == "preferred" else 1.0 - percentile_q
    share_pct = None if share is None else share * 100.0

    return {
        "code": code,
        "ru_name": nd.ru_name,
        "unit": nd.unit,
        "direction": direction,
        "value_100g": value_100g,
        "target_day": target_day,
        "daily_share": share,
        "daily_share_pct": share_pct,
        "percentile_q": percentile_q,
        "correspondence_a": correspondence_a,
        "source": source,
        "level": _format_level(share_pct),
    }


def _classify(score_s: Optional[float], qua1: Optional[float], qua3: Optional[float]) -> Tuple[str, str, str]:
    if score_s is None or qua1 is None or qua3 is None:
        meta = CLASS_META["limited_fit"]
        return "limited_fit", meta["label"], meta["color"]
    if score_s >= qua3:
        meta = CLASS_META["best_fit"]
        return "best_fit", meta["label"], meta["color"]
    if score_s <= qua1:
        meta = CLASS_META["not_recommended"]
        return "not_recommended", meta["label"], meta["color"]
    meta = CLASS_META["limited_fit"]
    return "limited_fit", meta["label"], meta["color"]


def _make_blocked_item(product: Any, reasons: List[str]) -> dict:
    meta = CLASS_META["excluded"]
    return {
        "product": _product_payload(product),
        "class_code": "excluded",
        "class_label": meta["label"],
        "color": meta["color"],
        "reasons": reasons,
        "score_components": {
            "index_s": None,
            "score_percent_100": None,
            "percentile_score": None,
            "qua1": None,
            "qua2": None,
            "qua3": None,
        },
        "matched_preferences": [],
        "explain": {
            "class_code": "excluded",
            "class_label": meta["label"],
            "color": meta["color"],
            "score_index_s": None,
            "score_percent_100": None,
            "comparison_scope": None,
            "comparison_group": None,
            "quartiles": {"qua1": None, "qua2": None, "qua3": None},
            "signals": [],
            "base_signals": [],
            "summary": {
                "positive_reasons": [],
                "limiting_reasons": reasons,
                "text_explanation": "Продукт исключён из рекомендаций по правилам безопасности профиля.",
            },
            "method": {
                "basis": "hard_profile_constraints",
            },
        },
    }


def _build_group_metrics(
    profile: ConsumerProfile,
    group_products: List[Any],
    active_roles: Dict[str, str],
    nutrient_map: Dict[str, NutrientDictionary],
    targets_day: Dict[str, float],
    prefs_by_code: Dict[str, GoalNutrientPreference],
    goal_type: Optional[str] = None,
    comparison_mode: str = COMPARISON_MODE_SUBGROUP,
    server_product_map: Optional[Dict[int, FoodProducts]] = None,
) -> Dict[int, dict]:
    blocked_cache = {
        _product_id(product): is_blocked(profile, product, server_product_map=server_product_map)
        for product in group_products
        if _product_id(product) is not None
    }
    allowed_products = [
        product for product in group_products
        if _product_id(product) is not None and not blocked_cache[_product_id(product)][0]
    ]

    percentile_maps: Dict[str, Dict[int, float]] = {}
    signal_map: Dict[int, List[dict]] = {}
    category_rule_map: Dict[int, Optional[dict]] = {}
    score_map: Dict[int, float] = {}

    if not active_roles:
        return {
            _product_id(product): {
                "signals": [],
                "category_rule": None,
                "score_index_s": None,
                "score_percent_100": None,
                "qua1": None,
                "qua2": None,
                "qua3": None,
            }
            for product in allowed_products
            if _product_id(product) is not None
        }

    for code in active_roles:
        nd = nutrient_map.get(code)
        if nd is None:
            continue
        percentile_maps[code] = _build_percentile_map(allowed_products, nd)

    for product in allowed_products:
        signals: List[dict] = []
        a_values: List[float] = []
        for code, role in active_roles.items():
            nd = nutrient_map.get(code)
            product_id = _product_id(product)
            percentile_q = percentile_maps.get(code, {}).get(product_id)
            if nd is None or percentile_q is None:
                continue
            signal = _build_signal(
                product=product,
                code=code,
                role=role,
                nd=nd,
                percentile_q=percentile_q,
                targets_day=targets_day,
                source="user" if code in prefs_by_code else "system",
            )
            signals.append(signal)
            a_values.append(signal["correspondence_a"])

        product_id = _product_id(product)
        category_rule = None
        if comparison_mode == COMPARISON_MODE_GLOBAL:
            category_rule = _match_goal_category_rule(goal_type, product)
            if category_rule:
                synthetic_value = 1.0 if category_rule["effect"] == "preferred" else 0.0
                a_values.extend([synthetic_value] * GOAL_RULE_SIGNAL_WEIGHT)
        category_rule_map[product_id] = category_rule
        signal_map[product_id] = signals
        if a_values:
            score_map[product_id] = float(median(a_values))

    qua1, qua2, qua3 = _compute_quartiles(list(score_map.values()))
    score_percentile = _build_score_percentile_map(score_map)

    return {
        _product_id(product): {
            "signals": signal_map.get(_product_id(product), []),
            "category_rule": category_rule_map.get(_product_id(product)),
            "score_index_s": score_map.get(_product_id(product)),
            "score_percent_100": None
            if _product_id(product) not in score_percentile
            else round(score_percentile[_product_id(product)] * 100.0, 1),
            "qua1": qua1,
            "qua2": qua2,
            "qua3": qua3,
        }
        for product in allowed_products
    }


def _summary_from_signals(product: Any, signals: List[dict], class_label: str, category_rule: Optional[dict] = None) -> dict:
    preferred = sorted(
        [
            s for s in signals
            if s["direction"] == "preferred" and (_safe_float(s.get("value_100g")) or 0.0) > 0.0
        ],
        key=lambda s: (s["correspondence_a"], s["percentile_q"]),
        reverse=True,
    )
    restricted = sorted(
        [
            s for s in signals
            if s["direction"] == "restricted" and (_safe_float(s.get("value_100g")) or 0.0) > 0.0
        ],
        key=lambda s: (s["correspondence_a"], -(s["percentile_q"])),
    )

    positive_reasons = [
        f"{s['ru_name']}: {_format_percentile_text(s['percentile_q'])}, {_format_correspondence_text(s['direction'], s['correspondence_a'])}"
        for s in preferred[:3]
    ]
    limiting_reasons = [
        f"{s['ru_name']}: {_format_percentile_text(s['percentile_q'])}, {_format_correspondence_text(s['direction'], s['correspondence_a'])}"
        for s in restricted[:3]
    ]

    parts = [f"Класс рекомендации: «{class_label}»."]
    if positive_reasons:
        parts.append("Сильные стороны продукта относительно аналогов: " + "; ".join(positive_reasons) + ".")
    if limiting_reasons:
        parts.append("Ограничивающие факторы: " + "; ".join(limiting_reasons) + ".")
    if category_rule:
        if category_rule["effect"] == "preferred":
            parts.append(
                f"Дополнительно продукт поддержан правилом цели питания, так как относится к рекомендуемой {('подгруппе' if category_rule['scope'] == 'subtype' else 'группе')} «{category_rule['scope_name']}»."
            )
        else:
            parts.append(
                f"Дополнительно продукт ограничен правилом цели питания, так как относится к ограничиваемой {('подгруппе' if category_rule['scope'] == 'subtype' else 'группе')} «{category_rule['scope_name']}»."
            )

    return {
        "positive_reasons": positive_reasons,
        "limiting_reasons": limiting_reasons,
        "text_explanation": " ".join(parts),
    }


def recommend(
    profile_id: int,
    mode: str,
    cart_id: Optional[int] = None,
    limit: int = 50,
    q: Optional[str] = None,
    type_id: Optional[int] = None,
    subtype_id: Optional[int] = None,
    comparison_mode: str = COMPARISON_MODE_SUBGROUP,
    local_products: Optional[List[dict]] = None,
) -> dict:
    if mode != "catalog":
        raise ValueError("Новый алгоритм рекомендаций сейчас поддерживает только режим просмотра продуктов.")

    del cart_id  # explicit: unsupported in the current algorithm version
    if comparison_mode not in COMPARISON_MODE_CHOICES:
        comparison_mode = COMPARISON_MODE_SUBGROUP

    profile = get_object_or_404(ConsumerProfile, pk=profile_id)
    goal = ConsumerGoal.objects.filter(profile=profile, is_active=True).order_by("-id").first()
    prefs = list(goal.nutrient_preferences.select_related("nutrient_code").all()) if goal else []
    prefs_by_code = {pref.nutrient_code_id: pref for pref in prefs}

    targets = compute_targets_for_profile(profile)
    targets_day = build_targets_day_from_profile_targets(targets)
    nutrient_rows = NutrientDictionary.objects.filter(is_active=True)
    nutrient_map = {n.code: n for n in nutrient_rows}
    active_roles = _build_active_roles(goal, prefs, nutrient_map, targets_day)

    server_product_map: Dict[int, FoodProducts] = {}
    if local_products:
        source_products = [item for item in local_products if isinstance(item, dict)]
        if q:
            search = q.strip().lower()
            source_products = [item for item in source_products if search in str(_product_get(item, "name") or "").lower()]
        if subtype_id:
            source_products = [item for item in source_products if str(_product_get(item, "subtype_id", "subtypeId") or "") == str(subtype_id)]
        elif type_id:
            source_products = [item for item in source_products if str(_product_get(item, "type_id", "typeId") or "") == str(type_id)]
        products = source_products[:2000]

        server_ids = [
            pid for pid in {_product_id(item) for item in local_products}
            if pid is not None and pid > 0
        ]
        if server_ids:
            server_products = (
                FoodProducts.objects.filter(id__in=server_ids)
                .select_related("subtype", "subtype__product_type")
                .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")
            )
            server_product_map = {product.id: product for product in server_products}
        pools = _fetch_comparison_pools(products, comparison_mode=comparison_mode)
    else:
        qs = FoodProducts.objects.all()
        if q:
            qs = qs.filter(name__icontains=q.strip())
        if subtype_id:
            qs = qs.filter(subtype_id=subtype_id)
        elif type_id:
            qs = qs.filter(subtype__product_type_id=type_id)

        products = list(
            qs.select_related("subtype", "subtype__product_type")
            .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")[:2000]
        )
        pools = _fetch_comparison_pools(products, comparison_mode=comparison_mode)

    group_metrics: Dict[Tuple[str, Optional[int]], Dict[int, dict]] = {}
    for key, group_products in pools.items():
        group_metrics[key] = _build_group_metrics(
            profile=profile,
            group_products=group_products,
            active_roles=active_roles,
            nutrient_map=nutrient_map,
            targets_day=targets_day,
            prefs_by_code=prefs_by_code,
            goal_type=getattr(goal, "goal_type", None),
            comparison_mode=comparison_mode,
            server_product_map=server_product_map,
        )

    items = []
    for product in products:
        blocked, block_reasons = is_blocked(profile, product, server_product_map=server_product_map)
        if blocked:
            items.append(_make_blocked_item(product, block_reasons))
            continue

        group_key = ("global", None) if comparison_mode == COMPARISON_MODE_GLOBAL else _comparison_group_key(product)
        product_id = _product_id(product)
        metrics = group_metrics.get(group_key, {}).get(product_id, {})
        signals = metrics.get("signals", [])
        category_rule = metrics.get("category_rule")
        score_index_s = metrics.get("score_index_s")
        score_percent_100 = metrics.get("score_percent_100")
        qua1 = metrics.get("qua1")
        qua2 = metrics.get("qua2")
        qua3 = metrics.get("qua3")
        class_code, class_label, color = _classify(score_index_s, qua1, qua3)
        summary = _summary_from_signals(product, signals, class_label, category_rule)

        reasons = []
        if summary["positive_reasons"]:
            reasons.append("Сильные стороны: " + "; ".join(summary["positive_reasons"]))
        if summary["limiting_reasons"]:
            reasons.append("Ограничивающие факторы: " + "; ".join(summary["limiting_reasons"]))
        if not reasons:
            reasons.append("По выбранному профилю активные нутриенты для расчёта не определены.")

        if comparison_mode == COMPARISON_MODE_GLOBAL:
            comparison_scope, comparison_id, comparison_name = "global", None, "Текущая выборка"
        else:
            comparison_scope, comparison_id = group_key
            comparison_name = (
                _product_get(product, "subtype_name", "subtypeName")
                if comparison_scope == "subtype"
                else _product_get(product, "type_name", "typeName")
            )
            if comparison_scope == "type" and not _is_mapping(product):
                comparison_name = getattr(getattr(product, "type", None), "name", None)

        score_components = {
            "index_s": score_index_s,
            "score_percent_100": score_percent_100,
            "percentile_score": None if score_percent_100 is None else score_percent_100 / 100.0,
            "qua1": qua1,
            "qua2": qua2,
            "qua3": qua3,
            # aliases for older UI pieces that may still look here
            "final_score": None if score_percent_100 is None else score_percent_100 / 100.0,
            "base_score": score_index_s,
            "preference_score": None if score_percent_100 is None else score_percent_100 / 100.0,
        }

        item = {
            "product": _product_payload(product),
            "class_code": class_code,
            "class_label": class_label,
            "color": color,
            "reasons": reasons,
            "matched_preferences": [
                {
                    "nutrient_code": signal["code"],
                    "direction": "more" if signal["direction"] == "preferred" else "less",
                    "source": signal["source"],
                }
                for signal in signals
                if signal["source"] == "user"
            ],
            "score_components": score_components,
            "explain": {
                "class_code": class_code,
                "class_label": class_label,
                "color": color,
                "score_index_s": score_index_s,
                "score_percent_100": score_percent_100,
                "comparison_scope": comparison_scope,
                "comparison_group": {
                    "id": comparison_id,
                    "name": comparison_name,
                },
                "quartiles": {
                    "qua1": qua1,
                    "qua2": qua2,
                    "qua3": qua3,
                },
                "active_nutrients_count": len(signals),
                "signals": signals,
                "base_signals": signals,
                "targets_day": targets_day,
                "targets_meta": {
                    "goal_type": getattr(goal, "goal_type", None),
                    "energy_delta_kcal": targets.get("energy_delta_kcal"),
                    "profile_mode": (
                        "custom_only"
                        if goal and goal.preferences_replace_base
                        else ("base_plus_custom" if prefs else "base")
                    ),
                },
                "summary": summary,
                "category_rule": category_rule,
                "method": {
                    "basis": "rank_percentile_median_quartile_model",
                    "percentile_formula": "Q = (count_less + 0.5 * count_equal) / count_known",
                    "preferred_formula": "A = Q",
                    "restricted_formula": "A = 1 - Q",
                    "score_formula": "S = median(A_n)",
                    "class_formula": "best_fit if S >= Qua3; limited_fit if Qua1 < S < Qua3; not_recommended if S <= Qua1",
                },
                "comparison_mode": comparison_mode,
                "filters": {
                    "q": q or "",
                    "type_id": type_id,
                    "subtype_id": subtype_id,
                },
            },
        }
        items.append(item)

    def sort_key(item: dict):
        rank = CLASS_META.get(item.get("class_code"), {}).get("rank", -1)
        score100 = item.get("score_components", {}).get("score_percent_100")
        index_s = item.get("score_components", {}).get("index_s")
        return (
            -rank,
            -(float(score100) if score100 is not None else -1.0),
            -(float(index_s) if index_s is not None else -1.0),
            item["product"]["name"],
        )

    items.sort(key=sort_key)
    return {
        "profile_id": profile.id,
        "goal_id": goal.id if goal else None,
        "mode": mode,
        "comparison_mode": comparison_mode,
        "count": min(len(items), limit),
        "items": items[:limit],
    }
