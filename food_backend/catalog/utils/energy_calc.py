from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional, Tuple

from catalog.models import BmrNorm, ConsumerProfile


@dataclass(frozen=True)
class EnergyCalcResult:
    sex: str
    age_years: int
    weight_kg: float
    work_group_id: int

    age_min: int
    age_max: int
    w_left: int
    w_right: int
    bmr_left: int
    bmr_right: int

    bmr_kcal_day: float
    kfa: float
    tdee_kcal_day: float

    calc_mode: str
    calc_mode_label: str
    bmr_description: str
    tdee_description: str
    bmr_formula_text: str
    tdee_formula_text: str


# --- Вспомогательные функции ---

def _clip_age_for_table(age_years: int) -> int:
    """
    Таблица до 74. Правило: >74 клиппируем.
    """
    return min(age_years, 74)


def _get_age_band(sex: str, age_years: int) -> Tuple[int, int]:
    """
    Возвращает (age_min, age_max), которые есть в bmr_norms.
    """
    age = _clip_age_for_table(age_years)

    # Находим первую строку, чей интервал покрывает возраст
    row = (
        BmrNorm.objects
        .filter(sex=sex, age_min__lte=age, age_max__gte=age)
        .order_by("age_min", "age_max")
        .first()
    )
    if not row:
        raise ValueError(f"No BMR age band found for sex={sex} age={age} (check bmr_norms).")
    return int(row.age_min), int(row.age_max)


def _get_weight_range_for_band(
    sex: str,
    age_min: int,
    age_max: int,
) -> Tuple[int, int]:
    """
    Возвращает min/max узлов веса для выбранного диапазона (напр. 50..90).
    """
    qs = BmrNorm.objects.filter(sex=sex, age_min=age_min, age_max=age_max)
    if not qs.exists():
        raise ValueError(f"No BMR norms for sex={sex} band={age_min}-{age_max}.")
    w_min = qs.order_by("weight_kg").values_list("weight_kg", flat=True).first()
    w_max = qs.order_by("-weight_kg").values_list("weight_kg", flat=True).first()
    return int(w_min), int(w_max)


def _pick_neighbor_weights(
    sex: str,
    age_min: int,
    age_max: int,
    weight_kg: float,
) -> Tuple[int, int]:
    """
    Берём два соседних узла веса (w_left, w_right) внутри диапазона.
    Если вес вне диапазона таблицы — клиппируем к ближайшему узлу (оба узла одинаковые).
    """
    w_min, w_max = _get_weight_range_for_band(sex, age_min, age_max)

    w = float(weight_kg)
    if w <= w_min:
        return w_min, w_min
    if w >= w_max:
        return w_max, w_max

    # left = максимальный узел <= вес
    w_left = (
        BmrNorm.objects
        .filter(sex=sex, age_min=age_min, age_max=age_max, weight_kg__lte=w)
        .order_by("-weight_kg")
        .values_list("weight_kg", flat=True)
        .first()
    )
    # right = минимальный узел >= вес
    w_right = (
        BmrNorm.objects
        .filter(sex=sex, age_min=age_min, age_max=age_max, weight_kg__gte=w)
        .order_by("weight_kg")
        .values_list("weight_kg", flat=True)
        .first()
    )
    if w_left is None or w_right is None:
        raise ValueError("Failed to pick neighbor weights (check bmr_norms weight grid).")

    return int(w_left), int(w_right)


def _get_bmr_at_node(sex: str, age_min: int, age_max: int, weight_node: int) -> int:
    row = (
        BmrNorm.objects
        .filter(sex=sex, age_min=age_min, age_max=age_max, weight_kg=weight_node)
        .first()
    )
    if not row:
        raise ValueError(f"No BMR node for sex={sex} band={age_min}-{age_max} weight={weight_node}.")
    return int(row.bmr_kcal_day)


def _lerp(x: float, x0: float, x1: float, y0: float, y1: float) -> float:
    """
    Линейная интерполяция.
    """
    if x0 == x1:
        return float(y0)
    t = (x - x0) / (x1 - x0)
    return float(y0) + t * (float(y1) - float(y0))


# --- Основные публичные функции ---

def calculate_bmr(sex: str, age_years: int, weight_kg: float) -> Tuple[float, dict]:
    """
    Возвращает:
    - bmr_kcal_day (float)
    - debug dict: выбранный интервал, узлы веса и значения на узлах
    """
    sex = str(sex)
    if sex not in ("male", "female"):
        raise ValueError("sex must be 'male' or 'female'.")

    age_min, age_max = _get_age_band(sex, age_years)
    w_left, w_right = _pick_neighbor_weights(sex, age_min, age_max, float(weight_kg))

    bmr_left = _get_bmr_at_node(sex, age_min, age_max, w_left)
    bmr_right = _get_bmr_at_node(sex, age_min, age_max, w_right)

    bmr = _lerp(float(weight_kg), float(w_left), float(w_right), bmr_left, bmr_right)

    debug = {
        "age_min": age_min,
        "age_max": age_max,
        "w_left": w_left,
        "w_right": w_right,
        "bmr_left": bmr_left,
        "bmr_right": bmr_right,
    }
    return float(bmr), debug


def calculate_tdee_for_profile(profile: ConsumerProfile) -> EnergyCalcResult:
    """
    Главная функция: считаем BMR и TDEE для конкретного профиля.
    """
    if profile.age_years < 18:
        raise ValueError("Adult profile only: age must be >= 18 (child profiles later).")

    sex = profile.sex
    age_years = int(profile.age_years)
    weight_kg = float(profile.weight_kg)

    # BMR
    bmr, dbg = calculate_bmr(sex=sex, age_years=age_years, weight_kg=weight_kg)

    # KFA из группы труда (у тебя FK на WorkActivityGroup)
    wg = profile.work_group
    # Важно: KFA в таблице может быть Decimal. Приводим к float.
    if sex == "male":
        kfa_val = wg.kfa_male
    else:
        kfa_val = wg.kfa_female

    if kfa_val is None:
        # например: женщина выбрала V группу (UI должен скрывать, но на всякий)
        raise ValueError("Selected work group has no KFA for this sex.")

    kfa = float(kfa_val)

    tdee = bmr * kfa

    return EnergyCalcResult(
        sex=sex,
        age_years=age_years,
        weight_kg=weight_kg,
        work_group_id=int(wg.id),

        age_min=int(dbg["age_min"]),
        age_max=int(dbg["age_max"]),
        w_left=int(dbg["w_left"]),
        w_right=int(dbg["w_right"]),
        bmr_left=int(dbg["bmr_left"]),
        bmr_right=int(dbg["bmr_right"]),

        bmr_kcal_day=float(round(bmr, 2)),
        kfa=float(kfa),
        tdee_kcal_day=float(round(tdee, 2)),

        calc_mode="auto_fast",
        calc_mode_label="Ускоренный расчёт",
        bmr_description="Количество энергии для поддержания жизненно важных функций организма в состоянии покоя.",
        tdee_description="Суточные энерготраты организма, рассчитанные ускоренным способом как произведение основного обмена и коэффициента физической активности.",
        bmr_formula_text="BMR определяется по табличным нормам с интерполяцией по массе тела.",
        tdee_formula_text="TDEE = BMR × KFA",
    )


def calculate_bmi(height_cm: int, weight_kg: float) -> Optional[float]:
    """
    ИМТ = кг / (м^2). Если данных нет — None.
    """
    if height_cm is None or weight_kg is None:
        return None
    h_m = float(height_cm) / 100.0
    if h_m <= 0:
        return None
    bmi = float(weight_kg) / (h_m * h_m)
    return float(round(bmi, 2))

def calculate_bmi_info(height_cm: int, weight_kg: float) -> dict:
    bmi = calculate_bmi(height_cm, weight_kg)
    if bmi is None:
        return {
            "value": None,
            "status": "unknown",
            "label": "Недостаточно данных",
            "color": "gray",
        }

    if bmi < 18.5:
        return {
            "value": bmi,
            "status": "underweight",
            "label": "Недостаточная масса тела",
            "color": "yellow",
        }
    if bmi < 25:
        return {
            "value": bmi,
            "status": "normal",
            "label": "Нормальная масса тела",
            "color": "green",
        }
    if bmi < 30:
        return {
            "value": bmi,
            "status": "overweight",
            "label": "Избыточная масса тела",
            "color": "yellow",
        }
    return {
        "value": bmi,
        "status": "obesity",
        "label": "Ожирение",
        "color": "red",
    }