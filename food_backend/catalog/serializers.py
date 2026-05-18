from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from decimal import Decimal
from .models import (FoodProductTypes, FoodProducts, Macronutrients, Minerals,
                     Vitamins, OtherNutrients, FatAcids, FoodProductSubtypes, Allergen, ConsumerProfile, WorkActivityGroup,
                     ProfileAllergen, ConsumerGoal, GoalNutrientPreference, NutrientDictionary)
from catalog.utils.allergens import get_allergens_for_product
from catalog.utils.child_rules import pick_not_child_rule
from catalog.utils.energy_calc import calculate_bmi, calculate_tdee_for_profile

User = get_user_model()

# --- справочник типов ---
class FoodProductTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = FoodProductTypes
        fields = ["id", "name"]

class FoodProductSubtypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = FoodProductSubtypes
        fields = ["id", "name", "product_type"]

# --- нутриенты с нормализованными именами полей ---

class MacronutrientsSerializer(serializers.ModelSerializer):
    protein_g     = serializers.FloatField(source="protein_g_field", required=False, allow_null=True)
    fats_g        = serializers.FloatField(source="fats_g_field", required=False, allow_null=True)
    carbs_g       = serializers.FloatField(source="carbs_g_field", required=False, allow_null=True)
    mds_g         = serializers.FloatField(source="mds_g_field", required=False, allow_null=True)
    starch_g      = serializers.FloatField(source="starch_g_field", required=False, allow_null=True)
    water_g       = serializers.FloatField(source="water_g_field", required=False, allow_null=True)
    energy_kcal   = serializers.FloatField(source="energy_value_kcal_field", required=False, allow_null=True)
    dietary_fiber_g = serializers.FloatField(source="dietary_fiber_g_field", required=False, allow_null=True)

    class Meta:
        model = Macronutrients
        fields = ["protein_g","fats_g","carbs_g","mds_g","starch_g","water_g","energy_kcal","dietary_fiber_g"]


class MineralsSerializer(serializers.ModelSerializer):
    na_mg = serializers.FloatField(source="na_mg_field", required=False, allow_null=True)
    k_mg  = serializers.FloatField(source="k_mg_field", required=False, allow_null=True)
    ca_mg = serializers.FloatField(source="ca_mg_field", required=False, allow_null=True)
    mg_mg = serializers.FloatField(source="mg_mg_field", required=False, allow_null=True)
    p_mg  = serializers.FloatField(source="p_mg_field", required=False, allow_null=True)
    fe_mg = serializers.FloatField(source="fe_mg_field", required=False, allow_null=True)
    ash_g = serializers.FloatField(source="ash_g_field", required=False, allow_null=True)

    class Meta:
        model = Minerals
        fields = ["na_mg","k_mg","ca_mg","mg_mg","p_mg","fe_mg","ash_g"]


class VitaminsSerializer(serializers.ModelSerializer):
    a_mg              = serializers.FloatField(source="a_vitamin_mg_field", required=False, allow_null=True)
    beta_carotene_mg  = serializers.FloatField(source="beta_carotene_mg_field", required=False, allow_null=True)
    b1_mg             = serializers.FloatField(source="b1_vitamin_mg_field", required=False, allow_null=True)
    b2_mg             = serializers.FloatField(source="b2_vitamin_mg_field", required=False, allow_null=True)
    pp_mg             = serializers.FloatField(source="pp_vitamin_mg_field", required=False, allow_null=True)
    c_mg              = serializers.FloatField(source="c_vitamin_mg_field", required=False, allow_null=True)
    retinol_index     = serializers.FloatField(required=False, allow_null=True)
    tocopherol_index  = serializers.FloatField(required=False, allow_null=True)
    niacin_index      = serializers.FloatField(required=False, allow_null=True)

    class Meta:
        model = Vitamins
        fields = ["a_mg","beta_carotene_mg","b1_mg","b2_mg","pp_mg","c_mg",
                  "retinol_index","tocopherol_index","niacin_index"]


class OtherNutrientsSerializer(serializers.ModelSerializer):
    organic_acids_g = serializers.FloatField(source="organic_acids_g_field", required=False, allow_null=True)
    # после твоего переименования 'Alcohol (%)' -> 'Alcohol_pct' в модели поле, вероятно, называется alcohol_pct
    alcohol_pct     = serializers.FloatField(source="alcohol_field", required=False, allow_null=True)

    class Meta:
        model = OtherNutrients
        fields = ["organic_acids_g","alcohol_pct"]


class FatAcidsSerializer(serializers.ModelSerializer):
    nlc_g        = serializers.FloatField(source="nlc_g_field", required=False, allow_null=True)
    pufa_g       = serializers.FloatField(source="pufa_g_field", required=False, allow_null=True)
    cholesterol_g = serializers.FloatField(source="cholesterin_g_field", required=False, allow_null=True)

    class Meta:
        model = FatAcids
        fields = ["nlc_g","pufa_g","cholesterol_g"]


# --- продукт со вложенными нутриентами ---
class FoodProductSerializer(serializers.ModelSerializer):
    allergens = serializers.SerializerMethodField()
    is_allergen = serializers.SerializerMethodField()

    def _get_allergens_cached(self, obj):
        if not hasattr(obj, "_catalog_allergens_cache"):
            obj._catalog_allergens_cache = get_allergens_for_product(obj)
        return obj._catalog_allergens_cache

    def _get_child_rule_cached(self, obj):
        if not hasattr(obj, "_catalog_child_rule_cache"):
            obj._catalog_child_rule_cache = pick_not_child_rule(obj)
        return obj._catalog_child_rule_cache

    def get_allergens(self, obj):
        return self._get_allergens_cached(obj)

    def get_is_allergen(self, obj):
        return len(self._get_allergens_cached(obj)) > 0
    
    is_child_allowed = serializers.SerializerMethodField()
    child_restriction_level = serializers.SerializerMethodField()

    def get_is_child_allowed(self, obj):
        rule, level = self._get_child_rule_cached(obj)
        return rule is None  # если есть запись в Not_Child_Products → нельзя

    def get_child_restriction_level(self, obj):
        rule, level = self._get_child_rule_cached(obj)
        return level if rule else None
    
    type = FoodProductTypeSerializer(read_only=True)
    subtype = FoodProductSubtypeSerializer(read_only=True)
    subtype_id = serializers.PrimaryKeyRelatedField(
        source="subtype",
        queryset=FoodProductSubtypes.objects.all(),
        write_only=True,
    )
    macros = MacronutrientsSerializer(read_only=True)
    minerals = MineralsSerializer(read_only=True)
    vitamins = VitaminsSerializer(read_only=True)
    other_nutrients = OtherNutrientsSerializer(read_only=True)
    fat_acids = FatAcidsSerializer(read_only=True)

    class Meta:
        model = FoodProducts
        fields = ["id",
                  "name",
                  "type",
                  "subtype",
                  "subtype_id",
                  "is_complex",
                  "macros",
                  "minerals",
                  "vitamins",
                  "other_nutrients",
                  "fat_acids",
                  "allergens",
                  "is_allergen",
                  "is_child_allowed",
                  "child_restriction_level"]

class AllergenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allergen
        fields = ["id", "name"]

class WorkActivityGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkActivityGroup
        fields = ["id", "name", "kfa_male", "kfa_female", "description"]

class ConsumerProfileSerializer(serializers.ModelSerializer):
    # work_group как FK: принимаем id, отдаём объект кратко
    work_group_id = serializers.PrimaryKeyRelatedField(
        source="work_group",
        queryset=WorkActivityGroup.objects.all(),
        write_only=True,
        required=True,
    )
    work_group = WorkActivityGroupSerializer(read_only=True)

    # аллергены: принимаем список id, отдаём список аллергенов
    allergen_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
    )
    allergens = serializers.SerializerMethodField(read_only=True)

    # расчётные поля
    bmi = serializers.SerializerMethodField(read_only=True)
    energy = serializers.SerializerMethodField(read_only=True)  # bmr/kfa/tdee + debug

    class Meta:
        model = ConsumerProfile
        fields = [
            "id",
            "user",

            "sex",
            "age_years",
            "height_cm",
            "weight_kg",

            "work_group_id",
            "work_group",

            "has_minor_children",

            "created_at",
            "updated_at",

            "allergen_ids",
            "allergens",

            "bmi",
            "energy",
            "is_active",
            "display_name",
        ]
        read_only_fields = ["created_at", "updated_at", "user"]

    def get_allergens(self, obj: ConsumerProfile):
        # через таблицу-связку
        ids = ProfileAllergen.objects.filter(profile=obj).values_list("allergen_id", flat=True)
        qs = Allergen.objects.filter(id__in=list(ids)).order_by("name")
        return AllergenSerializer(qs, many=True).data

    def get_bmi(self, obj: ConsumerProfile):
        return calculate_bmi(obj.height_cm, float(obj.weight_kg))

    def get_energy(self, obj: ConsumerProfile):
        """
        Возвращаем расчёт энерготрат.
        В debug — какие узлы веса/диапазон возрастов выбраны (полезно для проверки).
        """
        try:
            res = calculate_tdee_for_profile(obj)
            return {
                "bmr_kcal_day": res.bmr_kcal_day,
                "kfa": res.kfa,
                "tdee_kcal_day": res.tdee_kcal_day,
                "debug": {
                    "age_band": f"{res.age_min}-{res.age_max}",
                    "weight_nodes": {
                        "left": res.w_left,
                        "right": res.w_right,
                        "bmr_left": res.bmr_left,
                        "bmr_right": res.bmr_right,
                    },
                },
            }
        except Exception as e:
            # не роняем профиль, просто сообщаем ошибку расчёта
            return {"error": str(e)}

    def validate(self, attrs):
        """
        Мини-валидации MVP:
        - взрослый профиль: age >= 18
        - sex: male/female (модель уже ограничивает choices)
        - группа труда V доступна только для профилей 65+
        """
        age = attrs.get("age_years", getattr(self.instance, "age_years", None))
        wg = attrs.get("work_group", getattr(self.instance, "work_group", None))

        if age is not None and int(age) < 18:
            raise serializers.ValidationError({"age_years": "Профиль взрослого: возраст должен быть >= 18."})

        if wg is not None and int(wg.id) == 5 and age is not None and int(age) < 65:
            raise serializers.ValidationError({"work_group_id": "Группа труда V доступна только для профилей 65+."})

        return attrs

    def create(self, validated_data):
        allergen_ids = validated_data.pop("allergen_ids", None)
        profile = super().create(validated_data)
        if allergen_ids is not None:
            self._set_profile_allergens(profile, allergen_ids)
        return profile

    def update(self, instance, validated_data):
        allergen_ids = validated_data.pop("allergen_ids", None)
        profile = super().update(instance, validated_data)
        if allergen_ids is not None:
            self._set_profile_allergens(profile, allergen_ids)
        return profile

    def _set_profile_allergens(self, profile: ConsumerProfile, allergen_ids):
        allergen_ids = list({int(x) for x in allergen_ids})  # unique
        # удаляем старые
        ProfileAllergen.objects.filter(profile=profile).delete()
        # создаём новые
        rows = [
            ProfileAllergen(profile=profile, allergen_id=aid)
            for aid in allergen_ids
        ]
        if rows:
            ProfileAllergen.objects.bulk_create(rows)


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    display_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    sex = serializers.ChoiceField(choices=ConsumerProfile.SEX_CHOICES, required=False)
    age_years = serializers.IntegerField(required=False, min_value=18)
    height_cm = serializers.IntegerField(required=False, min_value=1)
    weight_kg = serializers.DecimalField(required=False, max_digits=6, decimal_places=2, min_value=Decimal("0.01"))
    work_group_id = serializers.PrimaryKeyRelatedField(
        source="work_group",
        queryset=WorkActivityGroup.objects.all(),
        required=False,
    )
    has_minor_children = serializers.BooleanField(required=False, default=False)
    allergen_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=True,
    )

    PROFILE_CREATE_FIELDS = (
        "display_name",
        "sex",
        "age_years",
        "height_cm",
        "weight_kg",
        "work_group",
        "has_minor_children",
    )
    PROFILE_REQUIRED_FIELDS = ("sex", "age_years", "height_cm", "weight_kg", "work_group")

    def validate_username(self, value):
        username = value.strip()
        if not username:
            raise serializers.ValidationError("Логин не может быть пустым.")
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError("Пользователь с таким логином уже существует.")
        return username

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        return attrs

    def create(self, validated_data):
        allergen_ids = list({int(x) for x in validated_data.pop("allergen_ids", [])})
        profile_payload = {}
        for field_name in self.PROFILE_CREATE_FIELDS:
            if field_name in validated_data:
                profile_payload[field_name] = validated_data.pop(field_name)

        user = User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
        )

        self.profile_input_provided = bool(profile_payload or allergen_ids)
        self.profile_created = False
        self.profile_skipped_incomplete = False

        has_complete_profile_payload = all(
            profile_payload.get(field_name) not in (None, "")
            for field_name in self.PROFILE_REQUIRED_FIELDS
        )

        if has_complete_profile_payload:
            profile = ConsumerProfile.objects.create(
                user=user,
                is_active=True,
                **profile_payload,
            )
            if allergen_ids:
                valid_allergen_ids = set(Allergen.objects.filter(id__in=allergen_ids).values_list("id", flat=True))
                rows = [
                    ProfileAllergen(profile=profile, allergen_id=aid)
                    for aid in allergen_ids
                    if aid in valid_allergen_ids
                ]
                if rows:
                    ProfileAllergen.objects.bulk_create(rows)
            self.profile_created = True
        elif self.profile_input_provided:
            self.profile_skipped_incomplete = True

        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    remember_me = serializers.BooleanField(required=False, default=False)


class CurrentUserSerializer(serializers.ModelSerializer):
    has_profiles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "has_profiles"]

    def get_has_profiles(self, obj):
        return ConsumerProfile.objects.filter(user=obj).exists()

class GoalNutrientPreferenceListSerializer(serializers.ListSerializer):
    def validate(self, data):
        def to_code(v):
            if v is None:
                return None
            if isinstance(v, str):
                return v.strip()
            return getattr(v, "code", None)

        codes = []
        for item in data:
            code = to_code(item.get("nutrient_code"))
            if not code:
                raise serializers.ValidationError({"nutrient_code": "nutrient_code is required"})
            codes.append(code)

        if len(set(codes)) != len(codes):
            dupes = sorted({c for c in codes if codes.count(c) > 1})
            raise serializers.ValidationError({"nutrient_code": f"Duplicate codes: {dupes}"})

        return data

class GoalNutrientPreferenceSerializer(serializers.ModelSerializer):
    nutrient_code = serializers.SlugRelatedField(
        slug_field="code",
        queryset=NutrientDictionary.objects.filter(is_active=True),
    )

    class Meta:
        model = GoalNutrientPreference
        fields = ["id", "nutrient_code", "direction", "priority"]
        list_serializer_class = GoalNutrientPreferenceListSerializer
        extra_kwargs = {"priority": {"required": False, "allow_null": True}}

    def validate_direction(self, value):
        value = (value or "").strip().lower()
        if value not in ("more", "less"):
            raise serializers.ValidationError("direction must be 'more' or 'less'.")
        return value

    def validate_priority(self, value):
        if value is None:
            return 2
        if int(value) < 1 or int(value) > 3:
            raise serializers.ValidationError("priority must be in range 1..3.")
        return value

class ConsumerGoalSerializer(serializers.ModelSerializer):
    profile_id = serializers.PrimaryKeyRelatedField(
        source="profile",
        queryset=ConsumerProfile.objects.all(),
        write_only=True,
        required=True,
    )

    profile = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = ConsumerGoal
        fields = [
            "id",
            "profile_id",  
            "profile",    
            "title",
            "goal_type",
            "energy_delta_kcal",
            "protein_pct",
            "fat_pct",
            "carb_pct",
            "preferences_replace_base",
            "is_active",
            "created_at",
            "updated_at",
        ]

    def _apply_defaults(self, validated_data: dict) -> dict:
        # Если цель "похудение" и Δ не задан — ставим дефолтный дефицит
        # Основание: клин. рекомендации Минздрава РФ по ожирению: дефицит 500–700 ккал/сут. [web:200]
        goal_type = validated_data.get("goal_type")
        delta = validated_data.get("energy_delta_kcal", None)

        if goal_type == "lose_weight" and delta is None:
            validated_data["energy_delta_kcal"] = -600  # внутри диапазона 500–700

        # Для остальных целей — если delta не задан, можно оставить 0 (или None, но удобнее 0)
        if validated_data.get("energy_delta_kcal", None) is None:
            validated_data["energy_delta_kcal"] = 0

        return validated_data

    def validate(self, attrs):
        attrs = super().validate(attrs)

        protein_pct = attrs.get("protein_pct", getattr(self.instance, "protein_pct", None))
        fat_pct = attrs.get("fat_pct", getattr(self.instance, "fat_pct", None))
        carb_pct = attrs.get("carb_pct", getattr(self.instance, "carb_pct", None))

        provided = [protein_pct, fat_pct, carb_pct]
        provided_count = sum(v is not None for v in provided)

        if provided_count not in (0, 3):
            raise serializers.ValidationError(
                "Для ручного режима нужно задать все три процента: белки, жиры и углеводы."
            )

        if provided_count == 3:
            values = {
                "protein_pct": float(protein_pct),
                "fat_pct": float(fat_pct),
                "carb_pct": float(carb_pct),
            }

            for field, value in values.items():
                if value < 0 or value > 100:
                    raise serializers.ValidationError({field: "Значение должно быть в диапазоне 0..100."})

            total = sum(values.values())
            if abs(total - 100.0) > 0.01:
                raise serializers.ValidationError("Сумма процентов БЖУ должна быть равна 100.")

        return attrs

    def create(self, validated_data):
        validated_data = self._apply_defaults(validated_data)
        goal = super().create(validated_data)
        return goal

    def update(self, instance, validated_data):
        validated_data = self._apply_defaults(validated_data)
        goal = super().update(instance, validated_data)
        return goal
    
class NutrientDictionarySerializer(serializers.ModelSerializer):
    class Meta:
        model = NutrientDictionary
        fields = (
            "code",
            "ru_name",
            "unit",
            "source_group",
            "source_field",
            "sort_order",
            "is_active",
        )
        read_only_fields = fields
