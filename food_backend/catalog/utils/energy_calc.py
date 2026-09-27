from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

from catalog.models import ConsumerProfile


@dataclass(frozen=True)
class EnergyCalcResult:
    sex: str
    age_years: int
    weight_kg: float
    height_cm: float
    work_group_id: int

    bmr_kcal_day: float
    kfa: float
    tdee_kcal_day: float

    calc_mode: str
    calc_mode_label: str
    bmr_description: str
    tdee_description: str
    bmr_formula_text: str
    tdee_formula_text: str


def calculate_bmr(sex: str, age_years: int, weight_kg: float, height_cm: float) -> Tuple[float, dict]:
    """Рассчитывает ВОО по формуле из методики."""
    sex = str(sex)
    if sex not in ("male", "female"):
        raise ValueError("sex must be 'male' or 'female'.")

    weight = float(weight_kg)
    height = float(height_cm)
    age = int(age_years)
    if weight <= 0 or height <= 0 or age <= 0:
        raise ValueError("Weight, height, and age must be positive for BMR calculation.")

    sex_constant = 5.0 if sex == "male" else -161.0
    bmr = 9.99 * weight + 6.25 * height - 4.92 * age + sex_constant

    debug = {
        "weight_coefficient": 9.99,
        "height_coefficient": 6.25,
        "age_coefficient": -4.92,
        "sex_constant": sex_constant,
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
    height_cm = float(profile.height_cm)

    # BMR
    bmr, _debug = calculate_bmr(
        sex=sex,
        age_years=age_years,
        weight_kg=weight_kg,
        height_cm=height_cm,
    )

    # KFA из группы труда: FK на WorkActivityGroup.
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
        height_cm=height_cm,
        work_group_id=int(wg.id),

        bmr_kcal_day=float(round(bmr, 2)),
        kfa=float(kfa),
        tdee_kcal_day=float(round(tdee, 2)),

        calc_mode="formula",
        calc_mode_label="Расчёт по формуле ВОО",
        bmr_description="Количество энергии для поддержания жизненно важных функций организма в состоянии покоя.",
        tdee_description="Суточные энерготраты организма, рассчитанные ускоренным способом как произведение основного обмена и коэффициента физической активности.",
        bmr_formula_text=(
            "BMR = 9,99 × масса тела (кг) + 6,25 × рост (см) − 4,92 × возраст (лет) "
            + ("+ 5" if sex == "male" else "− 161")
        ),
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
