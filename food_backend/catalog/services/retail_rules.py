from __future__ import annotations

from typing import Dict, List

from catalog.models import RetailFoodProduct
from catalog.utils.allergens import get_allergens_for_product
from catalog.utils.child_rules import pick_not_child_rule


RETAIL_REQUIRED_NUTRIENT_FIELDS = (
    "energy_kcal",
    "protein_g",
    "fats_g",
    "carbs_g",
)


def get_retail_product_allergens(retail_product: RetailFoodProduct, allergen_rule_cache=None) -> List[dict]:
    allergens: Dict[int, dict] = {}

    reference_product = retail_product.related_food_product
    if reference_product is not None:
        for allergen in get_allergens_for_product(reference_product, rule_cache=allergen_rule_cache):
            allergens[int(allergen["id"])] = allergen

    for component_link in retail_product.retail_components.all():
        component = component_link.food_component
        for allergen in get_allergens_for_product(component, rule_cache=allergen_rule_cache):
            allergens[int(allergen["id"])] = allergen

    for additive_link in retail_product.retail_additives.all():
        additive = additive_link.food_additive
        if additive.provoke_allergy:
            key = -int(additive.id)
            allergens[key] = {
                "id": key,
                "name": f"Пищевая добавка: {additive.name}",
                "scope": "additive",
            }

    return list(allergens.values())


def is_retail_product_child_allowed(retail_product: RetailFoodProduct, not_child_rule_cache=None) -> bool:
    reference_product = retail_product.related_food_product
    if reference_product is not None:
        rule, _level = pick_not_child_rule(reference_product, rule_cache=not_child_rule_cache)
        if rule is not None:
            return False

    for component_link in retail_product.retail_components.all():
        rule, _level = pick_not_child_rule(component_link.food_component, rule_cache=not_child_rule_cache)
        if rule is not None:
            return False

    for additive_link in retail_product.retail_additives.all():
        additive = additive_link.food_additive
        if additive.for_children is False:
            return False

    return True


def evaluate_retail_product_readiness(retail_product: RetailFoodProduct) -> dict:
    missing_fields: List[str] = []

    if not (retail_product.name or "").strip():
        missing_fields.append("Не указано название продукта.")

    has_any_nutrition = any(
        getattr(retail_product, field_name) not in (None, "")
        for field_name in RETAIL_REQUIRED_NUTRIENT_FIELDS
    )
    if not has_any_nutrition:
        missing_fields.append("Не заполнены основные показатели пищевой ценности продукта.")

    is_ready = len(missing_fields) == 0
    if is_ready:
        next_status = RetailFoodProduct.Status.READY
    elif retail_product.related_food_product_id or retail_product.composition_text:
        next_status = RetailFoodProduct.Status.MATCHED
    else:
        next_status = RetailFoodProduct.Status.DRAFT

    return {
        "is_ready_for_recommendation": is_ready,
        "status": next_status,
        "missing_fields": missing_fields,
    }


def apply_retail_product_readiness(retail_product: RetailFoodProduct) -> RetailFoodProduct:
    readiness = evaluate_retail_product_readiness(retail_product)
    retail_product.is_ready_for_recommendation = readiness["is_ready_for_recommendation"]
    retail_product.status = readiness["status"]
    return retail_product
