from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.permissions import IsAuthenticated, AllowAny

from .models import (FoodProductTypes, FoodProducts, Macronutrients, Minerals,
                     Vitamins, OtherNutrients, FatAcids, CulinaryProcessingType, Allergen,
                     ConsumerProfile, WorkActivityGroup, ProfileAllergen, ConsumerGoal, GoalNutrientPreference,
                     NutrientDictionary, FoodProductSubtypes)
from .serializers import (FoodProductTypeSerializer, FoodProductSerializer,
                          MacronutrientsSerializer, MineralsSerializer,
                          VitaminsSerializer, OtherNutrientsSerializer,
                          FatAcidsSerializer, AllergenSerializer, 
                          ConsumerProfileSerializer, WorkActivityGroupSerializer,
                          ConsumerGoalSerializer, GoalNutrientPreferenceSerializer, NutrientDictionarySerializer,
                          FoodProductSubtypeSerializer)
from .services.processing_calc import compute_processed_nutrients
from .services.processing_calc import pick_processing_rule
from catalog.utils.energy_calc import calculate_bmi, calculate_tdee_for_profile
from catalog.utils.targets import compute_targets_for_profile

import hashlib, json

from rest_framework import status
from rest_framework import generics

from rest_framework.views import APIView
from django.db import transaction
from django.shortcuts import get_object_or_404

from catalog.utils.allergens import get_allergens_for_product
from catalog.services.recommendations import recommend

class FoodProductTypeViewSet(viewsets.ModelViewSet):
    queryset = FoodProductTypes.objects.all().order_by("id")
    serializer_class = FoodProductTypeSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["id", "name"]

class FoodProductSubtypeViewSet(viewsets.ModelViewSet):
    queryset = FoodProductSubtypes.objects.all().order_by("id")
    serializer_class = FoodProductSubtypeSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["id", "name"]

class FoodProductViewSet(viewsets.ModelViewSet):
    queryset = FoodProducts.objects.prefetch_related(
        "subtype",
        "subtype__product_type",
        "macros",
        "minerals",
        "vitamins",
        "other_nutrients",
        "fat_acids",
    ).order_by("id")
    serializer_class = FoodProductSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        # фильтрация по подтипу
        "subtype": ["exact"],
        "subtype__name": ["exact", "icontains"],

        # фильтрация по типу (через подтип)
        "subtype__product_type": ["exact"],
        "subtype__product_type__name": ["exact", "icontains"],

        "is_complex": ["exact"]
    }
    search_fields = ["name"]
    ordering_fields = ["id", "name"]

    @action(detail=False, methods=["get"], url_path="with_nutrients")
    def with_nutrients(self, request):
        """Возвращает все продукты с пищевой ценностью."""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = FoodProductSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = FoodProductSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=["get"], url_path="processing-options")
    def processing_options(self, request, pk=None):
        """
        Возвращает список обработок, применимых к продукту по CPT_To_Products.
        Фронт добавляет "Без обработки" самостоятельно.
        """
        product = self.get_object()

        options = []
        # В справочнике типов обработки у тебя ~180 записей — можно спокойно перебрать.
        for pt in CulinaryProcessingType.objects.all().order_by("id"):
            rule, scope = pick_processing_rule(product, pt.id)
            if rule is None:
                continue  # нет применимого правила — не показываем обработку

            options.append({
                "processing_id": pt.id,
                "name": pt.name,
                "rule_id": rule.id,
                "rule_scope": scope,   # "product" | "subtype" | "type"
            })

        return Response({
            "product_id": product.id,
            "is_complex": int(getattr(product, "is_complex", 0) or 0),
            "options": options
        })
    
    @action(detail=True, methods=["get"], url_path="processed")
    def processed(self, request, pk=None):
        processing_id = request.query_params.get("processing_id")
        if processing_id in (None, "", "none", "null"):
            return Response({"detail": "processing_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            processing_id_int = int(processing_id)
        except (TypeError, ValueError):
            return Response({"detail": "processing_id must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        weight = request.query_params.get("weight")
        weight_g = None
        if weight not in (None, "", "null"):
            try:
                weight_g = float(weight)
                if weight_g <= 0:
                    return Response({"detail": "weight must be > 0"}, status=status.HTTP_400_BAD_REQUEST)
            except ValueError:
                return Response({"detail": "weight must be a number"}, status=status.HTTP_400_BAD_REQUEST)

        product = self.get_object()
        rule, _scope = pick_processing_rule(product, processing_id_int)
        if rule is None:
            return Response({"detail": "processing rule not found for this product"}, status=status.HTTP_400_BAD_REQUEST)
        data = compute_processed_nutrients(product, processing_id_int, weight_g=weight_g)
        return Response(data)
    
    @action(detail=False, methods=["get"], url_path="export", pagination_class=None)
    def export(self, request):
        """
        Полный экспорт каталога: продукт + нутриенты одним JSON массивом.
        Без пагинации, чтобы сохранить локальную копию на фронте.
        """
        qs = self.filter_queryset(
            FoodProducts.objects
            .select_related("subtype","subtype__product_type")
            .prefetch_related("macros","minerals","vitamins","other_nutrients","fat_acids")
            .order_by("id")
        )
        qs = self.filter_queryset(qs).distinct()
        data = FoodProductSerializer(qs, many=True).data

        # Версия зависит от содержимого экспорта, поэтому меняется при правках нутриентов
        # без изменения текущей схемы БД.
        version_seed = json.dumps(data, sort_keys=True, ensure_ascii=False, default=str)
        version = hashlib.sha256(version_seed.encode("utf-8")).hexdigest()[:12]

        # Можно положить версию в заголовок и в тело.
        resp = Response({"version": version, "items": data})
        resp["X-Catalog-Version"] = version
        return resp

class MacronutrientsViewSet(viewsets.ModelViewSet):
    queryset = Macronutrients.objects.select_related("food_product").all()
    serializer_class = MacronutrientsSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["food_product"]

class MineralsViewSet(viewsets.ModelViewSet):
    queryset = Minerals.objects.select_related("food_product").all()
    serializer_class = MineralsSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["food_product"]

class VitaminsViewSet(viewsets.ModelViewSet):
    queryset = Vitamins.objects.select_related("food_product").all()
    serializer_class = VitaminsSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["food_product"]

class OtherNutrientsViewSet(viewsets.ModelViewSet):
    queryset = OtherNutrients.objects.select_related("food_product").all()
    serializer_class = OtherNutrientsSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["food_product"]

class FatAcidsViewSet(viewsets.ModelViewSet):
    queryset = FatAcids.objects.select_related("food_product").all()
    serializer_class = FatAcidsSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["food_product"]

class AllergenListView(viewsets.ModelViewSet):
    queryset = Allergen.objects.all().order_by("name")
    serializer_class = AllergenSerializer

class ProductAllergensView(APIView):
    def get(self, request, product_id):
        product = get_object_or_404(
            FoodProducts.objects.select_related("subtype", "subtype__product_type"),
            id=product_id
        )
        allergens = get_allergens_for_product(product)
        return Response({
            "product_id": product.id,
            "is_allergen": len(allergens) > 0,
            "allergens": allergens,
        })

class WorkActivityGroupViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = WorkActivityGroup.objects.all().order_by("id")
    serializer_class = WorkActivityGroupSerializer

class ConsumerProfileViewSet(viewsets.ModelViewSet):
    """
    CRUD для профилей.
    Пока без авторизации можно работать со всеми профилями (для теста).
    Позже ограничим queryset профилями request.user.
    """
    queryset = ConsumerProfile.objects.all().order_by("-id")
    serializer_class = ConsumerProfileSerializer

    def _scope_qs(self, profile: ConsumerProfile):
        """
        Пока нет авторизации:
        - если profile.user != NULL -> активность в рамках этого user
        - если user NULL -> считаем "гостевой" областью (все user IS NULL)
        """
        if getattr(profile, "user_id", None) is not None:
            return ConsumerProfile.objects.filter(user_id=profile.user_id)
        return ConsumerProfile.objects.filter(user__isnull=True)

    @action(detail=False, methods=["get"], url_path="active")
    def active(self, request):
        """
        GET /api/consumer/profiles/active/
        Пока без auth: возвращаем активный guest-профиль (user IS NULL),
        позже — активный профиль request.user.
        """
        qs = ConsumerProfile.objects.filter(user__isnull=True, is_active=True).order_by("-id")
        obj = qs.first()
        if not obj:
            return Response({"detail": "Active profile not set"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=["post"], url_path="set-active")
    def set_active(self, request, pk=None):
        """
        POST /api/consumer/profiles/<id>/set-active/
        Делает профиль активным (и снимает активность с остальных в этой области).
        """
        profile = self.get_object()
        scope = self._scope_qs(profile)

        with transaction.atomic():
            scope.update(is_active=False)
            ConsumerProfile.objects.filter(pk=profile.pk).update(is_active=True)

        # перечитываем
        profile.refresh_from_db()
        return Response(self.get_serializer(profile).data)

    @action(detail=True, methods=["get"])
    def energy(self, request, pk=None):
        """
        GET /api/consumer/profiles/<id>/energy/
        Возвращает BMI + BMR/KFA/TDEE.
        """
        profile = self.get_object()
        try:
            res = calculate_tdee_for_profile(profile)
            return Response({
                "profile_id": profile.id,
                "bmi": calculate_bmi(profile.height_cm, float(profile.weight_kg)),
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
            })
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["put"], url_path="allergens")
    def set_allergens(self, request, pk=None):
        """
        PUT /api/consumer/profiles/<id>/allergens/
        body: { "allergen_ids": [1,2,3] }
        """
        profile = self.get_object()
        allergen_ids = request.data.get("allergen_ids", [])
        if not isinstance(allergen_ids, list):
            return Response({"error": "allergen_ids must be a list"}, status=400)

        allergen_ids = list({int(x) for x in allergen_ids})

        # валидация существования аллергенов
        existing = set(Allergen.objects.filter(id__in=allergen_ids).values_list("id", flat=True))
        missing = [x for x in allergen_ids if x not in existing]
        if missing:
            return Response({"error": f"Unknown allergen ids: {missing}"}, status=400)

        ProfileAllergen.objects.filter(profile=profile).delete()
        rows = [ProfileAllergen(profile=profile, allergen_id=aid) for aid in allergen_ids]
        if rows:
            ProfileAllergen.objects.bulk_create(rows)

        return Response({"profile_id": profile.id, "allergen_ids": allergen_ids})

class ConsumerGoalViewSet(viewsets.ModelViewSet):
    """
    /api/consumer/goals/                 CRUD по целям
    /api/consumer/goals/active/?profile=  активная цель профиля (MVP, т.к. без auth)
    /api/consumer/goals/{id}/set-active/ сделать цель активной
    /api/consumer/goals/{id}/preferences/ CRUD предпочтений (list/replace)
    """

    queryset = ConsumerGoal.objects.all().order_by("-id")
    serializer_class = ConsumerGoalSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        profile_id = self.request.query_params.get("profile")
        if profile_id:
            qs = qs.filter(profile_id=profile_id)
        return qs

    @action(detail=False, methods=["get"], url_path="active")
    def active(self, request):
        """
        GET /api/consumer/goals/active/?profile={profile_id}
        Возвращает активную цель для профиля.
        """
        profile_id = request.query_params.get("profile")
        if not profile_id:
            return Response(
                {"error": "profile query param is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        obj = (
            ConsumerGoal.objects.filter(profile_id=profile_id, is_active=True)
            .order_by("-id")
            .first()
        )
        if not obj:
            return Response(
                {"detail": "Active goal not set"},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=["post"], url_path="set-active")
    def set_active(self, request, pk=None):
        """
        POST /api/consumer/goals/{id}/set-active/
        Делает цель активной, снимая активность с остальных целей этого профиля.
        """
        goal = self.get_object()
        profile_id = goal.profile_id

        with transaction.atomic():
            ConsumerGoal.objects.filter(profile_id=profile_id, is_active=True).update(
                is_active=False
            )
            ConsumerGoal.objects.filter(pk=goal.pk).update(is_active=True)

        goal.refresh_from_db()
        return Response(self.get_serializer(goal).data)

    @action(detail=True, methods=["get", "put"], url_path="preferences")
    def preferences(self, request, pk=None):
        """
        GET  /api/consumer/goals/{id}/preferences/  - список предпочтений
        PUT  /api/consumer/goals/{id}/preferences/  - заменить список целиком
        Body для PUT: [{nutrient_code, direction, priority?}, ...]
        """
        goal = self.get_object()

        if request.method.lower() == "get":
            qs = GoalNutrientPreference.objects.filter(goal=goal).order_by("id")
            return Response(GoalNutrientPreferenceSerializer(qs, many=True).data)

        # PUT: replace
        if not isinstance(request.data, list):
            return Response(
                {"error": "Expected a list of preferences"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = GoalNutrientPreferenceSerializer(data=request.data, many=True)
        ser.is_valid(raise_exception=True)

        with transaction.atomic():
            GoalNutrientPreference.objects.filter(goal=goal).delete()
            rows = [
                GoalNutrientPreference(
                    goal=goal,
                    nutrient_code=item["nutrient_code"],
                    direction=item["direction"],
                    priority=item.get("priority") or 2,
                )
                for item in ser.validated_data
            ]
            if rows:
                GoalNutrientPreference.objects.bulk_create(rows)

        qs = GoalNutrientPreference.objects.filter(goal=goal).order_by("id")
        return Response(GoalNutrientPreferenceSerializer(qs, many=True).data)

class ProfileTargetsView(APIView):
    def get(self, request, profile_id):
        profile = get_object_or_404(ConsumerProfile, pk=profile_id)
        return Response(compute_targets_for_profile(profile))

class NutrientDictionaryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/nutrients-dictionary/
    GET /api/nutrients-dictionary/{code}/  (если захотите detail по code — см. примечание ниже)
    """
    serializer_class = NutrientDictionarySerializer
    queryset = NutrientDictionary.objects.filter(is_active=True).order_by(
        "source_group", "sort_order", "ru_name"
    )

    filter_backends = (DjangoFilterBackend, SearchFilter, OrderingFilter)
    filterset_fields = ("source_group", "unit", "is_active")
    search_fields = ("ru_name", "code")
    ordering_fields = ("source_group", "sort_order", "ru_name", "code")
    ordering = ("source_group", "sort_order", "ru_name")

class RecommendationsView(APIView):
    permission_classes = [AllowAny]  # раз вы запретили без авторизации

    def get(self, request):
        profile_id = request.query_params.get("profile")
        mode = (request.query_params.get("mode") or "catalog").strip()
        cart_id = request.query_params.get("cart")
        limit = int(request.query_params.get("limit") or 50)
        q = request.query_params.get("q")
        type_id = request.query_params.get("type_id")
        subtype_id = request.query_params.get("subtype_id")

        data = recommend(
            profile_id=int(profile_id),
            mode=mode,
            cart_id=int(cart_id) if cart_id else None,
            limit=limit,
            q=q or None,
            type_id=int(type_id) if type_id else None,
            subtype_id=int(subtype_id) if subtype_id else None,
        )
        return Response(data)
