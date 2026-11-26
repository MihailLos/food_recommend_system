from decimal import Decimal

from catalog.models import Macronutrients, Minerals, OtherNutrients, Vitamins
from catalog.services.processing_calc import LOSS_FIELD_BY_NUTRIENT, pick_processing_rule


COMPOSITION_MODELS = {
    "macros": Macronutrients,
    "minerals": Minerals,
    "other_nutrients": OtherNutrients,
    "vitamins": Vitamins,
}
DRY_LOSS_FIELDS = tuple(
    key for key in LOSS_FIELD_BY_NUTRIENT.values() if key not in {"water", "energy_value"}
)


def reference_composition(product):
    composition = {}
    for relation, model in COMPOSITION_MODELS.items():
        fields = {
            field: key for (source, field), key in LOSS_FIELD_BY_NUTRIENT.items()
            if source == relation and key != "energy_value"
        }
        for row in model.objects.filter(food_product=product).values(*fields):
            for field, value in row.items():
                if value is None:
                    continue
                grams = Decimal(str(value))
                if field.endswith("_mg_field"):
                    grams /= 1000
                composition.setdefault(fields[field], set()).add(grams)
    return composition


def build_reference_comparisons(record):
    groups = [(record.analyses, (), record.weight_g, False)]
    groups.extend((heat.analyses, (heat.cpt,), heat.weight_g, heat.uses_oil) for heat in record.heating)
    for prep in record.preprocessing:
        groups.append((prep.analyses, (prep.cpt,), prep.weight_g, False))
        groups.extend((heat.analyses, (prep.cpt, heat.cpt), heat.weight_g, heat.uses_oil) for heat in prep.heating)
    if not any(analyses for analyses, _, _, _ in groups):
        return []

    product = record.analyzed_product.manual
    composition = reference_composition(product) if product is not None and not product.is_complex else {}
    rules = {}
    comparisons = []
    for analyses, steps, sample_weight, uses_oil in groups:
        if not analyses:
            continue
        reference = calculate_reference(product, composition, steps, rules)
        reference["sample_weight_g"] = sample_weight
        percent = reference["reference_pct"]
        reference["reference_sample_dry_matter_g"] = sample_weight * percent / 100 if percent is not None else None
        comparisons.extend(compare_analysis(analysis, uses_oil, reference) for analysis in analyses)
    return comparisons


def calculate_reference(product, composition, steps, rules):
    result = {
        "product_name": product.name if product else None,
        "applied_steps": [],
        "skipped_steps": [],
        "reference_pct": None,
        "reason": None,
    }
    if product is None:
        result["reason"] = "Для партии не выбран продукт из справочника."
        return result
    if product.is_complex:
        result["reason"] = "Выбранный продукт относится к продукции общественного питания."
        return result
    waters = composition.get("water", set())
    if not waters:
        result["reason"] = "В справочнике не указано содержание воды."
        return result
    if len(waters) != 1:
        result["reason"] = "В справочнике указаны разные значения содержания воды."
        return result
    water = next(iter(waters))
    if not water.is_finite() or not 0 <= water <= 100:
        result["reason"] = "Содержание воды в справочнике выходит за пределы от 0 до 100 г на 100 г."
        return result

    mass = Decimal(100)
    dry_mass = mass - water
    retained_components = {
        key: next(iter(values)) for key, values in composition.items() if len(values) == 1
    }
    for index, step in enumerate(steps):
        if step.pk not in rules:
            rules[step.pk] = pick_processing_rule(product, step.pk)[0]
        rule = rules[step.pk]
        if rule is None:
            if index < len(steps) - 1:
                result["skipped_steps"].append(step.name)
                continue
            result["reason"] = f"Для обработки «{step.name}» нет справочного правила."
            return result

        rates = {
            key: Decimal(str(getattr(rule, key))) for key in ("weight", *DRY_LOSS_FIELDS)
            if getattr(rule, key) is not None
        }
        if any(not rate.is_finite() or rate > 100 for rate in rates.values()):
            result["reason"] = f"Для обработки «{step.name}» заданы некорректные коэффициенты."
            return result

        mass *= 1 - rates.pop("weight", Decimal(0)) / 100
        for key, rate in rates.items():
            if not rate:
                continue
            amount = retained_components.get(key)
            if amount is None or not amount.is_finite() or amount < 0:
                result["reason"] = f"Для обработки «{step.name}» не хватает однозначных данных о составе для учёта потерь."
                return result
            loss = amount * rate / 100
            retained_components[key] = amount - loss
            dry_mass -= loss

        if mass <= 0 or not 0 <= dry_mass <= mass:
            result["reason"] = f"После обработки «{step.name}» расчётная масса продукта или сухих веществ выходит за допустимые пределы."
            return result
        result["applied_steps"].append(step.name)

    result["reference_pct"] = dry_mass / mass * 100
    return result


def compare_analysis(analysis, uses_oil, reference):
    percent = reference["reference_pct"]
    results = []
    if percent is not None:
        for basis, measured in (
            ("with_oil" if uses_oil else "measured", analysis.final_dry_matter_pct),
            ("without_oil", analysis.final_dry_matter_without_oil_pct if uses_oil else None),
        ):
            if measured is not None:
                results.append({"basis": basis, "measured_pct": measured, "difference_pp": measured - percent})
    return {"analysis_id": analysis.pk, **reference, "results": results}
