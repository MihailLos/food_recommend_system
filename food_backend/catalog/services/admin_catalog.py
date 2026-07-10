from django.db import transaction

from catalog.models import (
    AllergenProduct,
    FatAcids,
    FoodProducts,
    Macronutrients,
    Minerals,
    NotChildProduct,
    OtherNutrients,
    RetailFoodProduct,
    RetailFoodProductComponent,
    Vitamins,
)


NUTRIENT_MODEL_FIELDS = {
    "macros": (
        Macronutrients,
        {
            "protein_g": "protein_g_field",
            "fats_g": "fats_g_field",
            "carbs_g": "carbs_g_field",
            "mds_g": "mds_g_field",
            "starch_g": "starch_g_field",
            "water_g": "water_g_field",
            "energy_kcal": "energy_value_kcal_field",
            "dietary_fiber_g": "dietary_fiber_g_field",
        },
    ),
    "minerals": (
        Minerals,
        {
            "na_mg": "na_mg_field",
            "k_mg": "k_mg_field",
            "ca_mg": "ca_mg_field",
            "mg_mg": "mg_mg_field",
            "p_mg": "p_mg_field",
            "fe_mg": "fe_mg_field",
            "ash_g": "ash_g_field",
        },
    ),
    "vitamins": (
        Vitamins,
        {
            "a_mg": "a_vitamin_mg_field",
            "beta_carotene_mg": "beta_carotene_mg_field",
            "b1_mg": "b1_vitamin_mg_field",
            "b2_mg": "b2_vitamin_mg_field",
            "pp_mg": "pp_vitamin_mg_field",
            "c_mg": "c_vitamin_mg_field",
            "retinol_index": "retinol_index",
            "tocopherol_index": "tocopherol_index",
            "niacin_index": "niacin_index",
        },
    ),
    "other_nutrients": (
        OtherNutrients,
        {
            "organic_acids_g": "organic_acids_g_field",
            "alcohol_pct": "alcohol_field",
        },
    ),
    "fat_acids": (
        FatAcids,
        {
            "nlc_g": "nlc_g_field",
            "pufa_g": "pufa_g_field",
            "cholesterol_g": "cholesterin_g_field",
        },
    ),
}


def upsert_product_nutrients(product, nutrients_payload):
    for payload_key, (model, field_map) in NUTRIENT_MODEL_FIELDS.items():
        values = nutrients_payload.get(payload_key) or {}
        defaults = {model_field: values.get(api_field) for api_field, model_field in field_map.items()}
        model.objects.update_or_create(food_product=product, defaults=defaults)


def set_product_allergens(product, allergen_ids):
    AllergenProduct.objects.filter(scope=AllergenProduct.SCOPE_PRODUCT, product=product).delete()
    for allergen in allergen_ids:
        allergen_id = getattr(allergen, "id", allergen)
        AllergenProduct.objects.get_or_create(
            scope=AllergenProduct.SCOPE_PRODUCT,
            product=product,
            allergen_id=allergen_id,
            defaults={
                "product_type": None,
                "product_subtype": None,
            },
        )


def set_product_child_allowed(product, is_child_allowed):
    NotChildProduct.objects.filter(scope=NotChildProduct.SCOPE_PRODUCT, product=product).delete()
    if is_child_allowed is False:
        NotChildProduct.objects.get_or_create(
            scope=NotChildProduct.SCOPE_PRODUCT,
            product=product,
            defaults={
                "product_type": None,
                "product_subtype": None,
            },
        )


@transaction.atomic
def create_admin_product(validated_data):
    nutrients = validated_data.pop("nutrients", {})
    allergen_ids = validated_data.pop("allergen_ids", [])
    is_child_allowed = validated_data.pop("is_child_allowed", True)
    product = FoodProducts.objects.create(**validated_data)
    upsert_product_nutrients(product, nutrients)
    set_product_allergens(product, allergen_ids)
    set_product_child_allowed(product, is_child_allowed)
    return product


@transaction.atomic
def update_admin_product(product, validated_data):
    nutrients = validated_data.pop("nutrients", None)
    allergen_ids = validated_data.pop("allergen_ids", None)
    is_child_allowed = validated_data.pop("is_child_allowed", None)

    for field, value in validated_data.items():
        setattr(product, field, value)
    product.save()

    if nutrients is not None:
        upsert_product_nutrients(product, nutrients)
    if allergen_ids is not None:
        set_product_allergens(product, allergen_ids)
    if is_child_allowed is not None:
        set_product_child_allowed(product, is_child_allowed)
    return product


def get_product_delete_blockers(product):
    blockers = []
    reference_count = RetailFoodProduct.objects.filter(related_food_product=product).count()
    component_count = RetailFoodProductComponent.objects.filter(food_component=product).count()
    if reference_count:
        blockers.append(f"используется как эталонный продукт в магазинных продуктах: {reference_count}")
    if component_count:
        blockers.append(f"используется как компонент состава магазинных продуктов: {component_count}")
    return blockers
