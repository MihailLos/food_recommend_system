from catalog.models import CulinaryProcessingRule, FoodProducts
from catalog.utils.maps import NUTRIENT_MAP, RULE_FIELD_MAP, FRONT_KEY_MAP

# Функция выбора правила обработки по продукту
def pick_processing_rule(product, processing_id):
    # 1. Точное правило для продукта
    rule = CulinaryProcessingRule.objects.filter(
        processing_id=processing_id,
        product_id=product.id
    ).first()
    if rule:
        return rule, "product"

    # 2. Если продукт сложный — дальше НЕ идём
    if product.is_complex == 1:
        return None, "none"

    # 3. Правило по подтипу
    if product.subtype_id:
        rule = CulinaryProcessingRule.objects.filter(
            processing_id=processing_id,
            product_id__isnull=True,
            product_subtype_id=product.subtype_id
        ).first()
        if rule:
            return rule, "subtype"

        # 4. Правило по типу
        pt_id = product.subtype.product_type_id
        rule = CulinaryProcessingRule.objects.filter(
            processing_id=processing_id,
            product_id__isnull=True,
            product_subtype_id__isnull=True,
            product_type_id=pt_id
        ).first()
        if rule:
            return rule, "type"

    return None, "none"

# Функция перерасчета потерь
def apply_loss(old_value, loss_pct):
    if old_value is None:
        return None
    if loss_pct is None or loss_pct == 0:
        return old_value

    new_value = old_value * (1 - loss_pct / 100)

    # защита от отрицательных значений
    return max(new_value, 0)

def scale_by_weight(value_per_100g, weight_g):
    """Пересчёт с 'на 100 г' -> 'на weight_g'."""
    if value_per_100g is None:
        return None
    if weight_g is None:
        return value_per_100g
    return value_per_100g * (weight_g / 100.0)

# Функция расчета потерь
def compute_processed_nutrients(product, processing_id, weight_g):
    product = (
        FoodProducts.objects
        .select_related("subtype", "subtype__product_type")
        .prefetch_related("macros", "minerals", "vitamins", "other_nutrients")
        .get(id=product.id)
    )

    rule, scope = pick_processing_rule(product, processing_id)

    # 1) входной вес (что ввёл пользователь). Если не ввёл — 100 г.
    input_weight = float(weight_g) if weight_g not in (None, "", 0) else 100.0

    # 2) процент изменения массы из правила
    weight_pct = None
    if rule is not None:
        weight_pct = rule.weight

    # 3) финальный вес после обработки
    # Weight = % уменьшения (если <0 — увеличение)
    if weight_pct is None:
        final_weight = input_weight
    else:
        try:
            pct = float(weight_pct)
        except (TypeError, ValueError):
            pct = 0.0
        final_weight = max(input_weight * (1 - pct / 100.0), 0.0)

    result = {
        "product_id": product.id,
        "processing_id": processing_id,
        "applied_rule_id": rule.id if rule else None,
        "is_complex": getattr(product, "is_complex", 0) or 0,
        "input_weight_g": input_weight, 
        "weight_g": final_weight,
        "weight_change_pct": weight_pct,  # % изменения массы из правила
        "scope": scope,

        # два слоя результата
        "per_100g": {
            "macronutrients": {},
            "minerals": {},
            "vitamins": {},
            "other_nutrients": {},
        },
        "per_weight": {
            "macronutrients": {},
            "minerals": {},
            "vitamins": {},
            "other_nutrients": {},
        },
        "per_100g_flat": {},
        "per_weight_flat": {},
    }

    def read(rel, field):
        obj = getattr(product, rel, None)
        return getattr(obj, field, None) if obj else None
    
    def write(group, field, v100):
        # nested (для отладки/структуры)
        if rel == "macros":
            group = "macronutrients"
        else:
            group = rel

        result["per_100g"][group][field] = v100
        result["per_weight"][group][field] = scale_by_weight(v100, final_weight)

        # flat (для UI)
        flat_key = FRONT_KEY_MAP.get((rel, field))
        if flat_key:
            result["per_100g_flat"][flat_key] = v100
            result["per_weight_flat"][flat_key] = scale_by_weight(v100, final_weight)

    for rule_key, (rel, field) in NUTRIENT_MAP.items():
        old_val = read(rel, field)
        loss_pct = getattr(rule, RULE_FIELD_MAP[rule_key], None) if rule else None
        new_val = apply_loss(old_val, loss_pct)
        write(rel, field, new_val)

    return result