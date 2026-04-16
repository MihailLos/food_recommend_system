from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from django.db.models import Prefetch
from django.shortcuts import get_object_or_404

from catalog.utils.allergens import get_allergens_for_product
from catalog.utils.child_rules import pick_not_child_rule

from catalog.models import FoodProducts, ConsumerProfile, ConsumerGoal, GoalNutrientPreference, NutrientDictionary
from catalog.models import NutrientStats, Cart, CartItem
from catalog.utils.targets import compute_targets_for_profile

ADULT_SODIUM_NORM_MG_DAY = 1300.0
SALT_EQUIVALENT_FACTOR = 2.5

@dataclass
class ColorResult:
    color: str  # green|yellow|red|blocked
    reasons: List[str]

@dataclass
class BaseSignal:
    code: str                      # "energy_kcal", "fats_g", ...
    value_100g: Optional[float]
    target_day: Optional[float]
    share: Optional[float]         # value_100g / target_day
    share_pct: Optional[float]     # share*100
    level: Optional[str]           # "low" | "medium" | "high" | None

def clamp01(x: float) -> float:
    if x < 0:
        return 0.0
    if x > 1:
        return 1.0
    return x

def score_more(share: Optional[float], good_share: float) -> Optional[float]:
    if share is None or good_share <= 0:
        return None
    return clamp01(float(share) / float(good_share))


def score_less(share: Optional[float], max_share: float) -> Optional[float]:
    if share is None or max_share <= 0:
        return None
    return clamp01(1.0 - float(share) / float(max_share))


def shares_100g(base: Dict[str, Optional[float]], targets_day: Dict[str, float]) -> Dict[str, Optional[float]]:
    out: Dict[str, Optional[float]] = {}
    for code, v in base.items():
        day_key = {
            "energy_kcal": "energy_kcal_day",
            "protein_g": "protein_g_day",
            "fats_g": "fat_g_day",
            "carbs_g": "carb_g_day",
            "na_mg": "na_mg_day",
            "nlc_g": "nlc_g_day",
        }.get(code)
        if not day_key:
            out[code] = None
            continue
        day = targets_day.get(day_key)
        if v is None or day in (None, 0):
            out[code] = None
        else:
            out[code] = float(v) / float(day)
    return out

BASE_DAY_KEYS = {
    "energy_kcal": "energy_kcal_day",
    "protein_g": "protein_g_day",
    "fats_g": "fat_g_day",
    "carbs_g": "carb_g_day",
    "na_mg": "na_mg_day",
    "nlc_g": "nlc_g_day",
}

def base_score_personal(goal_type: Optional[str], base: Dict[str, Optional[float]], targets_day: Dict[str, float]) -> Tuple[float, List[dict]]:
    sh = shares_100g(base, targets_day)
    matched: List[dict] = []

    energy_s = score_less(sh.get("energy_kcal"), 0.10)
    fat_s = score_less(sh.get("fats_g"), 0.10)
    carb_s = score_less(sh.get("carbs_g"), 0.10)
    na_s = score_less(sh.get("na_mg"), 0.10)
    prot_s = score_more(sh.get("protein_g"), 0.10)

    weights = []
    parts = []

    def add(code: str, direction: str, s: Optional[float], w: float):
        matched.append({
            "code": code, 
            "direction": direction, 
            "share": sh.get(code), 
            "weight": w,
            "value": base.get(code),
            "norm": sh.get(code),
            "contrib": None if s is None else w * s
        })
        if s is None:
            return
        weights.append(w)
        parts.append(w * s)

    if goal_type == "lose_weight":
        add("energy_kcal", "less", energy_s, 3.0)
        add("fats_g", "less", fat_s, 2.0)
        add("carbs_g", "less", carb_s, 2.0)
        add("na_mg", "less", na_s, 1.0)
        add("protein_g", "more", prot_s, 2.0)
    elif goal_type == "gain_muscle":
        add("energy_kcal", "more", score_more(sh.get("energy_kcal"), 0.15), 2.0)
        add("protein_g", "more", prot_s, 3.0)
        add("na_mg", "less", na_s, 1.0)
        add("fats_g", "less", score_less(sh.get("fats_g"), 0.15), 1.0)
    else:
        add("energy_kcal", "less", energy_s, 2.0)
        add("na_mg", "less", na_s, 1.0)
        add("protein_g", "more", prot_s, 1.0)

    if not weights:
        return 0.0, matched
    return float(sum(parts) / sum(weights)), matched


def pref_score_personal(
    prefs: List[GoalNutrientPreference],
    product: FoodProducts,
    stats_map: Dict[str, NutrientStats],
) -> Tuple[float, List[dict]]:
    """
    Score user nutrient preferences using p05/p95 normalization (like preference_score_goal),
    and return matched list with value/norm/contrib filled.
    """
    if not prefs:
        return 0.0, []

    raw = [priority_weight(getattr(p, "priority", None)) for p in prefs]
    s = sum(raw) or 1.0
    weights = [w / s for w in raw]

    total = 0.0
    matched: List[dict] = []

    for pref, w in zip(prefs, weights):
        nd: NutrientDictionary = pref.nutrient_code
        code = nd.code
        direction = (pref.direction or "").strip().lower()

        related = getattr(product, nd.source_group, None)
        x = None
        if related is not None:
            x = getattr(related, nd.source_field, None)
        value = float(x) if x is not None else None

        st = stats_map.get(code)
        xn = norm_p05_p95(value, st.p05 if st else None, st.p95 if st else None)

        if xn is None:
            contrib = None
        else:
            contrib = w * (xn if direction == "more" else (1.0 - xn))
            total += contrib

        matched.append(
            dict(
                code=code,
                runame=getattr(nd, "ru_name", None),
                direction=direction,
                priority=pref.priority,
                weight=w,
                value=value,
                norm=xn,
                contrib=contrib,
                has_stats=bool(st and getattr(st, "n", 0) > 0),
                stats_n=getattr(st, "n", 0) if st else 0,
            )
        )

    return float(total), matched

def norm_p05_p95(x: Optional[float], p05: Optional[float], p95: Optional[float]) -> Optional[float]:
    if x is None or p05 is None or p95 is None:
        return None
    if p95 == p05:
        return 1.0 if x >= p95 else 0.0
    return clamp01((x - p05) / (p95 - p05))

def priority_weight(priority: Optional[int]) -> float:
    # 1 (самый важный) -> 3, 2 -> 2, 3 -> 1
    if priority is None:
        return 1.0
    p = int(priority)
    if p <= 1:
        return 3.0
    if p == 2:
        return 2.0
    return 1.0

def get_base_nutrients(p: FoodProducts) -> Dict[str, Optional[float]]:
    macros = getattr(p, "macros", None)
    minerals = getattr(p, "minerals", None)
    fatacids = getattr(p, "fat_acids", None)

    return {
        "protein_g": float(getattr(macros, "protein_g_field", None)) if macros and getattr(macros, "protein_g_field", None) is not None else None,
        "fats_g": float(getattr(macros, "fats_g_field", None)) if macros and getattr(macros, "fats_g_field", None) is not None else None,
        "carbs_g": float(getattr(macros, "carbs_g_field", None)) if macros and getattr(macros, "carbs_g_field", None) is not None else None,
        "energy_kcal": float(getattr(macros, "energy_value_kcal_field", None)) if macros and getattr(macros, "energy_value_kcal_field", None) is not None else None,
        "na_mg": float(getattr(minerals, "na_mg_field", None)) if minerals and getattr(minerals, "na_mg_field", None) is not None else None,
        "nlc_g": float(getattr(fatacids, "nlc_g_field", None)) if fatacids and getattr(fatacids, "nlc_g_field", None) is not None else None,
    }

def level_by_share(share: Optional[float]) -> Optional[str]:
    if share is None:
        return None
    if share >= 0.25:
        return "high"
    if share >= 0.10:
        return "medium"
    return "low"

def make_base_signals(base: Dict[str, Optional[float]], targetsday: Dict[str, float]) -> List[dict]:
    sh = shares_100g(base, targetsday)  # доли value_100g/target_day (0..inf)
    out = []
    for code, daykey in [
        ("energy_kcal", "energy_kcal_day"),
        ("protein_g", "protein_g_day"),
        ("fats_g", "fat_g_day"),
        ("carbs_g", "carb_g_day"),
        ("na_mg", "na_mg_day"),
    ]:
        share = sh.get(code)  # 0..inf или None
        out.append({
            "code": code,
            "value_100g": base.get(code),
            "target_day": targetsday.get(daykey),
            "share_pct": None if share is None else float(share) * 100.0,
            "level": level_by_share(share),
        })
    return out


def build_base_signals(
    base: Dict[str, Optional[float]],
    targets_day: Dict[str, float],
) -> List[BaseSignal]:
    out: List[BaseSignal] = []
    for code, day_key in BASE_DAY_KEYS.items():
        v = base.get(code)
        day = targets_day.get(day_key)

        if v is None or day in (None, 0):
            share = None
            share_pct = None
            level = None
        else:
            share = float(v) / float(day)
            share_pct = share * 100.0
            level = level_by_share(share)

        out.append(
            BaseSignal(
                code=code,
                value_100g=v if v is None else float(v),
                target_day=None if day in (None, 0) else float(day),
                share=share,
                share_pct=share_pct,
                level=level,
            )
        )
    return out


def traffic_color_base_personal(base: Dict[str, Optional[float]], targets_day: Dict[str, float]) -> ColorResult:
    reasons: List[str] = []
    levels: Dict[str, Optional[str]] = {}

    def add(code: str, value_100g: Optional[float], day_limit: Optional[float]):
        if value_100g is None or day_limit is None or day_limit == 0:
            levels[code] = None
            reasons.append(f"{code}: no_data")
            return
        share = float(value_100g) / float(day_limit)
        lv = level_by_share(share)
        levels[code] = lv
        reasons.append(f"{code}: {lv} ({share*100:.1f}%/100g)")

    add("energy_kcal", base.get("energy_kcal"), targets_day.get("energy_kcal_day"))
    add("fats_g", base.get("fats_g"), targets_day.get("fat_g_day"))
    add("carbs_g", base.get("carbs_g"), targets_day.get("carb_g_day"))
    add("na_mg", base.get("na_mg"), targets_day.get("na_mg_day"))

    if any(lv == "high" for lv in levels.values() if lv):
        return ColorResult(color="red", reasons=reasons)
    if any(lv == "medium" for lv in levels.values() if lv):
        return ColorResult(color="yellow", reasons=reasons)
    return ColorResult(color="green", reasons=reasons)

def color_rank(c: Optional[str]) -> int:
    order = {"green": 0, "yellow": 1, "red": 2, "blocked": 3, None: -1}
    return order.get(c, 9)


def worse_color(a: str, b: Optional[str]) -> str:
    if b is None:
        return a
    return a if color_rank(a) >= color_rank(b) else b


def pref_color_from_matched(matched: List[dict]) -> Tuple[Optional[str], List[str]]:
    """
    Персональный цвет: насколько продукт НЕ соответствует предпочтениям.
    Использует norm (0..1) и weight. None не учитываем.
    """
    if not matched:
        return None, []

    penalties = []
    total_w = 0.0

    for m in matched:
        xn = m.get("norm", None)
        w = float(m.get("weight", 0.0) or 0.0)
        direction = (m.get("direction") or "").strip().lower()

        if xn is None or w <= 0:
            continue

        # penalty: 0 хорошо, 1 плохо
        if direction == "less":
            pen = float(xn)          # чем больше нутриента, тем хуже
        else:  # "more"
            pen = 1.0 - float(xn)    # чем меньше нутриента, тем хуже

        penalties.append((w, pen))
        total_w += w

    if total_w <= 0:
        return None, ["preferences: no_data"]

    pref_penalty = sum(w * pen for w, pen in penalties) / total_w

    # coverage относительно общего числа preferences (включая те, где norm=None)
    coverage = len(penalties) / max(1, len(matched))

    reasons = [f"preferences_penalty: {pref_penalty:.3f}", f"preferences_coverage: {coverage:.2f}"]

    # если данных мало — не красим в red, максимум yellow + reason
    if coverage < 0.5:
        return "yellow", reasons + ["preferences: insufficient_data"]

    if pref_penalty >= 0.66:
        return "red", reasons
    if pref_penalty >= 0.33:
        return "yellow", reasons
    return "green", reasons

def preference_score(goal: Optional[ConsumerGoal], product: FoodProducts, stats_map: Dict[str, NutrientStats]) -> Tuple[float, List[dict]]:
    if not goal:
        return 0.0, []

    prefs = list(goal.nutrient_preferences.select_related("nutrient_code").all())
    if not prefs:
        return 0.0, []

    # raw weights -> normalized
    raw = [priority_weight(p.priority) for p in prefs]
    s = sum(raw) or 1.0
    weights = [w / s for w in raw]

    matched = []
    total = 0.0

    for pref, w in zip(prefs, weights):
        nd: NutrientDictionary = pref.nutrient_code
        # достаём значение нутриента через sourcegroup/sourcefield
        related = getattr(product, nd.source_group, None)
        x = None
        if related is not None:
            x = getattr(related, nd.source_field, None)
            x = float(x) if x is not None else None

        st = stats_map.get(nd.code)
        xn = norm_p05_p95(x, st.p05 if st else None, st.p95 if st else None)

        if xn is None:
            contrib = 0.0
        else:
            if pref.direction == "more":
                contrib = w * xn
            else:  # "less"
                contrib = w * (1.0 - xn)

        total += contrib
        matched.append({
            "code": nd.code,
            "ru_name": nd.ru_name,
            "direction": pref.direction,
            "priority": pref.priority,
            "value": x,
            "norm": xn,
            "weight": w,
            "contrib": contrib,
            "has_stats": bool(st and st.n > 0),
            "stats_n": st.n if st else 0,
        })

    return float(total), matched

def is_blocked(profile: ConsumerProfile, product: FoodProducts) -> Tuple[bool, List[str]]:
    # Аллергены
    prod_allergens = get_allergens_for_product(product)  # у вас возвращает список аллергенов/правил
    profile_allergen_ids = set(profile.profile_allergens.values_list("allergen_id", flat=True))
    prod_allergen_ids = set()
    for a in prod_allergens:
        # если getallergensforproduct возвращает dict/obj - адаптируйте
        if isinstance(a, dict) and "id" in a:
            prod_allergen_ids.add(int(a["id"]))
        elif hasattr(a, "id"):
            prod_allergen_ids.add(int(a.id))

    if profile_allergen_ids & prod_allergen_ids:
        return True, ["Аллерген профиля присутствует в продукте"]

    # Детские ограничения
    if profile.has_minor_children:
        rule, _level = pick_not_child_rule(product)
        if rule is not None:
            return True, ["Запрещено для детского питания по правилам NotChildProducts"]

    return False, []

def build_targets_day_from_profile_targets(targets: Dict) -> Dict[str, float]:
    out = {
        "energy_kcal_day": float(targets["target_energy_kcal_day"]),
        "protein_g_day": float(targets["target_macros_g_day"]["protein_g"]),
        "fat_g_day": float(targets["target_macros_g_day"]["fat_g"]),
        "carb_g_day": float(targets["target_macros_g_day"]["carb_g"]),
    }

    # натрий: сначала пытаемся взять из target_minerals_day, потом fallback
    minerals = targets.get("target_minerals_day") or {}
    na = minerals.get("Na") or minerals.get("Натрий") or minerals.get("na_mg")

    out["na_mg_day"] = float(na) if na not in (None, "", 0) else ADULT_SODIUM_NORM_MG_DAY
    out["salt_eq_g_day"] = round((out["na_mg_day"] / 1000.0) * SALT_EQUIVALENT_FACTOR, 2)

    # насыщенные жирные кислоты: пока fallback, если в targets их ещё нет
    nlc = targets.get("target_fat_acids_day", {}).get("nlc_g")
    if nlc not in (None, "", 0):
        out["nlc_g_day"] = float(nlc)
    else:
        # временный безопасный fallback
        out["nlc_g_day"] = round(out["energy_kcal_day"] * 0.10 / 9.0, 2)

    return out

def recommend(
        profile_id: int, 
        mode: str, 
        cart_id: Optional[int] = None, 
        limit: int = 50,
        q: Optional[str] = None,
        type_id: Optional[int] = None,
        subtype_id: Optional[int] = None,
    ) -> dict:
    profile = get_object_or_404(ConsumerProfile, pk=profile_id)
    goal = ConsumerGoal.objects.filter(profile=profile, is_active=True).order_by("-id").first()

    stats_rows = NutrientStats.objects.all()
    stats_map = {s.nutrient_code: s for s in stats_rows}

    targets = compute_targets_for_profile(profile)
    targets_day = build_targets_day_from_profile_targets(targets)

    if mode == "cart":
        if not cart_id:
            raise ValueError("cart is required for mode=cart")
        if profile.user_id is None:
            raise ValueError("cart mode requires a profile linked to a user")
        cart = get_object_or_404(Cart, pk=cart_id, user=profile.user_id)
        ids = list(CartItem.objects.filter(cart=cart.id).values_list("food_product_id", flat=True))
        qs = FoodProducts.objects.filter(id__in=ids)
    else:
        qs = FoodProducts.objects.all()

        if q:
            qs = qs.filter(name__icontains=q.strip())

        if subtype_id:
            qs = qs.filter(subtype_id=subtype_id)
        elif type_id:
            qs = qs.filter(subtype__product_type_id=type_id)

    qs = qs.select_related("subtype", "subtype__product_type").prefetch_related(
        "macros", "minerals", "vitamins", "other_nutrients", "fat_acids"
    )

    items = []
    for p in qs[:2000]:
        blocked, block_reasons = is_blocked(profile, p)
        if blocked:
            items.append({
                "product": {
                    "id": p.id, 
                    "name": p.name, 
                    "subtype_id": p.subtype.id,
                    "subtype_name": p.subtype.name,
                    "type_id": p.type.id,
                    "type_name": p.type.name
                },
                "color": "blocked",
                "reasons": block_reasons,
                "preference_score": 0.0,
                "matched_preferences": [],
            })
            continue

        base = get_base_nutrients(p)
        base_color = traffic_color_base_personal(base, targets_day)
        base_score, base_matched = base_score_personal(goal.goal_type if goal else None, base, targets_day)

        prefs = list(goal.nutrient_preferences.select_related("nutrient_code").all()) if goal else []
        if prefs:
            pref_score, pref_matched = pref_score_personal(prefs, p, stats_map)
            final_score = 0.6 * base_score + 0.4 * pref_score
        else:
            pref_score, pref_matched = 0.0, []
            final_score = base_score

        matched = base_matched + pref_matched
        pref_color, pref_reasons = pref_color_from_matched(pref_matched)
        final_color = worse_color(base_color.color, pref_color)

        reasons = list(base_color.reasons)
        if pref_color is not None:
            reasons.append(f"pref_color: {pref_color}")
            reasons.extend(pref_reasons)

        signals = build_base_signals(base, targets_day)

        items.append({
            "product": {
                "id": p.id, 
                "name": p.name, 
                "subtype_id": p.subtype.id,
                "subtype_name": p.subtype.name,
                "type_id": p.type.id,
                "type_name": p.type.name
            },
            "color": final_color,
            "reasons": reasons,
            "preference_score": float(final_score or 0.0),
            "score_components": {
                "base_score": float(base_score),
                "preference_score": float(pref_score),
                "final_score": float(final_score),
            },
            "matched_preferences": matched,
            "explain": {
                "score": float(final_score),
                "color": final_color,
                "score_components": {
                    "base_score": float(base_score),
                    "preference_score": float(pref_score),
                    "final_score": float(final_score),
                },
                "base_signals": [
                    {
                        "code": s.code,
                        "value_100g": s.value_100g,
                        "target_day": s.target_day,
                        "share": s.share,
                        "share_pct": s.share_pct,
                        "level": s.level,
                    }
                    for s in signals
                ],
                "targets_day": {
                    "energy_kcal": targets_day.get("energy_kcal_day"),
                    "protein_g": targets_day.get("protein_g_day"),
                    "fats_g": targets_day.get("fat_g_day"),
                    "carbs_g": targets_day.get("carb_g_day"),
                    "na_mg": targets_day.get("na_mg_day"),
                    "salt_eq_g": targets_day.get("salt_eq_g_day"),
                    "nlc_g": targets_day.get("nlc_g_day"),
                },
                "targets_meta": {
                    "macros_mode": targets.get("macros_mode"),
                    "goal_type": targets.get("goal_type"),
                    "energy_delta_kcal": targets.get("energy_delta_kcal"),
                    "has_vitamins_targets": bool(targets.get("target_vitamins_day")),
                    "has_minerals_targets": bool(targets.get("target_minerals_day")),
                },
                "method": {
                    "basis": "per_100g_vs_daily_targets_from_profile_and_mr",
                    "share_formula": "share = value_100g / target_day",
                    "level_thresholds": {"low": "<10%", "medium": "10-25%", "high": ">=25%"},
                    "scoring": {
                        "less": "clamp01(1 - share/0.10)",
                        "more": "clamp01(share/0.10)",
                        "final": "0.6*base_score + 0.4*preference_score (if prefs else base_score)",
                    },
                },
                "filters": {
                    "q": q or "",
                    "type_id": type_id,
                    "subtype_id": subtype_id,
                },
                "catalog_scope": {
                    "filtered": True,
                    "mode": "catalog_search"
                }
            },
        })

    items.sort(key=lambda x: (-float(x.get("preference_score") or 0.0), x["product"]["name"]))
    return {
        "profile_id": profile.id,
        "goal_id": goal.id if goal else None,
        "mode": mode,
        "count": min(len(items), limit),
        "items": items[:limit],
    }
