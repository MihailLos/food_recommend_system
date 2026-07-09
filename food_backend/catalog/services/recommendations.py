from typing import Any, Dict, List, Optional, Tuple
import re

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
from catalog.utils.targets import (
    DEFAULT_COVERAGE_CODES,
    DEFAULT_LIMIT_CODES,
    compute_targets_for_profile,
    ensure_active_goal,
)

ADULT_SODIUM_NORM_MG_DAY = 1300.0
ADULT_CHOLESTEROL_NORM_MG_DAY = 300.0
SALT_EQUIVALENT_FACTOR = 2.5

GROUP_ALIASES = {
    "fatacids": "fat_acids",
    "other": "other_nutrients",
}

TECHNICAL_NUTRIENT_CODES = {
    "starch_g",
    "ash_g",
}

COMPARISON_MODE_SUBGROUP = "subgroup"
COMPARISON_MODE_TYPE = "type"
COMPARISON_MODE_GLOBAL = "global"
COMPARISON_MODE_SELECTED = "selected"
COMPARISON_MODE_CHOICES = {
    COMPARISON_MODE_SUBGROUP,
    COMPARISON_MODE_TYPE,
    COMPARISON_MODE_GLOBAL,
    COMPARISON_MODE_SELECTED,
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
    "pp_mg": "PP_Vitamin (mg)",
    "c_mg": "C_Vitamin (mg)",
    "retinol_index": "Retinol_Index",
    "tocopherol_index": "Tocopherol_Index",
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
            if key and key in product and product[key] is not None:
                return product[key]
        return None
    for key in keys:
        if not key:
            continue
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
        aliases = {
            "dietary_fiber_g": "fiber_g",
        }
        value = _product_get(product, nd.code, aliases.get(nd.code, ""))
        return _safe_float(value)
    related = _resolve_related(product, nd.source_group)
    if related is None:
        return None
    return _safe_float(getattr(related, nd.source_field, None))


def build_targets_day_from_profile_targets(targets: Dict) -> Dict[str, float]:
    minerals = targets.get("target_minerals_day") or {}
    fat_acids = targets.get("target_fat_acids_day") or {}
    vitamins = targets.get("target_vitamins_day") or {}
    fiber = targets.get("target_fiber_g_day") or {}
    water = targets.get("target_water_g_day") or {}
    mds = targets.get("target_mds_g_day") or {}
    other = targets.get("target_other_nutrients_day") or {}
    na = minerals.get("Na (mg)") or minerals.get("Na") or minerals.get("Натрий") or minerals.get("na_mg")

    out = {
        "energy_kcal": float(targets["target_energy_kcal_day"]),
        "protein_g": float(targets["target_macros_g_day"]["protein_g"]),
        "fats_g": float(targets["target_macros_g_day"]["fat_g"]),
        "carbs_g": float(targets["target_macros_g_day"]["carb_g"]),
        "dietary_fiber_g": float(fiber.get("min") or 0.0),
        "water_g": float(water.get("min") or 0.0),
        "mds_g": float(mds.get("min") or 0.0),
        "organic_acids_g": float(other.get("organic_acids_g") or 0.0),
        "na_mg": float(na) if na not in (None, "", 0) else ADULT_SODIUM_NORM_MG_DAY,
        "cholesterol_g": float(targets.get("target_cholesterol_mg_day") or ADULT_CHOLESTEROL_NORM_MG_DAY),
    }
    out["salt_eq_g"] = round((out["na_mg"] / 1000.0) * SALT_EQUIVALENT_FACTOR, 2)
    out["nlc_g"] = float(fat_acids.get("nlc_g") or 0.0)
    out["pufa_g"] = float(fat_acids.get("pufa_g") or 0.0)

    for code, name in VITAMIN_TARGET_NAMES.items():
        value = vitamins.get(name)
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
    has_additive_allergen = False
    for allergen in raw_allergens:
        if isinstance(allergen, dict) and allergen.get("id") is not None:
            product_allergen_ids.add(int(allergen["id"]))
            if allergen.get("scope") == "additive":
                has_additive_allergen = True

    if profile_allergen_ids and product_allergen_ids and (profile_allergen_ids & product_allergen_ids):
        return True, ["Продукт исключён: содержит аллерген, отмеченный в профиле пользователя."]

    if profile_allergen_ids and has_additive_allergen:
        return True, ["Продукт исключён: содержит аллергенную пищевую добавку, а в профиле пользователя включены ограничения по аллергенам."]

    if profile.has_minor_children:
        child_allowed = _product_get(product, "is_child_allowed", "isChildAllowed")
        if child_allowed is False:
            return True, ["Продукт исключён: не подходит для выбранного критерия организации питания детей."]

    return False, []


def _normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _tokenize_text(value: Any) -> List[str]:
    return [token for token in re.split(r"[^a-zA-Zа-яА-Я0-9]+", _normalize_text(value)) if token]


def _matches_rule_name(name: Any, phrase: str) -> bool:
    words = _tokenize_text(name)
    if not words:
        return False
    rule_parts = _tokenize_text(phrase)
    if not rule_parts:
        return False
    for part in rule_parts:
        if not any(word.startswith(part) for word in words):
            return False
    return True


def _goal_context_title(_goal_type: Optional[str]) -> str:
    return "текущих пищевых ориентиров"


def _build_default_roles(
    goal_type: Optional[str],
    nutrient_map: Dict[str, NutrientDictionary],
) -> Dict[str, str]:
    roles: Dict[str, str] = {}
    del goal_type
    profile = {
        "preferred": DEFAULT_COVERAGE_CODES,
        "restricted": DEFAULT_LIMIT_CODES,
    }

    for code in profile["preferred"]:
        if code in nutrient_map and code not in TECHNICAL_NUTRIENT_CODES:
            roles[code] = "preferred"

    for code in profile["restricted"]:
        if code in nutrient_map and code not in TECHNICAL_NUTRIENT_CODES:
            roles[code] = "restricted"

    return roles


def _build_active_roles(
    goal: Optional[ConsumerGoal],
    prefs: List[GoalNutrientPreference],
    nutrient_map: Dict[str, NutrientDictionary],
) -> Dict[str, str]:
    replace_base = bool(getattr(goal, "preferences_replace_base", False)) if goal else False
    roles = {} if replace_base else _build_default_roles(getattr(goal, "goal_type", None), nutrient_map)

    for pref in prefs:
        code = pref.nutrient_code_id
        if code not in nutrient_map or code in TECHNICAL_NUTRIENT_CODES:
            continue
        roles[code] = "preferred" if pref.direction == "more" else "restricted"

    return roles


def _comparison_group_key(product: Any, comparison_mode: str) -> Tuple[str, Optional[int]]:
    subtype_id = _product_get(product, "subtype_id", "subtypeId")
    type_id = _product_get(product, "type_id", "typeId") or getattr(getattr(product, "type", None), "id", None)

    if comparison_mode == COMPARISON_MODE_TYPE:
        return ("type", int(type_id) if type_id else None)
    if comparison_mode == COMPARISON_MODE_GLOBAL:
        return ("global", None)
    if comparison_mode == COMPARISON_MODE_SELECTED:
        return ("selected", None)
    if subtype_id:
        return ("subtype", int(subtype_id))
    return ("type", int(type_id) if type_id else None)


def _fetch_comparison_pools(
    universe_products: List[Any],
    comparison_mode: str,
    selected_product_ids: Optional[List[int]] = None,
) -> Dict[Tuple[str, Optional[int]], List[Any]]:
    if comparison_mode == COMPARISON_MODE_GLOBAL:
        return {("global", None): list(universe_products)}

    if comparison_mode == COMPARISON_MODE_SELECTED:
        selected_ids = {int(pid) for pid in (selected_product_ids or []) if pid is not None}
        if not selected_ids:
            return {("selected", None): list(universe_products)}
        selected_pool = [
            product for product in universe_products
            if _product_id(product) in selected_ids
        ]
        return {("selected", None): selected_pool or list(universe_products)}

    pools: Dict[Tuple[str, Optional[int]], List[Any]] = {}
    for product in universe_products:
        key = _comparison_group_key(product, comparison_mode)
        pools.setdefault(key, []).append(product)
    return pools


def _match_goal_category_rule(goal_type: Optional[str], product: Any) -> Optional[dict]:
    del goal_type, product
    return None


def get_goal_nutrient_profiles_payload() -> Dict[str, dict]:
    return {
        "default": {
            "preferred": sorted(DEFAULT_COVERAGE_CODES),
            "restricted": sorted(DEFAULT_LIMIT_CODES),
        }
    }


def _compute_quartiles(values: List[float]) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    if not values:
        return None, None, None

    ordered = sorted(float(v) for v in values)
    n = len(ordered)

    def pick(p: float) -> float:
        if n == 1:
            return ordered[0]
        position = (n + 1) * p
        if position <= 1:
            return ordered[0]
        if position >= n:
            return ordered[-1]

        lower_index = int(position) - 1
        fraction = position - int(position)
        lower_value = ordered[lower_index]
        upper_value = ordered[lower_index + 1]
        if fraction == 0:
            return lower_value
        return lower_value + fraction * (upper_value - lower_value)

    return pick(0.25), pick(0.5), pick(0.75)


def _build_percentile_map(values_by_product: Dict[int, float]) -> Dict[int, float]:
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


def _build_rank_percent_map(values_by_product: Dict[int, float], invert: bool = False) -> Dict[int, float]:
    if not values_by_product:
        return {}

    ordered = sorted(values_by_product.items(), key=lambda pair: pair[1])
    total = len(ordered)
    if total == 1:
        only_id = ordered[0][0]
        return {only_id: 100.0}

    result: Dict[int, float] = {}
    index = 0
    while index < total:
        end = index
        while end + 1 < total and ordered[end + 1][1] == ordered[index][1]:
            end += 1
        avg_rank = (index + 1 + end + 1) / 2.0
        percent = ((avg_rank - 1.0) / (total - 1.0)) * 100.0
        if invert:
            percent = 100.0 - percent
        for position in range(index, end + 1):
            result[ordered[position][0]] = round(percent, 1)
        index = end + 1

    return result


def _quartile_bounds_to_score(
    value: Optional[float],
    qua1: Optional[float],
    qua2: Optional[float],
    qua3: Optional[float],
) -> Optional[int]:
    if value is None or qua1 is None or qua2 is None or qua3 is None:
        return None
    if value <= qua1:
        return 1
    if value <= qua2:
        return 2
    if value <= qua3:
        return 3
    return 4


def _compute_signal_strength(quartile_score: Optional[int]) -> Tuple[str, str]:
    value = int(quartile_score or 0)
    if value >= 4:
        return "strong", "сильное"
    if value >= 3:
        return "moderate", "умеренное"
    return "weak", "слабое"


def _level_from_sum(value: Optional[float], qua1: Optional[float], qua3: Optional[float]) -> Optional[dict]:
    if value is None or qua1 is None or qua3 is None:
        return None
    if value <= qua1:
        return {"code": "low", "label": "Низкий"}
    if value >= qua3:
        return {"code": "high", "label": "Высокий"}
    return {"code": "medium", "label": "Средний"}


def _format_percentile_text(percentile_q: Optional[float]) -> str:
    pct = round(float(percentile_q or 0.0) * 100.0, 1)
    return f"Содержится больше, чем у {pct}% продуктов из текущего множества сравнения."


def _build_signal(
    product: Any,
    code: str,
    role: str,
    nd: NutrientDictionary,
    percentile_q: float,
    quartile_score: int,
    targets_day: Dict[str, float],
    source: str,
) -> dict:
    value_100g = get_nutrient_value(product, nd)
    target_day = targets_day.get(code)
    daily_share = None
    if value_100g is not None and target_day not in (None, 0):
        daily_share = float(value_100g) / float(target_day)
    score_code, score_label = _compute_signal_strength(quartile_score)
    return {
        "code": code,
        "ru_name": nd.ru_name,
        "unit": nd.unit,
        "direction": "preferred" if role == "preferred" else "restricted",
        "value_100g": value_100g,
        "target_day": target_day,
        "daily_share": daily_share,
        "daily_share_pct": None if daily_share is None else daily_share * 100.0,
        "percentile_q": percentile_q,
        "quartile_score": quartile_score,
        "correspondence_a": quartile_score,
        "source": source,
        "show_in_explain": bool((_safe_float(value_100g) or 0.0) > 0.0),
        "strength_code": score_code,
        "strength_label": score_label,
    }


def _build_reason_factor(signal: dict, goal_type: Optional[str]) -> dict:
    goal_title = _goal_context_title(goal_type)
    nutrient_name = signal["ru_name"]
    strength_code = signal.get("strength_code") or "weak"
    strength_label = signal.get("strength_label") or "слабое"

    if signal["direction"] == "preferred":
        if strength_code == "strong":
            short = f"{nutrient_name} заметно повысил рекомендацию"
        elif strength_code == "moderate":
            short = f"{nutrient_name} умеренно повысил рекомендацию"
        else:
            short = f"{nutrient_name} слабо повысил рекомендацию"
        title = f"Для цели {goal_title} нутриент «{nutrient_name}» дал {strength_label} положительное влияние."
    else:
        if strength_code == "strong":
            short = f"{nutrient_name} заметно ограничил рекомендацию"
        elif strength_code == "moderate":
            short = f"{nutrient_name} умеренно ограничил рекомендацию"
        else:
            short = f"{nutrient_name} слабо ограничил рекомендацию"
        title = f"Для цели {goal_title} повышенное содержание нутриента «{nutrient_name}» дало {strength_label} ограничивающее влияние."

    return {
        "code": signal["code"],
        "ru_name": nutrient_name,
        "direction": signal["direction"],
        "strength_code": strength_code,
        "strength_label": strength_label,
        "percentile_q": signal["percentile_q"],
        "quartile_score": signal["quartile_score"],
        "title": title,
        "short_text": short,
        "detail_text": _format_percentile_text(signal["percentile_q"]),
    }


def _category_adjustment_for_rule(rule: Optional[dict]) -> float:
    del rule
    return 0.0


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
            "priority_raw": None,
            "coverage_sum": None,
            "limit_sum": None,
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


def _build_score_maps_for_pool(
    allowed_products: List[Any],
    active_roles: Dict[str, str],
    nutrient_map: Dict[str, NutrientDictionary],
    targets_day: Dict[str, float],
) -> Tuple[Dict[str, Dict[int, float]], Dict[str, Dict[int, int]]]:
    percentile_maps: Dict[str, Dict[int, float]] = {}
    quartile_score_maps: Dict[str, Dict[int, int]] = {}

    for code in active_roles:
        nd = nutrient_map.get(code)
        if nd is None:
            continue
        values_by_product: Dict[int, float] = {}
        target_day = targets_day.get(code)
        for product in allowed_products:
            product_id = _product_id(product)
            if product_id is None:
                continue
            raw_value = get_nutrient_value(product, nd)
            if raw_value is None:
                continue
            if target_day not in (None, 0):
                values_by_product[product_id] = float(raw_value) / float(target_day)
            else:
                values_by_product[product_id] = float(raw_value)

        percentile_map = _build_percentile_map(values_by_product)
        qua1, qua2, qua3 = _compute_quartiles(list(values_by_product.values()))
        percentile_maps[code] = percentile_map
        quartile_score_maps[code] = {
            product_id: _quartile_bounds_to_score(value, qua1, qua2, qua3)
            for product_id, value in values_by_product.items()
            if _quartile_bounds_to_score(value, qua1, qua2, qua3) is not None
        }

    return percentile_maps, quartile_score_maps


def _build_group_metrics(
    profile: ConsumerProfile,
    group_products: List[Any],
    active_roles: Dict[str, str],
    nutrient_map: Dict[str, NutrientDictionary],
    targets_day: Dict[str, float],
    prefs_by_code: Dict[str, GoalNutrientPreference],
    goal_type: Optional[str],
    comparison_mode: str,
    server_product_map: Optional[Dict[int, FoodProducts]] = None,
) -> Dict[int, dict]:
    has_coverage_dimension = any(role == "preferred" for role in active_roles.values())
    has_limit_dimension = any(role == "restricted" for role in active_roles.values())
    blocked_cache = {
        _product_id(product): is_blocked(profile, product, server_product_map=server_product_map)
        for product in group_products
        if _product_id(product) is not None
    }
    allowed_products = [
        product for product in group_products
        if _product_id(product) is not None and not blocked_cache[_product_id(product)][0]
    ]

    empty_payload = {
        _product_id(product): {
            "signals": [],
            "visible_signals": [],
            "category_rule": None,
            "category_adjustment": 0.0,
            "coverage_sum": None,
            "limit_sum": None,
            "coverage_percent_100": None,
            "limit_percent_100": None,
            "priority_raw": None,
            "score_percent_100": None,
            "coverage_level": None,
            "limit_level": None,
            "has_coverage_dimension": has_coverage_dimension,
            "has_limit_dimension": has_limit_dimension,
            "qua1": None,
            "qua2": None,
            "qua3": None,
        }
        for product in allowed_products
        if _product_id(product) is not None
    }
    if not active_roles or not allowed_products:
        return empty_payload

    percentile_maps, quartile_score_maps = _build_score_maps_for_pool(
        allowed_products=allowed_products,
        active_roles=active_roles,
        nutrient_map=nutrient_map,
        targets_day=targets_day,
    )

    signal_map: Dict[int, List[dict]] = {}
    score_map: Dict[int, float] = {}
    coverage_sum_map: Dict[int, float] = {}
    limit_sum_map: Dict[int, float] = {}
    category_rule_map: Dict[int, Optional[dict]] = {}
    category_adjustment_map: Dict[int, float] = {}

    use_category_adjustment = comparison_mode in {COMPARISON_MODE_GLOBAL, COMPARISON_MODE_SELECTED}

    for product in allowed_products:
        product_id = _product_id(product)
        if product_id is None:
            continue
        signals: List[dict] = []
        coverage_sum = 0.0
        limit_sum = 0.0

        for code, role in active_roles.items():
            nd = nutrient_map.get(code)
            percentile_q = percentile_maps.get(code, {}).get(product_id)
            quartile_score = quartile_score_maps.get(code, {}).get(product_id)
            if nd is None or percentile_q is None or quartile_score is None:
                continue
            signal = _build_signal(
                product=product,
                code=code,
                role=role,
                nd=nd,
                percentile_q=percentile_q,
                quartile_score=quartile_score,
                targets_day=targets_day,
                source="user" if code in prefs_by_code else "system",
            )
            signals.append(signal)
            if role == "preferred":
                coverage_sum += quartile_score
            else:
                limit_sum += quartile_score

        category_rule = _match_goal_category_rule(goal_type, product) if use_category_adjustment else None
        category_adjustment = _category_adjustment_for_rule(category_rule)

        signal_map[product_id] = signals
        category_rule_map[product_id] = category_rule
        category_adjustment_map[product_id] = category_adjustment
        coverage_sum_map[product_id] = coverage_sum
        limit_sum_map[product_id] = limit_sum
        if has_coverage_dimension and has_limit_dimension:
            priority_raw = coverage_sum - limit_sum + category_adjustment
        elif has_coverage_dimension:
            priority_raw = coverage_sum + category_adjustment
        elif has_limit_dimension:
            priority_raw = -limit_sum + category_adjustment
        else:
            priority_raw = category_adjustment
        score_map[product_id] = priority_raw

    coverage_values = list(coverage_sum_map.values()) if has_coverage_dimension else []
    limit_values = list(limit_sum_map.values()) if has_limit_dimension else []
    coverage_qua1, coverage_qua2, coverage_qua3 = _compute_quartiles(coverage_values)
    limit_qua1, limit_qua2, limit_qua3 = _compute_quartiles(limit_values)
    qua1, qua2, qua3 = _compute_quartiles(list(score_map.values()))
    coverage_percentile = _build_rank_percent_map(coverage_sum_map, invert=False) if has_coverage_dimension else {}
    limit_percentile = _build_rank_percent_map(limit_sum_map, invert=True) if has_limit_dimension else {}
    score_percentile = _build_rank_percent_map(score_map, invert=False)

    return {
        product_id: {
            "signals": signal_map.get(product_id, []),
            "visible_signals": [
                signal for signal in signal_map.get(product_id, [])
                if signal.get("show_in_explain")
            ],
            "category_rule": category_rule_map.get(product_id),
            "category_adjustment": category_adjustment_map.get(product_id, 0.0),
            "coverage_sum": coverage_sum_map.get(product_id),
            "limit_sum": limit_sum_map.get(product_id),
            "coverage_percent_100": coverage_percentile.get(product_id),
            "limit_percent_100": limit_percentile.get(product_id),
            "priority_raw": score_map.get(product_id),
            "score_percent_100": score_percentile.get(product_id),
            "coverage_level": _level_from_sum(coverage_sum_map.get(product_id), coverage_qua1, coverage_qua3) if has_coverage_dimension else None,
            "limit_level": _level_from_sum(limit_sum_map.get(product_id), limit_qua1, limit_qua3) if has_limit_dimension else None,
            "has_coverage_dimension": has_coverage_dimension,
            "has_limit_dimension": has_limit_dimension,
            "qua1": qua1,
            "qua2": qua2,
            "qua3": qua3,
            "coverage_qua1": coverage_qua1,
            "coverage_qua2": coverage_qua2,
            "coverage_qua3": coverage_qua3,
            "limit_qua1": limit_qua1,
            "limit_qua2": limit_qua2,
            "limit_qua3": limit_qua3,
        }
        for product_id in score_map
    }


def _summary_from_signals(
    signals: List[dict],
    class_label: str,
    category_rule: Optional[dict],
    goal_type: Optional[str],
) -> dict:
    preferred = sorted(
        [s for s in signals if s["direction"] == "preferred"],
        key=lambda s: (s["quartile_score"], s["percentile_q"]),
        reverse=True,
    )
    restricted = sorted(
        [s for s in signals if s["direction"] == "restricted"],
        key=lambda s: (s["quartile_score"], s["percentile_q"]),
        reverse=True,
    )

    positive_factors = [_build_reason_factor(s, goal_type) for s in preferred[:3]]
    limiting_factors = [_build_reason_factor(s, goal_type) for s in restricted[:3]]
    positive_reasons = [factor["short_text"] for factor in positive_factors]
    limiting_reasons = [factor["short_text"] for factor in limiting_factors]

    parts = [f"Класс рекомендации: «{class_label}»."]
    if positive_factors:
        parts.append("На решение сильнее всего повлияли полезные нутриенты: " + "; ".join(f["short_text"] for f in positive_factors) + ".")
    if limiting_factors:
        parts.append("Ограничили рекомендацию прежде всего: " + "; ".join(f["short_text"] for f in limiting_factors) + ".")
    if category_rule:
        if category_rule["effect"] == "preferred":
            parts.append(
                f"Дополнительно продукт получил бонус, потому что относится к рекомендуемой {('подгруппе' if category_rule['scope'] == 'subtype' else 'группе')} «{category_rule['scope_name']}»."
            )
        else:
            parts.append(
                f"Дополнительно продукт получил штраф, потому что относится к ограничиваемой {('подгруппе' if category_rule['scope'] == 'subtype' else 'группе')} «{category_rule['scope_name']}»."
            )

    return {
        "positive_reasons": positive_reasons,
        "limiting_reasons": limiting_reasons,
        "positive_factors": positive_factors,
        "limiting_factors": limiting_factors,
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
    selected_product_ids: Optional[List[int]] = None,
) -> dict:
    if mode != "catalog":
        raise ValueError("Новый алгоритм рекомендаций сейчас поддерживает только режим просмотра продуктов.")

    del cart_id
    if comparison_mode not in COMPARISON_MODE_CHOICES:
        comparison_mode = COMPARISON_MODE_SUBGROUP

    profile = get_object_or_404(ConsumerProfile, pk=profile_id)
    goal = ensure_active_goal(profile)
    prefs = list(goal.nutrient_preferences.select_related("nutrient_code").all()) if goal else []
    prefs_by_code = {pref.nutrient_code_id: pref for pref in prefs}

    targets = compute_targets_for_profile(profile)
    targets_day = build_targets_day_from_profile_targets(targets)
    nutrient_rows = NutrientDictionary.objects.filter(is_active=True)
    nutrient_map = {n.code: n for n in nutrient_rows}
    active_roles = _build_active_roles(goal, prefs, nutrient_map)
    has_coverage_dimension = any(role == "preferred" for role in active_roles.values())
    has_limit_dimension = any(role == "restricted" for role in active_roles.values())

    if not has_coverage_dimension and not has_limit_dimension:
        raise ValueError("Для расчета рекомендаций нужно выбрать хотя бы одно пищевое вещество покрытия или лимитной нагрузки.")

    server_product_map: Dict[int, FoodProducts] = {}
    if local_products:
        universe_products = [item for item in local_products if isinstance(item, dict)]
        selected_ids = {
            int(pid) for pid in (selected_product_ids or [])
            if pid is not None
        }
        if comparison_mode == COMPARISON_MODE_SELECTED and selected_ids:
            source_products = [
                item for item in universe_products
                if _product_id(item) in selected_ids
            ]
        else:
            source_products = list(universe_products)
        if q and comparison_mode != COMPARISON_MODE_SELECTED:
            search = q.strip().lower()
            source_products = [item for item in source_products if search in str(_product_get(item, "name") or "").lower()]
        if subtype_id and comparison_mode != COMPARISON_MODE_SELECTED:
            source_products = [item for item in source_products if str(_product_get(item, "subtype_id", "subtypeId") or "") == str(subtype_id)]
        elif type_id and comparison_mode != COMPARISON_MODE_SELECTED:
            source_products = [item for item in source_products if str(_product_get(item, "type_id", "typeId") or "") == str(type_id)]
        products = source_products[:2000]

        server_ids = [
            pid for pid in {_product_id(item) for item in universe_products}
            if pid is not None and pid > 0
        ]
        if server_ids:
            server_products = (
                FoodProducts.objects.filter(id__in=server_ids)
                .select_related("subtype", "subtype__product_type")
                .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")
            )
            server_product_map = {product.id: product for product in server_products}
    else:
        selected_ids = {
            int(pid) for pid in (selected_product_ids or [])
            if pid is not None
        }
        if comparison_mode == COMPARISON_MODE_SELECTED and selected_ids:
            base_qs = FoodProducts.objects.filter(id__in=selected_ids)
        else:
            base_qs = FoodProducts.objects.all()
        if q and comparison_mode != COMPARISON_MODE_SELECTED:
            base_qs = base_qs.filter(name__icontains=q.strip())
        if subtype_id and comparison_mode != COMPARISON_MODE_SELECTED:
            base_qs = base_qs.filter(subtype_id=subtype_id)
        elif type_id and comparison_mode != COMPARISON_MODE_SELECTED:
            base_qs = base_qs.filter(subtype__product_type_id=type_id)

        products = list(
            base_qs.select_related("subtype", "subtype__product_type")
            .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")[:2000]
        )

        if comparison_mode in {COMPARISON_MODE_GLOBAL, COMPARISON_MODE_SELECTED}:
            universe_products = products
        elif comparison_mode == COMPARISON_MODE_TYPE and type_id:
            universe_products = list(
                FoodProducts.objects.filter(subtype__product_type_id=type_id)
                .select_related("subtype", "subtype__product_type")
                .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")
            )
        elif comparison_mode == COMPARISON_MODE_SUBGROUP and subtype_id:
            universe_products = list(
                FoodProducts.objects.filter(subtype_id=subtype_id)
                .select_related("subtype", "subtype__product_type")
                .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")
            )
        else:
            universe_products = list(
                FoodProducts.objects.all()
                .select_related("subtype", "subtype__product_type")
                .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")[:5000]
            )

    pools = _fetch_comparison_pools(
        universe_products=universe_products,
        comparison_mode=comparison_mode,
        selected_product_ids=selected_product_ids,
    )

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

        group_key = _comparison_group_key(product, comparison_mode)
        product_id = _product_id(product)
        metrics = group_metrics.get(group_key, {}).get(product_id, {})
        visible_signals = metrics.get("visible_signals", [])
        all_signals = metrics.get("signals", [])
        category_rule = metrics.get("category_rule")
        category_adjustment = metrics.get("category_adjustment", 0.0)
        coverage_sum = metrics.get("coverage_sum")
        limit_sum = metrics.get("limit_sum")
        coverage_percent_100 = metrics.get("coverage_percent_100")
        limit_percent_100 = metrics.get("limit_percent_100")
        coverage_level = metrics.get("coverage_level")
        limit_level = metrics.get("limit_level")
        priority_raw = metrics.get("priority_raw")
        score_percent_100 = metrics.get("score_percent_100")
        qua1 = metrics.get("qua1")
        qua2 = metrics.get("qua2")
        qua3 = metrics.get("qua3")
        class_code, class_label, color = _classify(priority_raw, qua1, qua3)
        summary = _summary_from_signals(
            signals=visible_signals,
            class_label=class_label,
            category_rule=category_rule,
            goal_type=getattr(goal, "goal_type", None),
        )

        reasons = []
        if summary["positive_reasons"]:
            reasons.append("Сильные стороны: " + "; ".join(summary["positive_reasons"]))
        if summary["limiting_reasons"]:
            reasons.append("Ограничивающие факторы: " + "; ".join(summary["limiting_reasons"]))
        if not reasons:
            reasons.append("По выбранному профилю активные нутриенты для расчёта не определены.")

        comparison_scope, comparison_id = group_key
        if comparison_scope == "global":
            comparison_name = "Текущая выборка"
        elif comparison_scope == "selected":
            comparison_name = "Выбранные продукты"
        elif comparison_scope == "subtype":
            comparison_name = _product_get(product, "subtype_name", "subtypeName")
        else:
            comparison_name = _product_get(product, "type_name", "typeName")
            if comparison_scope == "type" and not _is_mapping(product):
                comparison_name = getattr(getattr(product, "type", None), "name", None)

        score_components = {
            "index_s": priority_raw,
            "score_percent_100": score_percent_100,
            "percentile_score": None if score_percent_100 is None else score_percent_100 / 100.0,
            "priority_raw": priority_raw,
            "coverage_sum": coverage_sum,
            "limit_sum": limit_sum,
            "coverage_percent_100": coverage_percent_100,
            "limit_percent_100": limit_percent_100,
            "coverage_level": coverage_level,
            "limit_level": limit_level,
            "category_adjustment": category_adjustment,
            "qua1": qua1,
            "qua2": qua2,
            "qua3": qua3,
            "final_score": None if score_percent_100 is None else score_percent_100 / 100.0,
            "base_score": priority_raw,
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
                for signal in all_signals
                if signal["source"] == "user"
            ],
            "score_components": score_components,
            "explain": {
                "class_code": class_code,
                "class_label": class_label,
                "color": color,
                "score_index_s": priority_raw,
                "score_percent_100": score_percent_100,
                "coverage_percent_100": coverage_percent_100,
                "limit_percent_100": limit_percent_100,
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
                "active_nutrients_count": len(all_signals),
                "signals": visible_signals,
                "base_signals": all_signals,
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
                "score_breakdown": {
                    "coverage_sum": coverage_sum,
                    "limit_sum": limit_sum,
                    "coverage_percent_100": coverage_percent_100,
                    "limit_percent_100": limit_percent_100,
                    "coverage_level": coverage_level,
                    "limit_level": limit_level,
                    "category_adjustment": category_adjustment,
                    "priority_raw": priority_raw,
                },
                "method": {
                    "basis": "coverage_minus_limit_quartile_model",
                    "percentile_formula": "Q = (count_less + 0.5 * count_equal) / count_known",
                    "nutrient_score_formula": "quartile_score = 1..4 by direct comparison of nutrient share with Qua1/Qua2/Qua3 inside comparison set",
                    "coverage_formula": "coverage_sum = sum(quartile_score for preferred nutrients)",
                    "limit_formula": "limit_sum = sum(quartile_score for restricted nutrients)",
                    "category_formula": "category_adjustment = +/- scope_weight, where subtype=2 and type=1",
                    "score_formula": (
                        "priority_raw = coverage_sum - limit_sum + category_adjustment"
                        if has_coverage_dimension and has_limit_dimension
                        else ("priority_raw = coverage_sum + category_adjustment" if has_coverage_dimension else "priority_raw = -limit_sum + category_adjustment")
                    ),
                    "class_formula": "best_fit if priority_raw >= Qua3; limited_fit if Qua1 < priority_raw < Qua3; not_recommended if priority_raw <= Qua1",
                },
                "dimensions": {
                    "has_coverage_dimension": has_coverage_dimension,
                    "has_limit_dimension": has_limit_dimension,
                },
                "comparison_mode": comparison_mode,
                "filters": {
                    "q": q or "",
                    "type_id": type_id,
                    "subtype_id": subtype_id,
                    "selected_product_ids": selected_product_ids or [],
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
        "has_coverage_dimension": has_coverage_dimension,
        "has_limit_dimension": has_limit_dimension,
        "count": min(len(items), limit),
        "items": items[:limit],
    }
