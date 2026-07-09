from __future__ import annotations

from typing import Iterable

from catalog.models import FoodProducts, RetailFoodProduct
from catalog.services.retail_rules import (
    RETAIL_REQUIRED_NUTRIENT_FIELDS,
    get_retail_product_allergens,
    is_retail_product_child_allowed,
)
from catalog.utils.allergens import get_allergens_for_product
from catalog.utils.child_rules import pick_not_child_rule


RETAIL_NUTRIENT_FIELDS = (
    "protein_g",
    "fats_g",
    "carbs_g",
    "mds_g",
    "starch_g",
    "water_g",
    "energy_kcal",
    "dietary_fiber_g",
    "na_mg",
    "k_mg",
    "mg_mg",
    "p_mg",
    "fe_mg",
    "ca_mg",
    "ash_g",
    "a_mg",
    "beta_carotene_mg",
    "b1_mg",
    "b2_mg",
    "pp_mg",
    "c_mg",
    "retinol_index",
    "tocopherol_index",
    "niacin_index",
    "nlc_g",
    "pufa_g",
    "cholesterol_g",
    "organic_acids_g",
    "alcohol_pct",
)


REFERENCE_FIELD_GETTERS = {
    "protein_g": lambda product: getattr(product.macros, "protein_g_field", None) if hasattr(product, "macros") else None,
    "fats_g": lambda product: getattr(product.macros, "fats_g_field", None) if hasattr(product, "macros") else None,
    "carbs_g": lambda product: getattr(product.macros, "carbs_g_field", None) if hasattr(product, "macros") else None,
    "mds_g": lambda product: getattr(product.macros, "mds_g_field", None) if hasattr(product, "macros") else None,
    "starch_g": lambda product: getattr(product.macros, "starch_g_field", None) if hasattr(product, "macros") else None,
    "water_g": lambda product: getattr(product.macros, "water_g_field", None) if hasattr(product, "macros") else None,
    "energy_kcal": lambda product: getattr(product.macros, "energy_value_kcal_field", None) if hasattr(product, "macros") else None,
    "dietary_fiber_g": lambda product: getattr(product.macros, "dietary_fiber_g_field", None) if hasattr(product, "macros") else None,
    "na_mg": lambda product: getattr(product.minerals, "na_mg_field", None) if hasattr(product, "minerals") else None,
    "k_mg": lambda product: getattr(product.minerals, "k_mg_field", None) if hasattr(product, "minerals") else None,
    "mg_mg": lambda product: getattr(product.minerals, "mg_mg_field", None) if hasattr(product, "minerals") else None,
    "p_mg": lambda product: getattr(product.minerals, "p_mg_field", None) if hasattr(product, "minerals") else None,
    "fe_mg": lambda product: getattr(product.minerals, "fe_mg_field", None) if hasattr(product, "minerals") else None,
    "ca_mg": lambda product: getattr(product.minerals, "ca_mg_field", None) if hasattr(product, "minerals") else None,
    "ash_g": lambda product: getattr(product.minerals, "ash_g_field", None) if hasattr(product, "minerals") else None,
    "a_mg": lambda product: getattr(product.vitamins, "a_vitamin_mg_field", None) if hasattr(product, "vitamins") else None,
    "beta_carotene_mg": lambda product: getattr(product.vitamins, "beta_carotene_mg_field", None) if hasattr(product, "vitamins") else None,
    "b1_mg": lambda product: getattr(product.vitamins, "b1_vitamin_mg_field", None) if hasattr(product, "vitamins") else None,
    "b2_mg": lambda product: getattr(product.vitamins, "b2_vitamin_mg_field", None) if hasattr(product, "vitamins") else None,
    "pp_mg": lambda product: getattr(product.vitamins, "pp_vitamin_mg_field", None) if hasattr(product, "vitamins") else None,
    "c_mg": lambda product: getattr(product.vitamins, "c_vitamin_mg_field", None) if hasattr(product, "vitamins") else None,
    "retinol_index": lambda product: getattr(product.vitamins, "retinol_index", None) if hasattr(product, "vitamins") else None,
    "tocopherol_index": lambda product: getattr(product.vitamins, "tocopherol_index", None) if hasattr(product, "vitamins") else None,
    "niacin_index": lambda product: getattr(product.vitamins, "niacin_index", None) if hasattr(product, "vitamins") else None,
    "nlc_g": lambda product: getattr(product.fat_acids, "nlc_g_field", None) if hasattr(product, "fat_acids") else None,
    "pufa_g": lambda product: getattr(product.fat_acids, "pufa_g_field", None) if hasattr(product, "fat_acids") else None,
    "cholesterol_g": lambda product: getattr(product.fat_acids, "cholesterin_g_field", None) if hasattr(product, "fat_acids") else None,
    "organic_acids_g": lambda product: getattr(product.other_nutrients, "organic_acids_g_field", None) if hasattr(product, "other_nutrients") else None,
    "alcohol_pct": lambda product: getattr(product.other_nutrients, "alcohol_field", None) if hasattr(product, "other_nutrients") else None,
}


def get_reference_product_nutrients(reference_product: FoodProducts | None) -> dict:
    if reference_product is None:
        return {}
    return {
        field_name: getter(reference_product)
        for field_name, getter in REFERENCE_FIELD_GETTERS.items()
    }


def preview_fill_missing_retail_nutrients(
    reference_product: FoodProducts | None,
    current_values: dict,
    fill_mode: str | None,
) -> dict:
    reference_values = get_reference_product_nutrients(reference_product)
    current_values = current_values or {}
    merged = dict(current_values)

    if fill_mode in {
        RetailFoodProduct.NutritionFillMode.LABEL_PLUS_REFERENCE,
        RetailFoodProduct.NutritionFillMode.REFERENCE_ONLY,
    }:
        for field_name, reference_value in reference_values.items():
            if fill_mode == RetailFoodProduct.NutritionFillMode.REFERENCE_ONLY:
                merged[field_name] = reference_value
            elif merged.get(field_name) in (None, ""):
                merged[field_name] = reference_value

    return {
        "fill_mode": fill_mode,
        "reference_product_id": getattr(reference_product, "id", None),
        "current_values": current_values,
        "reference_values": reference_values,
        "merged_values": merged,
        "required_fields": list(RETAIL_REQUIRED_NUTRIENT_FIELDS),
    }


def apply_fill_missing_retail_nutrients(retail_product: RetailFoodProduct) -> RetailFoodProduct:
    preview = preview_fill_missing_retail_nutrients(
        reference_product=retail_product.related_food_product,
        current_values={field_name: getattr(retail_product, field_name) for field_name in RETAIL_NUTRIENT_FIELDS},
        fill_mode=retail_product.nutrition_fill_mode,
    )
    for field_name, value in preview["merged_values"].items():
        setattr(retail_product, field_name, value)
    return retail_product


def build_reference_product_payload(product: FoodProducts) -> dict:
    rule, _level = pick_not_child_rule(product)
    payload = {
        "id": product.id,
        "name": product.name,
        "typeId": getattr(product.type, "id", None),
        "typeName": getattr(product.type, "name", None),
        "subtypeId": getattr(product.subtype, "id", None),
        "subtypeName": getattr(product.subtype, "name", None),
        "isChildAllowed": rule is None,
        "allergens": get_allergens_for_product(product),
    }
    payload.update(get_reference_product_nutrients(product))
    payload["fiber_g"] = payload.get("dietary_fiber_g")
    return payload


def build_retail_product_payload(retail_product: RetailFoodProduct) -> dict:
    payload = {
        "id": -int(retail_product.id),
        "name": retail_product.name,
        "typeId": getattr(retail_product.related_food_group, "id", None),
        "typeName": getattr(retail_product.related_food_group, "name", None),
        "subtypeId": getattr(retail_product.related_food_subgroup, "id", None),
        "subtypeName": getattr(retail_product.related_food_subgroup, "name", None),
        "isChildAllowed": is_retail_product_child_allowed(retail_product),
        "allergens": get_retail_product_allergens(retail_product),
        "retailProductId": retail_product.id,
        "sourceMode": "retail",
    }
    for field_name in RETAIL_NUTRIENT_FIELDS:
        payload[field_name] = getattr(retail_product, field_name)
    payload["fiber_g"] = payload.get("dietary_fiber_g")
    return payload


def get_available_nutrient_codes_for_retail_products(products: Iterable[RetailFoodProduct]) -> list[str]:
    products = list(products)
    if not products:
        return []

    available_codes: list[str] = []
    for field_name in RETAIL_NUTRIENT_FIELDS:
        if all(getattr(product, field_name) not in (None, "") for product in products):
            available_codes.append(field_name)
    return available_codes
