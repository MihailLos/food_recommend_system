from catalog.models import CulinaryProcessingRule, FoodProducts
from catalog.utils.maps import NUTRIENT_MAP, RULE_FIELD_MAP, FRONT_KEY_MAP

GROUP_NAMES = {
    "macros": "macronutrients",
    "minerals": "minerals",
    "vitamins": "vitamins",
    "other_nutrients": "other_nutrients",
    "fat_acids": "fat_acids",
}

LOSS_FIELD_BY_NUTRIENT = {
    rel_field: RULE_FIELD_MAP[rule_key]
    for rule_key, rel_field in NUTRIENT_MAP.items()
    if rule_key in RULE_FIELD_MAP
}


# Функция выбора правила обработки по продукту
def pick_processing_rule(product, processing_id):
    # 1. Точное правило для продукта
    rule = CulinaryProcessingRule.objects.filter(
        processing_id=processing_id,
        product_id=product.id
    ).first()
    if rule:
        return rule, "product"

    # 2. Правило по подтипу. Для сложных продуктов тоже допускаем fallback:
    # точное правило остаётся приоритетным, но типовой пересчёт лучше,
    # чем полное отсутствие обработки в калькуляторе.
    if product.subtype_id:
        rule = CulinaryProcessingRule.objects.filter(
            processing_id=processing_id,
            product_id__isnull=True,
            product_subtype_id=product.subtype_id
        ).first()
        if rule:
            return rule, "subtype"

        # 3. Правило по типу
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
def apply_loss(amount, loss_pct):
    if amount is None:
        return None
    if loss_pct is None or loss_pct == 0:
        return amount

    new_value = amount * (1 - loss_pct / 100)

    # защита от отрицательных значений
    return max(new_value, 0)

def scale_by_weight(value_per_100g, weight_g):
    """Пересчёт с 'на 100 г' -> 'на weight_g'."""
    if value_per_100g is None:
        return None
    if weight_g is None:
        return value_per_100g
    return value_per_100g * (weight_g / 100.0)


def per_100g_from_amount(amount, output_weight_g):
    """Пересчёт общего количества пищевого вещества -> концентрация на 100 г готового продукта."""
    if amount is None or output_weight_g is None or output_weight_g <= 0:
        return None
    return amount / output_weight_g * 100.0


def calculate_ready_values(base_per_100g, input_weight_g, output_weight_g, loss_pct):
    """
    Методика пересчёта:
    1. считаем исходное количество пищевого вещества во введённой сырой массе;
    2. применяем потери пищевого вещества при обработке;
    3. пересчитываем остаток пищевого вещества на 100 г готового продукта.
    """
    raw_amount = scale_by_weight(base_per_100g, input_weight_g)
    retained_amount = apply_loss(raw_amount, loss_pct)
    ready_per_100g = per_100g_from_amount(retained_amount, output_weight_g)
    return raw_amount, retained_amount, ready_per_100g


# Функция расчета потерь
def compute_processed_nutrients(product, processing_id, weight_g):
    product = (
        FoodProducts.objects
        .select_related("subtype", "subtype__product_type")
        .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")
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
        "output_weight_g": final_weight,
        "weight_change_pct": weight_pct,  # % изменения массы из правила
        "calculation_method": (
            "raw_per_100g -> raw_amount_for_input_weight -> nutrient_loss -> "
            "retained_amount -> retained_amount_per_100g_ready_product"
        ),
        "scope": scope,

        # два слоя результата
        "per_100g": {
            "macronutrients": {},
            "minerals": {},
            "vitamins": {},
            "other_nutrients": {},
            "fat_acids": {},
        },
        "per_weight": {
            "macronutrients": {},
            "minerals": {},
            "vitamins": {},
            "other_nutrients": {},
            "fat_acids": {},
        },
        "raw_per_weight": {
            "macronutrients": {},
            "minerals": {},
            "vitamins": {},
            "other_nutrients": {},
            "fat_acids": {},
        },
        "per_100g_flat": {},
        "per_weight_flat": {},
        "raw_per_weight_flat": {},
        "loss_pct_flat": {},
    }

    def read(rel, field):
        obj = getattr(product, rel, None)
        return getattr(obj, field, None) if obj else None

    def write(rel, field, v100, amount, raw_amount, loss_pct):
        group = GROUP_NAMES.get(rel, rel)

        result["per_100g"][group][field] = v100
        result["per_weight"][group][field] = amount
        result["raw_per_weight"][group][field] = raw_amount

        # flat (для UI)
        flat_key = FRONT_KEY_MAP.get((rel, field))
        if flat_key:
            result["per_100g_flat"][flat_key] = v100
            result["per_weight_flat"][flat_key] = amount
            result["raw_per_weight_flat"][flat_key] = raw_amount
            result["loss_pct_flat"][flat_key] = loss_pct

    for rel, field in FRONT_KEY_MAP:
        base_per_100g = read(rel, field)
        loss_field = LOSS_FIELD_BY_NUTRIENT.get((rel, field))
        loss_pct = getattr(rule, loss_field, None) if rule and loss_field else None
        raw_amount, retained_amount, ready_per_100g = calculate_ready_values(
            base_per_100g,
            input_weight,
            final_weight,
            loss_pct,
        )
        write(rel, field, ready_per_100g, retained_amount, raw_amount, loss_pct)

    return result
