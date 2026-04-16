NUTRIENT_MAP = {
    # Macronutrients
    "Water": ("macros", "water_g_field"),
    "Proteins": ("macros", "protein_g_field"),
    "Fats": ("macros", "fats_g_field"),
    "Carbs": ("macros", "carbs_g_field"),
    "Dietary_Fiber": ("macros", "dietary_fiber_g_field"),
    "Energy_Value": ("macros", "energy_value_kcal_field"),

    # Other_Nutrients
    "Organic_Acids": ("other_nutrients", "organic_acids_g_field"),

    # Minerals
    "Ash": ("minerals", "ash_g_field"),
    "Na": ("minerals", "na_mg_field"),
    "K": ("minerals", "k_mg_field"),
    "Ca": ("minerals", "ca_mg_field"),
    "Mg": ("minerals", "mg_mg_field"),
    "P": ("minerals", "p_mg_field"),
    "Fe": ("minerals", "fe_mg_field"),

    # Vitamins
    "Beta_Carotene": ("vitamins", "beta_carotene_mg_field"),
    "B1": ("vitamins", "b1_mg_field"),
    "B2": ("vitamins", "b2_mg_field"),
    "PP": ("vitamins", "pp_mg_field"),
    "C": ("vitamins", "c_mg_field"),
}

RULE_FIELD_MAP = {
    "Water": "water",
    "Proteins": "proteins",
    "Fats": "fats",
    "Carbs": "carbs",
    "Dietary_Fiber": "dietary_fiber",
    "Energy_Value": "energy_value",
    "Organic_Acids": "organic_acids",
    "Ash": "ash",
    "Na": "na",
    "K": "k",
    "Ca": "ca",
    "Mg": "mg",
    "P": "p",
    "Fe": "fe",
    "Beta_Carotene": "beta_carotene",
    "B1": "b1",
    "B2": "b2",
    "PP": "pp",
    "C": "c",
}

FRONT_KEY_MAP = {
    # Macronutrients
    ("macros", "protein_g_field"): "protein_g",
    ("macros", "fats_g_field"): "fats_g",
    ("macros", "carbs_g_field"): "carbs_g",
    ("macros", "mds_g_field"): "mds_g",
    ("macros", "starch_g_field"): "starch_g",
    ("macros", "water_g_field"): "water_g",
    ("macros", "energy_value_kcal_field"): "energy_kcal",
    ("macros", "dietary_fiber_g_field"): "fiber_g",  # ВАЖНО: на фронте fiber_g

    # Minerals
    ("minerals", "na_mg_field"): "na_mg",
    ("minerals", "k_mg_field"): "k_mg",
    ("minerals", "ca_mg_field"): "ca_mg",
    ("minerals", "mg_mg_field"): "mg_mg",
    ("minerals", "p_mg_field"): "p_mg",
    ("minerals", "fe_mg_field"): "fe_mg",
    ("minerals", "ash_g_field"): "ash_g",

    # Vitamins
    ("vitamins", "a_vitamin_mg_field"): "a_mg",
    ("vitamins", "beta_carotene_mg_field"): "beta_carotene_mg",
    ("vitamins", "b1_vitamin_mg_field"): "b1_mg",
    ("vitamins", "b2_vitamin_mg_field"): "b2_mg",
    ("vitamins", "pp_vitamin_mg_field"): "pp_mg",
    ("vitamins", "c_vitamin_mg_field"): "c_mg",
    ("vitamins", "retinol_index"): "retinol_index",
    ("vitamins", "tocopherol_index"): "tocopherol_index",
    ("vitamins", "niacin_index"): "niacin_index",

    # Other nutrients
    ("other_nutrients", "organic_acids_g_field"): "organic_acids_g",
    ("other_nutrients", "alcohol_field"): "alcohol_pct",

    # Fat acids
    ("fat_acids", "nlc_g_field"): "nlc_g",
    ("fat_acids", "pufa_g_field"): "pufa_g",
    ("fat_acids", "cholesterin_g_field"): "cholesterol_g",
}
