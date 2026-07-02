# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models
from django.conf import settings

class FatAcids(models.Model):
    id = models.AutoField(db_column='ID', primary_key=True)  # Field name made lowercase.
    food_product = models.OneToOneField('FoodProducts', models.CASCADE, db_column='Food_Product_ID', related_name='fat_acids')  # Field name made lowercase.
    nlc_g_field = models.FloatField(db_column='NLC (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    pufa_g_field = models.FloatField(db_column='PUFA (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    cholesterin_g_field = models.FloatField(db_column='Cholesterin (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.

    class Meta:
        managed = False
        db_table = 'Fat_Acids'


class FoodProductTypes(models.Model):
    id = models.AutoField(db_column='ID', primary_key=True)  # Field name made lowercase.
    name = models.TextField(db_column='Name')  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'Food_Product_Types'

class FoodProductSubtypes(models.Model):
    id = models.AutoField(db_column='ID', primary_key=True)
    name = models.TextField(db_column='Subtype_Name')
    product_type = models.ForeignKey(FoodProductTypes, on_delete=models.PROTECT, db_column="Product_Type_ID",)

    class Meta:
        managed = False
        db_table = 'Food_Product_Subtypes'

class FoodProducts(models.Model):
    id = models.AutoField(db_column='ID', primary_key=True)  # Field name made lowercase.
    name = models.TextField(db_column='Name')  # Field name made lowercase.
    subtype = models.ForeignKey(FoodProductSubtypes, models.DO_NOTHING, db_column='Subtype_ID', blank=True, null=True)
    is_complex = models.IntegerField(db_column="Is_Complex", default=0)

    class Meta:
        managed = False
        db_table = 'Food_Products'

    @property
    def type(self) -> FoodProductTypes:
        return self.subtype.product_type if self.subtype_id and self.subtype else None


class Macronutrients(models.Model):
    id = models.AutoField(db_column='ID', primary_key=True)  # Field name made lowercase.
    food_product = models.OneToOneField(FoodProducts, models.CASCADE, db_column='Food_Product_ID', related_name='macros')  # Field name made lowercase.
    protein_g_field = models.FloatField(db_column='Protein (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    fats_g_field = models.FloatField(db_column='Fats (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    carbs_g_field = models.FloatField(db_column='Carbs (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    mds_g_field = models.FloatField(db_column='MDS (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    starch_g_field = models.FloatField(db_column='Starch (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    water_g_field = models.FloatField(db_column='Water (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    energy_value_kcal_field = models.FloatField(db_column='Energy_Value (kcal)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    dietary_fiber_g_field = models.FloatField(db_column='Dietary_Fiber (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.

    class Meta:
        managed = False
        db_table = 'Macronutrients'


class Minerals(models.Model):
    id = models.AutoField(db_column='ID', primary_key=True)  # Field name made lowercase.
    food_product = models.OneToOneField(FoodProducts, models.CASCADE, db_column='Food_Product_ID', blank=True, null=True, related_name='minerals')  # Field name made lowercase.
    na_mg_field = models.FloatField(db_column='Na (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    k_mg_field = models.FloatField(db_column='K (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    mg_mg_field = models.FloatField(db_column='Mg (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    p_mg_field = models.FloatField(db_column='P (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    fe_mg_field = models.FloatField(db_column='Fe (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    ash_g_field = models.FloatField(db_column='Ash (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    ca_mg_field = models.FloatField(db_column='Ca (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.

    class Meta:
        managed = False
        db_table = 'Minerals'


class OtherNutrients(models.Model):
    id = models.AutoField(db_column='ID', primary_key=True)  # Field name made lowercase.
    food_product = models.OneToOneField(FoodProducts, models.CASCADE, db_column='Food_Product_ID', related_name='other_nutrients')  # Field name made lowercase.
    organic_acids_g_field = models.FloatField(db_column='Organic_Acids (g)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    alcohol_field = models.FloatField(db_column='Alcohol (pct)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.

    class Meta:
        managed = False
        db_table = 'Other_Nutrients'


class Vitamins(models.Model):
    id = models.AutoField(db_column='ID', primary_key=True)  # Field name made lowercase.
    food_product = models.OneToOneField(FoodProducts, models.CASCADE, db_column='Food_Product_ID', related_name='vitamins')  # Field name made lowercase.
    a_vitamin_mg_field = models.FloatField(db_column='A_Vitamin (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    beta_carotene_mg_field = models.FloatField(db_column='Beta_Carotene (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    b1_vitamin_mg_field = models.FloatField(db_column='B1_Vitamin (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    b2_vitamin_mg_field = models.FloatField(db_column='B2_Vitamin (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    pp_vitamin_mg_field = models.FloatField(db_column='PP_Vitamin (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    c_vitamin_mg_field = models.FloatField(db_column='C_Vitamin (mg)', blank=True, null=True)  # Field name made lowercase. Field renamed to remove unsuitable characters. Field renamed because it ended with '_'.
    retinol_index = models.FloatField(db_column='Retinol_Index', blank=True, null=True)  # Field name made lowercase.
    tocopherol_index = models.FloatField(db_column='Tocopherol_Index', blank=True, null=True)  # Field name made lowercase.
    niacin_index = models.FloatField(db_column='Niacin_Index', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'Vitamins'

class CulinaryProcessingType(models.Model):
    id = models.IntegerField(primary_key=True, db_column="ID")
    name = models.TextField(db_column="Name")

    class Meta:
        db_table = "Culinary_Processing_Types"

    def __str__(self):
        return self.name

class CulinaryProcessingRule(models.Model):
    id = models.IntegerField(primary_key=True, db_column="ID")
    processing = models.ForeignKey(
        CulinaryProcessingType,
        on_delete=models.CASCADE,
        related_name="rules",
        db_column="Processing_ID",
    )
    product_type_id = models.ForeignKey(
        FoodProductTypes,
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name="product_type",
        db_column="Product_Type_ID"
    )
    product_subtype_id = models.ForeignKey(
        FoodProductSubtypes,
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name="product_subtype",
        db_column="Product_Subtype_ID")
    product = models.ForeignKey(
        FoodProducts,
        null=True, blank=True,
        on_delete=models.CASCADE,
        db_column="Product_ID",
        related_name="processing_rules",
    )

    weight = models.FloatField(null=True, blank=True, db_column="Weight")
    water = models.FloatField(null=True, blank=True, db_column="Water")
    proteins = models.FloatField(null=True, blank=True, db_column="Proteins")
    fats = models.FloatField(null=True, blank=True, db_column="Fats")
    carbs = models.FloatField(null=True, blank=True, db_column="Carbs")
    dietary_fiber = models.FloatField(null=True, blank=True, db_column="Dietary_Fiber")
    organic_acids = models.FloatField(null=True, blank=True, db_column="Organic_Acids")
    ash = models.FloatField(null=True, blank=True, db_column="Ash")
    na = models.FloatField(null=True, blank=True, db_column="Na")
    k = models.FloatField(null=True, blank=True, db_column="K")
    ca = models.FloatField(null=True, blank=True, db_column="Ca")
    mg = models.FloatField(null=True, blank=True, db_column="Mg")
    p = models.FloatField(null=True, blank=True, db_column="P")
    fe = models.FloatField(null=True, blank=True, db_column="Fe")
    beta_carotene = models.FloatField(null=True, blank=True, db_column="Beta_Carotene")
    b1 = models.FloatField(null=True, blank=True, db_column="B1")
    b2 = models.FloatField(null=True, blank=True, db_column="B2")
    pp = models.FloatField(null=True, blank=True, db_column="PP")
    c = models.FloatField(null=True, blank=True, db_column="C")
    energy_value = models.FloatField(null=True, blank=True, db_column="Energy_Value")

    class Meta:
        db_table = "CPT_To_Products"
        indexes = [
            models.Index(fields=["processing", "product_type_id", "product_subtype_id", "product"]),
        ]

class Allergen(models.Model):
    id = models.AutoField(primary_key=True, db_column="ID")
    name = models.CharField(max_length=255, db_column="Name")

    class Meta:
        db_table = 'Allergens'
        verbose_name = "Allergen"
        verbose_name_plural = "Allergens"

    def __str__(self):
        return self.name

class AllergenProduct(models.Model):
    SCOPE_TYPE = "type"
    SCOPE_SUBTYPE = "subtype"
    SCOPE_PRODUCT = "product"

    SCOPE_CHOICES = [
        (SCOPE_TYPE, "Type"),
        (SCOPE_SUBTYPE, "Subtype"),
        (SCOPE_PRODUCT, "Product"),
    ]

    id = models.AutoField(primary_key=True, db_column="ID")

    scope = models.CharField(max_length=16, choices=SCOPE_CHOICES, db_column="Scope")

    product_type = models.ForeignKey(
        FoodProductTypes,
        null=True, blank=True,
        on_delete=models.CASCADE,
        db_column="Product_Type_ID",
        related_name="allergen_rules"
    )
    product_subtype = models.ForeignKey(
        FoodProductSubtypes,
        null=True, blank=True,
        on_delete=models.CASCADE,
        db_column="Product_Subtype_ID",
        related_name="allergen_rules"
    )
    product = models.ForeignKey(
        FoodProducts,
        null=True, blank=True,
        on_delete=models.CASCADE,
        db_column="Product_ID",
        related_name="allergen_rules"
    )

    allergen = models.ForeignKey(
        Allergen,
        on_delete=models.CASCADE,
        db_column="Allergen_ID",
        related_name="rules"
    )

    class Meta:
        db_table = 'Allergen_Products'
        verbose_name = "Allergen rule"
        verbose_name_plural = "Allergen rules"

        # полезно, чтобы не плодить дублей правил
        constraints = [
            models.UniqueConstraint(
                fields=["scope", "product_type", "product_subtype", "product", "allergen"],
                name="uq_allergen_products_scope_target_allergen"
            )
        ]

    def __str__(self):
        return f"{self.scope}:{self.allergen_id}"

class NotChildProduct(models.Model):
    SCOPE_TYPE = "type"
    SCOPE_SUBTYPE = "subtype"
    SCOPE_PRODUCT = "product"

    SCOPE_CHOICES = [
        (SCOPE_TYPE, "Type"),
        (SCOPE_SUBTYPE, "Subtype"),
        (SCOPE_PRODUCT, "Product"),
    ]

    id = models.AutoField(primary_key=True, db_column="ID")
    scope = models.CharField(max_length=16, choices=SCOPE_CHOICES, db_column="Scope")

    product_type = models.ForeignKey(
        FoodProductTypes,
        null=True, blank=True,
        on_delete=models.CASCADE,
        db_column="Product_Type_ID",
        related_name="not_child_rules"
    )

    product_subtype = models.ForeignKey(
        FoodProductSubtypes,
        null=True, blank=True,
        on_delete=models.CASCADE,
        db_column="Product_Subtype_ID",
        related_name="not_child_rules"
    )

    product = models.ForeignKey(
        FoodProducts,
        null=True, blank=True,
        on_delete=models.CASCADE,
        db_column="Product_ID",
        related_name="not_child_rules"
    )

    class Meta:
        db_table = "Not_Child_Products"
        verbose_name = "Not child product rule"
        verbose_name_plural = "Not child product rules"
        constraints = [
            models.UniqueConstraint(
                fields=["scope", "product_type", "product_subtype", "product"],
                name="uq_not_child_scope_target"
            )
        ]

    def __str__(self):
        return f"NotChild(scope={self.scope}, product={self.product_id}, subtype={self.product_subtype_id}, type={self.product_type_id})"
    
class WorkActivityGroup(models.Model):
    """
    Справочник групп труда (I–V) с коэффициентом физической активности (КФА).
    """
    id = models.AutoField(primary_key=True, db_column="ID")  # 1..5
    name = models.TextField(max_length=255, db_column="Name")                  # например: "I — очень низкая активность"
    kfa_male = models.DecimalField(max_digits=4, decimal_places=2, db_column="KFA_Male")
    kfa_female = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True, db_column="KFA_Female")
    description = models.TextField(null=True, blank=True, db_column="Description")

    class Meta:
        db_table = "Work_Groups"
        managed = False

    def __str__(self):
        return f"{self.id}: {self.name}"

class BmrNorm(models.Model):
    """
    Нормативы основного обмена (BMR), ккал/сут, по полу + возрастному интервалу + узловому весу.
    """
    SEX_CHOICES = [
        ("male", "Male"),
        ("female", "Female"),
    ]

    id = models.AutoField(primary_key=True, db_column="ID")
    sex = models.CharField(max_length=6, choices=SEX_CHOICES, db_column="Sex")
    age_min = models.PositiveSmallIntegerField(db_column="Age_Min")
    age_max = models.PositiveSmallIntegerField(db_column="Age_Max")
    weight_kg = models.PositiveSmallIntegerField(db_column="Weight_kg")
    bmr_kcal_day = models.PositiveSmallIntegerField(db_column="BMR_Kcal_day")

    class Meta:
        db_table = "BMR_Norms"
        managed = False
        indexes = [
            models.Index(fields=["sex", "age_min", "age_max", "weight_kg"], name="idx_bmr_lookup"),
        ]

    def __str__(self):
        return f"{self.sex} {self.age_min}-{self.age_max}y {self.weight_kg}kg -> {self.bmr_kcal_day} kcal"

class ConsumerProfile(models.Model):
    """
    Профиль потребителя.
    """
    SEX_CHOICES = [
        ("male", "Male"),
        ("female", "Female"),
    ]

    id = models.BigAutoField(primary_key=True, db_column="ID")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        db_column="User_ID",
        related_name="consumer_profiles"
    )

    sex = models.CharField(max_length=6, choices=SEX_CHOICES, db_column="Sex")
    age_years = models.PositiveSmallIntegerField(db_column="Age_Years")
    height_cm = models.PositiveSmallIntegerField(db_column="Height_cm")
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, db_column="Weight_kg")

    # Ты сделал FK на справочник — это правильно
    work_group = models.ForeignKey(
        WorkActivityGroup,
        on_delete=models.PROTECT,
        db_column="Work_Group_ID",
        related_name="profiles"
    )

    has_minor_children = models.BooleanField(default=False, db_column="Has_Minor_Child")
    calorie_limit_kcal = models.PositiveIntegerField(null=True, blank=True, db_column="Calorie_Limit_Kcal")

    created_at = models.DateField(auto_now_add=True, null=True, blank=True, db_column="Created_at")
    updated_at = models.DateField(auto_now_add=True, null=True, blank=True, db_column="Updated_at")

    is_active = models.BooleanField(default=False, db_column="is_active")
    display_name = models.CharField(max_length=64, null=True, blank=True, db_column="display_name")

    class Meta:
        db_table = "Consumer_Profiles"
        managed = False

    def __str__(self):
        return f"Profile #{self.id} ({self.sex}, {self.age_years}y)"

class ProfileAllergen(models.Model):
    """
    Связь профиля с аллергенами (M2M через явную таблицу).
    """
    id = models.BigAutoField(primary_key=True, db_column="ID")

    profile = models.ForeignKey(
        ConsumerProfile,
        on_delete=models.CASCADE,
        db_column="Profile_ID",
        related_name="profile_allergens"
    )
    allergen = models.ForeignKey(
        Allergen,
        on_delete=models.CASCADE,
        db_column="Allergen_ID",
        related_name="profile_allergens"
    )

    class Meta:
        db_table = "Profile_Allergens"
        managed = False
        constraints = [
            models.UniqueConstraint(fields=["profile", "allergen"], name="uq_profile_allergen"),
        ]

class ConsumerGoal(models.Model):
    GOAL_LOSE_WEIGHT = "lose_weight"
    GOAL_GAIN_MUSCLE = "gain_muscle"
    GOAL_MAINTAIN = "maintain"

    GOAL_TYPE_CHOICES = [
        (GOAL_LOSE_WEIGHT, "Lose weight"),
        (GOAL_GAIN_MUSCLE, "Gain muscle"),
        (GOAL_MAINTAIN, "Maintain"),
    ]

    id = models.AutoField(primary_key=True)

    # FK на существующую таблицу ConsumerProfiles (у неё PK в колонке "ID")
    profile = models.ForeignKey(
        "ConsumerProfile",
        on_delete=models.CASCADE,
        db_column="profile_id",
        related_name="goals",
    )

    title = models.TextField(null=True, blank=True, db_column="title")
    goal_type = models.TextField(choices=GOAL_TYPE_CHOICES, db_column="goal_type")

    energy_delta_kcal = models.IntegerField(
        null=True, blank=True, db_column="energy_delta_kcal"
    )

    protein_pct = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, db_column="protein_pct"
    )
    fat_pct = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, db_column="fat_pct"
    )
    carb_pct = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True, db_column="carb_pct"
    )
    preferences_replace_base = models.BooleanField(
        default=False,
        db_column="preferences_replace_base",
    )

    is_active = models.BooleanField(default=False, db_column="is_active")

    created_at = models.DateField(auto_now_add=True, db_column="created_at")
    updated_at = models.DateField(auto_now=True, db_column="updated_at")

    class Meta:
        managed = False
        db_table = "Consumer_Goals"

    def __str__(self) -> str:
        return f"Goal {self.id} for profile {self.profile_id} ({self.goal_type})"
    
class NutrientDictionary(models.Model):
    """
    Справочник нутриентов (ручное ведение в PostgreSQL).

    Вариант B:
    - code: нормализованный ключ (то, что хранится в preferences)
    - source_group + source_field: откуда брать значение в JSON продукта (ключи из ваших serializer полей)
    """

    GROUP_MACROS = "macros"
    GROUP_MINERALS = "minerals"
    GROUP_VITAMINS = "vitamins"
    GROUP_OTHER = "other"
    GROUP_FAT_ACIDS = "fat_acids"

    GROUP_CHOICES = (
        (GROUP_MACROS, "Макронутриенты"),
        (GROUP_MINERALS, "Минералы"),
        (GROUP_VITAMINS, "Витамины"),
        (GROUP_OTHER, "Прочее"),
        (GROUP_FAT_ACIDS, "Жирные кислоты"),
    )

    id = models.BigAutoField(primary_key=True)

    code = models.TextField(unique=True)

    source_group = models.CharField(max_length=32, choices=GROUP_CHOICES)
    source_field = models.TextField()

    ru_name = models.TextField()
    unit = models.CharField(max_length=16, null=True, blank=True)

    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=1000)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "Nutrient_Dictionary"
        constraints = [
            models.UniqueConstraint(
                fields=["source_group", "source_field"],
                name="uq_nutrient_dictionary_source",
            )
        ]
        indexes = [
            models.Index(fields=["source_group", "sort_order", "ru_name"], name="ix_nd_group_order"),
            models.Index(fields=["is_active"], name="ix_nd_active"),
        ]

    def __str__(self):
        return f"{self.code} ({self.get_source_group_display()} / {self.ru_name})"

class GoalNutrientPreference(models.Model):
    DIRECTION_MORE = "more"
    DIRECTION_LESS = "less"
    DIRECTION_CHOICES = [
        (DIRECTION_MORE, "More"),
        (DIRECTION_LESS, "Less"),
    ]

    id = models.AutoField(primary_key=True)

    goal = models.ForeignKey(
        ConsumerGoal,
        on_delete=models.CASCADE,
        db_column="goal_id",
        related_name="nutrient_preferences",
    )

    nutrient_code = models.ForeignKey(
        NutrientDictionary,
        to_field="code",
        on_delete=models.CASCADE,
        db_column="nutrient_code",
        related_name="nutrient_code"
    )

    direction = models.TextField(choices=DIRECTION_CHOICES, db_column="direction")
    priority = models.SmallIntegerField(null=True, blank=True, db_column="priority")

    class Meta:
        managed = False
        db_table = "Goal_Nutrient_Preferences"

    def __str__(self) -> str:
        return f"{self.goal_id}: {self.nutrient_code} -> {self.direction}"

class NutrientStats(models.Model):
    nutrient_code = models.TextField(primary_key=True, db_column="nutrient_code")
    unit = models.TextField(null=True, blank=True, db_column="unit")

    min_value = models.FloatField(null=True, blank=True, db_column="min_value")
    max_value = models.FloatField(null=True, blank=True, db_column="max_value")
    p05 = models.FloatField(null=True, blank=True, db_column="p05")
    p50 = models.FloatField(null=True, blank=True, db_column="p50")
    p95 = models.FloatField(null=True, blank=True, db_column="p95")
    n = models.IntegerField(default=0, db_column="n")

    computed_at = models.DateTimeField(auto_now=True, db_column="computed_at")
    method = models.TextField(default="p05_p95", db_column="method")

    class Meta:
        managed = False
        db_table = "Nutrient_Stats"

class Cart(models.Model):
    id = models.BigAutoField(primary_key=True, db_column="id")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, db_column="user_id")
    is_active = models.BooleanField(default=True, db_column="is_active")

    class Meta:
        managed = False
        db_table = "Cart"

class CartItem(models.Model):
    id = models.BigAutoField(primary_key=True, db_column="id")
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, db_column="cart_id", related_name="items")
    food_product_id = models.IntegerField(db_column="food_product_id")  # FK на FoodProducts.ID можно оставить int
    quantity = models.IntegerField(default=1, db_column="quantity")
    g_num = models.FloatField(null=True, blank=True, db_column="g_num")

    class Meta:
        managed = False
        db_table = "Cart_Item"

class MacronutrientsNormsMR(models.Model):
    SEX_CHOICES = [
        ("male", "Male"),
        ("female", "Female"),
    ]
    id = models.IntegerField(primary_key=True, db_column="id")
    sex = models.CharField(max_length=6, choices=SEX_CHOICES, db_column="sex")
    work_group = models.ForeignKey(WorkActivityGroup, on_delete=models.CASCADE, db_column="work_group_id", related_name="macronorms_mr")
    age_min = models.IntegerField(db_column="age_min")
    age_max = models.IntegerField(db_column="age_max", null=True)
    energy_kcal = models.IntegerField(db_column="energy, kcal")
    protein_g = models.IntegerField(db_column="protein, g")
    fats_g = models.IntegerField(db_column="fats, g")
    carbs_g = models.IntegerField(db_column="carbs, g")
    dietary_fibers_min_g = models.IntegerField(db_column="dietary_fibers_min, g")
    dietary_fibers_max_g = models.IntegerField(db_column="dietary_fibers_max, g")
    water_min_g = models.FloatField(db_column="water_min_g", null=True, blank=True)
    water_max_g = models.FloatField(db_column="water_max_g", null=True, blank=True)
    mds_min_g_ev = models.IntegerField(db_column="mds_min_g_%%EV", null=True, blank=True)
    mds_max_g_ev = models.IntegerField(db_column="mds_max_g_%%EV", null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'Macronutrients_Norms_MR'

class VitaminsNormsMR(models.Model):
    SEX_CHOICES = [
        ("male", "Male"),
        ("female", "Female"),
    ]
    id = models.IntegerField(primary_key=True, db_column="id")
    sex = models.CharField(max_length=6, choices=SEX_CHOICES, db_column="sex")
    name = models.TextField(db_column="name")
    norm = models.FloatField(db_column="norm")

    class Meta:
        managed = False
        db_table = 'Vitamins_Norms_MR'

class MineralsNormsMR(models.Model):
    SEX_CHOICES = [
        ("male", "Male"),
        ("female", "Female"),
    ]
    id = models.IntegerField(primary_key=True, db_column="id")
    sex = models.CharField(max_length=6, choices=SEX_CHOICES, db_column="sex")
    name = models.TextField(db_column="name")
    norm = models.IntegerField(db_column="norm")

    class Meta:
        managed = False
        db_table = 'Minerals_Norms_MR'


class OtherNutrientsNormsMR(models.Model):
    id = models.IntegerField(primary_key=True, db_column="ID")
    organic_acids_g = models.FloatField(db_column="Organic_Acids_g", null=True, blank=True)

    class Meta:
        managed = False
        db_table = "Other_Nutrients_Norms_MR"


class FatAcidsNormsMR(models.Model):
    id = models.IntegerField(primary_key=True, db_column="ID")
    nlc_g_ev = models.FloatField(db_column="NLC_g_%%EV", null=True, blank=True)
    pufa_g_ev = models.FloatField(db_column="PUFA_g_%%EV", null=True, blank=True)
    cholesterol_mg = models.FloatField(db_column="cholesterol_mg", null=True, blank=True)

    class Meta:
        managed = False
        db_table = "Fat_Acids_Norms_MR"
