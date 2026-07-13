from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.permissions import BasePermission, IsAuthenticated, AllowAny
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth import get_user_model
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils import timezone

from .models import (FoodProductTypes, FoodProducts, Macronutrients, Minerals,
                     Vitamins, OtherNutrients, FatAcids, CulinaryProcessingType, Allergen, AllergenProduct, NotChildProduct,
                     ConsumerProfile, WorkActivityGroup, ProfileAllergen, ConsumerGoal, GoalNutrientPreference, GoalNutrientTarget,
                     NutrientDictionary, FoodProductSubtypes, FoodAdditiveGroup, FoodAdditive,
                     RetailFoodProduct)
from .serializers import (FoodProductTypeSerializer, FoodProductSerializer,
                          MacronutrientsSerializer, MineralsSerializer,
                          VitaminsSerializer, OtherNutrientsSerializer,
                          FatAcidsSerializer, AllergenSerializer, 
                          ConsumerProfileSerializer, WorkActivityGroupSerializer,
                          ConsumerGoalSerializer, GoalNutrientPreferenceSerializer, GoalNutrientTargetSerializer, NutrientDictionarySerializer,
                          RegisterSerializer, LoginSerializer, CurrentUserSerializer,
                          FoodProductSubtypeSerializer, FoodAdditiveGroupSerializer, FoodAdditiveSerializer,
                          AdminFoodProductCreateSerializer, AdminFoodProductUpdateSerializer, AdminFoodProductSerializer,
                          RetailFoodProductSerializer, RetailFoodProductWriteSerializer,
                          RetailNameMatchRequestSerializer, RetailCompositionMatchRequestSerializer,
                          RetailNutritionFillPreviewSerializer)
from .services.processing_calc import compute_processed_nutrients
from .services.processing_calc import pick_processing_rule
from catalog.utils.energy_calc import calculate_bmi, calculate_tdee_for_profile
from catalog.utils.targets import compute_targets_for_profile, ensure_active_goal

import hashlib, json

from rest_framework import status
from rest_framework import generics
from rest_framework.exceptions import PermissionDenied

from rest_framework.views import APIView
from django.db import transaction
from django.shortcuts import get_object_or_404

from catalog.utils.allergens import get_allergens_for_product
from catalog.services.recommendations import recommend, get_goal_nutrient_profiles_payload
from catalog.services.retail_matching import match_retail_name, match_retail_composition
from catalog.services.retail_nutrition import (
    RETAIL_NUTRIENT_FIELDS,
    apply_fill_missing_retail_nutrients,
    build_reference_product_payload,
    build_retail_product_payload,
    get_available_nutrient_codes_for_retail_products,
    preview_fill_missing_retail_nutrients,
)
from catalog.services.retail_rules import apply_retail_product_readiness
from catalog.services.admin_catalog import get_product_delete_blockers

User = get_user_model()


class IsSuperUser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


def _compute_catalog_export_meta():
    """
    Сигнатура серверного каталога для фоновой проверки на фронте.
    Должна меняться не только при добавлении строк, но и при правке названий,
    пищевых веществ, аллергенов и правил детского питания.
    """
    snapshot = {
        "products": list(FoodProducts.objects.order_by("id").values_list("id", "name", "subtype_id", "is_complex")),
        "types": list(FoodProductTypes.objects.order_by("id").values_list("id", "name")),
        "subtypes": list(FoodProductSubtypes.objects.order_by("id").values_list("id", "name", "product_type_id")),
        "macros": list(Macronutrients.objects.order_by("food_product_id").values_list()),
        "minerals": list(Minerals.objects.order_by("food_product_id").values_list()),
        "vitamins": list(Vitamins.objects.order_by("food_product_id").values_list()),
        "other_nutrients": list(OtherNutrients.objects.order_by("food_product_id").values_list()),
        "fat_acids": list(FatAcids.objects.order_by("food_product_id").values_list()),
        "allergen_rules": list(AllergenProduct.objects.order_by("id").values_list("id", "scope", "product_type_id", "product_subtype_id", "product_id", "allergen_id")),
        "not_child_rules": list(NotChildProduct.objects.order_by("id").values_list("id", "scope", "product_type_id", "product_subtype_id", "product_id")),
    }
    version_seed = json.dumps(snapshot, sort_keys=True, ensure_ascii=False, default=str)
    version = hashlib.sha256(version_seed.encode("utf-8")).hexdigest()[:12]
    return {
        "version": version,
        "items_count": len(snapshot["products"]),
    }

class FoodProductTypeViewSet(viewsets.ModelViewSet):
    queryset = FoodProductTypes.objects.all().order_by("id")
    serializer_class = FoodProductTypeSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["id", "name"]
    pagination_class = None

class FoodProductSubtypeViewSet(viewsets.ModelViewSet):
    queryset = FoodProductSubtypes.objects.all().order_by("id")
    serializer_class = FoodProductSubtypeSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["id", "name"]
    pagination_class = None

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
        # В справочнике типов обработки около 180 записей, их можно спокойно перебрать.
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
        Полный экспорт каталога: продукт + пищевые вещества одним JSON массивом.
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
        version = _compute_catalog_export_meta()["version"]

        # Можно положить версию в заголовок и в тело.
        resp = Response({"version": version, "items": data})
        resp["X-Catalog-Version"] = version
        return resp

    @action(detail=False, methods=["get"], url_path="export-meta", pagination_class=None)
    def export_meta(self, request):
        meta = _compute_catalog_export_meta()
        resp = Response(meta)
        resp["X-Catalog-Version"] = meta["version"]
        return resp


class AdminCatalogGroupViewSet(viewsets.ModelViewSet):
    queryset = FoodProductTypes.objects.all().order_by("id")
    serializer_class = FoodProductTypeSerializer
    permission_classes = [IsSuperUser]
    pagination_class = None


class AdminCatalogSubtypeViewSet(viewsets.ModelViewSet):
    queryset = FoodProductSubtypes.objects.select_related("product_type").all().order_by("id")
    serializer_class = FoodProductSubtypeSerializer
    permission_classes = [IsSuperUser]
    pagination_class = None


class AdminCatalogProductViewSet(viewsets.ModelViewSet):
    queryset = FoodProducts.objects.select_related(
        "subtype",
        "subtype__product_type",
    ).prefetch_related(
        "macros",
        "minerals",
        "vitamins",
        "other_nutrients",
        "fat_acids",
    ).order_by("id")
    permission_classes = [IsSuperUser]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = {
        "subtype": ["exact"],
        "subtype__product_type": ["exact"],
        "is_complex": ["exact"],
    }
    search_fields = ["name"]
    ordering_fields = ["id", "name"]

    def get_serializer_class(self):
        if self.action == "create":
            return AdminFoodProductCreateSerializer
        if self.action in ("update", "partial_update"):
            return AdminFoodProductUpdateSerializer
        return AdminFoodProductSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(AdminFoodProductSerializer(product).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        product = self.get_object()
        serializer = self.get_serializer(product, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        product = serializer.save()
        return Response(AdminFoodProductSerializer(product).data)

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        blockers = get_product_delete_blockers(product)
        if blockers:
            return Response(
                {
                    "detail": "Продукт нельзя удалить, потому что он связан с магазинными продуктами.",
                    "blockers": blockers,
                },
                status=status.HTTP_409_CONFLICT,
            )
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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


class FoodAdditiveGroupViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FoodAdditiveGroup.objects.all().order_by("name", "id")
    serializer_class = FoodAdditiveGroupSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name"]
    ordering_fields = ["id", "name"]
    pagination_class = None


class FoodAdditiveViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FoodAdditive.objects.select_related("group").all().order_by("name", "id")
    serializer_class = FoodAdditiveSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["group", "for_children", "provoke_allergy"]
    search_fields = ["code", "name"]
    ordering_fields = ["id", "code", "name"]
    pagination_class = None


class RetailFoodProductViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["status", "visibility", "related_food_group", "related_food_subgroup", "related_food_product"]
    search_fields = ["name", "composition_text"]
    ordering_fields = ["id", "name", "created_at", "updated_at"]

    def get_queryset(self):
        return (
            RetailFoodProduct.objects.filter(created_by_user=self.request.user)
            .select_related("related_food_group", "related_food_subgroup", "related_food_product")
            .prefetch_related(
                "retail_components",
                "retail_components__food_component",
                "retail_additives",
                "retail_additives__food_additive",
            )
            .order_by("-updated_at", "-id")
        )

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return RetailFoodProductWriteSerializer
        return RetailFoodProductSerializer

    def perform_create(self, serializer):
        now = timezone.now()
        retail_product = serializer.save(
            created_by_user=self.request.user,
            created_at=now,
            updated_at=now,
            status=RetailFoodProduct.Status.DRAFT,
            is_ready_for_recommendation=False,
        )
        if retail_product.nutrition_fill_mode:
            apply_fill_missing_retail_nutrients(retail_product)
            apply_retail_product_readiness(retail_product)
            retail_product.updated_at = timezone.now()
            retail_product.save()

    def perform_update(self, serializer):
        retail_product = serializer.save(updated_at=timezone.now())
        if retail_product.nutrition_fill_mode:
            apply_fill_missing_retail_nutrients(retail_product)
            apply_retail_product_readiness(retail_product)
            retail_product.updated_at = timezone.now()
            retail_product.save()

    @action(detail=False, methods=["post"], url_path="match-name")
    def match_name(self, request):
        serializer = RetailNameMatchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(match_retail_name(serializer.validated_data["name"]))

    @action(detail=False, methods=["post"], url_path="match-composition")
    def match_composition(self, request):
        serializer = RetailCompositionMatchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(match_retail_composition(serializer.validated_data["composition_text"]))

    @action(detail=False, methods=["post"], url_path="fill-nutrients-preview")
    def fill_nutrients_preview(self, request):
        serializer = RetailNutritionFillPreviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reference_product = None
        reference_product_id = serializer.validated_data.get("related_food_product_id")
        if reference_product_id:
            reference_product = get_object_or_404(
                FoodProducts.objects.select_related("subtype", "subtype__product_type")
                .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids"),
                pk=reference_product_id,
            )
        current_values = {
            field_name: serializer.validated_data.get(field_name)
            for field_name in RETAIL_NUTRIENT_FIELDS
        }
        return Response(
            preview_fill_missing_retail_nutrients(
                reference_product=reference_product,
                current_values=current_values,
                fill_mode=serializer.validated_data.get("nutrition_fill_mode"),
            )
        )


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfCookieView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"detail": "CSRF cookie set"})


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if getattr(serializer, "profile_created", False):
            detail = "Регистрация выполнена. Профиль создан. Теперь войдите в систему."
        elif getattr(serializer, "profile_skipped_incomplete", False):
            detail = (
                "Регистрация выполнена. Профиль пока не создан: для него нужны пол, возраст, рост, вес "
                "и группа труда. Войдите в систему и заполните профиль во вкладке модуля потребителя."
            )
        else:
            detail = "Регистрация выполнена. Теперь войдите в систему."
        return Response(
            {"detail": detail},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            request,
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            return Response(
                {"detail": "Неверный логин или пароль."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        login(request, user)
        if serializer.validated_data.get("remember_me"):
            request.session.set_expiry(60 * 60 * 24 * 30)
        else:
            request.session.set_expiry(0)

        return Response(CurrentUserSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"detail": "Вы вышли из системы."})


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(CurrentUserSerializer(request.user).data)

class ConsumerProfileViewSet(viewsets.ModelViewSet):
    """
    CRUD для профилей текущего пользователя.
    """
    serializer_class = ConsumerProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ConsumerProfile.objects.filter(user=self.request.user).order_by("-id")

    def perform_create(self, serializer):
        is_first_profile = not ConsumerProfile.objects.filter(user=self.request.user).exists()
        serializer.save(user=self.request.user, is_active=is_first_profile)

    @action(detail=False, methods=["get"], url_path="active")
    def active(self, request):
        qs = self.get_queryset().filter(is_active=True)
        obj = qs.first()
        if not obj:
            return Response({"detail": "Active profile not set"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=["post"], url_path="set-active")
    def set_active(self, request, pk=None):
        """
        POST /api/consumer/profiles/<id>/set-active/
        Делает профиль активным внутри области текущего пользователя.
        """
        profile = self.get_object()
        scope = self.get_queryset()

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
    serializer_class = ConsumerGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ConsumerGoal.objects.filter(profile__user=self.request.user).order_by("-id")
        profile_id = self.request.query_params.get("profile")
        if profile_id:
            qs = qs.filter(profile_id=profile_id, profile__user=self.request.user)
        return qs

    def perform_create(self, serializer):
        profile = serializer.validated_data["profile"]
        if profile.user_id != self.request.user.id:
            raise PermissionDenied("Нельзя создавать цели для чужого профиля.")
        is_first_goal = not ConsumerGoal.objects.filter(profile_id=profile.id).exists()
        serializer.save(is_active=is_first_goal)

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
            ConsumerGoal.objects.filter(profile_id=profile_id, profile__user=request.user, is_active=True)
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

    @action(detail=False, methods=["get"], url_path="base-profiles")
    def base_profiles(self, request):
        return Response(get_goal_nutrient_profiles_payload())

class ProfileTargetsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, profile_id):
        profile = get_object_or_404(ConsumerProfile, pk=profile_id, user=request.user)
        return Response(compute_targets_for_profile(profile))

    def put(self, request, profile_id):
        profile = get_object_or_404(ConsumerProfile, pk=profile_id, user=request.user)
        goal = ensure_active_goal(profile)

        energy_delta_kcal = request.data.get("energy_delta_kcal", 0)
        macros = request.data.get("macros_pct") or {}
        guidance_lists = request.data.get("guidance_lists") or {}
        nutrient_targets = request.data.get("nutrient_targets") or []

        coverage_codes = guidance_lists.get("coverage_codes") or []
        limit_codes = guidance_lists.get("limit_codes") or []

        pref_payload = (
            [{"nutrient_code": code, "direction": "more"} for code in coverage_codes]
            + [{"nutrient_code": code, "direction": "less"} for code in limit_codes]
        )
        pref_serializer = GoalNutrientPreferenceSerializer(data=pref_payload, many=True)
        pref_serializer.is_valid(raise_exception=True)

        target_serializer = GoalNutrientTargetSerializer(data=nutrient_targets, many=True)
        target_serializer.is_valid(raise_exception=True)

        macro_fields = {
            "protein_pct": macros.get("protein_pct"),
            "fat_pct": macros.get("fat_pct"),
            "carb_pct": macros.get("carb_pct"),
        }
        has_manual_macros = any(value not in (None, "") for value in macro_fields.values())
        if not has_manual_macros:
            macro_fields = {
                "protein_pct": None,
                "fat_pct": None,
                "carb_pct": None,
            }

        goal_payload = {
            "title": request.data.get("title") or goal.title or "Пищевые ориентиры",
            "goal_type": ConsumerGoal.GOAL_MAINTAIN,
            "energy_delta_kcal": energy_delta_kcal if energy_delta_kcal not in ("", None) else 0,
            "preferences_replace_base": True,
            "is_active": True,
            **macro_fields,
        }
        goal_serializer = ConsumerGoalSerializer(goal, data=goal_payload, partial=True)
        goal_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            goal = goal_serializer.save()

            GoalNutrientPreference.objects.filter(goal_id=goal.id).delete()
            pref_rows = [
                GoalNutrientPreference(
                    goal=goal,
                    nutrient_code=item["nutrient_code"],
                    direction=item["direction"],
                    priority=item.get("priority") or 2,
                )
                for item in pref_serializer.validated_data
            ]
            if pref_rows:
                GoalNutrientPreference.objects.bulk_create(pref_rows)

            GoalNutrientTarget.objects.filter(goal_id=goal.id).delete()
            target_rows = [
                GoalNutrientTarget(
                    goal=goal,
                    nutrient_code=item["nutrient_code"],
                    target_value=item["target_value"],
                )
                for item in target_serializer.validated_data
            ]
            if target_rows:
                GoalNutrientTarget.objects.bulk_create(target_rows)

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


class RecommendationAvailableNutrientsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile_id = request.query_params.get("profile")
        if not profile_id:
            return Response({"detail": "profile is required"}, status=status.HTTP_400_BAD_REQUEST)

        profile = get_object_or_404(ConsumerProfile, pk=int(profile_id), user=request.user)
        ensure_active_goal(profile)

        source_mode = str(request.query_params.get("source_mode") or "reference_only").strip()
        active_codes = set(
            NutrientDictionary.objects.filter(is_active=True).values_list("code", flat=True)
        )

        if source_mode == "retail_only":
            retail_products = list(
                RetailFoodProduct.objects.filter(
                    created_by_user=request.user,
                    is_ready_for_recommendation=True,
                ).order_by("id")
            )
            available_codes = set(get_available_nutrient_codes_for_retail_products(retail_products))
        elif source_mode == "reference_plus_retail":
            retail_products = list(
                RetailFoodProduct.objects.filter(
                    created_by_user=request.user,
                    is_ready_for_recommendation=True,
                ).order_by("id")
            )
            available_codes = active_codes & set(get_available_nutrient_codes_for_retail_products(retail_products))
        else:
            available_codes = active_codes

        rows = NutrientDictionary.objects.filter(
            is_active=True,
            code__in=sorted(available_codes),
        ).order_by("source_group", "sort_order", "ru_name")
        return Response(NutrientDictionarySerializer(rows, many=True).data)


class RecommendationsView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_ready_retail_products(self, user):
        return list(
            RetailFoodProduct.objects.filter(
                created_by_user=user,
                is_ready_for_recommendation=True,
            )
            .select_related("related_food_group", "related_food_subgroup", "related_food_product")
            .prefetch_related(
                "retail_components",
                "retail_components__food_component",
                "retail_additives",
                "retail_additives__food_additive",
                "related_food_product__subtype",
                "related_food_product__subtype__product_type",
                "related_food_product__macros",
                "related_food_product__minerals",
                "related_food_product__vitamins",
                "related_food_product__other_nutrients",
                "related_food_product__fat_acids",
            )
            .order_by("id")
        )

    def _get_reference_products_for_local_mode(self, q=None, type_id=None, subtype_id=None):
        qs = (
            FoodProducts.objects.all()
            .select_related("subtype", "subtype__product_type")
            .prefetch_related("macros", "minerals", "vitamins", "other_nutrients", "fat_acids")
        )
        if q:
            qs = qs.filter(name__icontains=q.strip())
        if subtype_id:
            qs = qs.filter(subtype_id=subtype_id)
        elif type_id:
            qs = qs.filter(subtype__product_type_id=type_id)
        return list(qs[:2000])

    def _build_local_products_payload(
        self,
        request,
        source_mode,
        q=None,
        type_id=None,
        subtype_id=None,
    ):
        if source_mode == "retail_only":
            return [build_retail_product_payload(item) for item in self._get_ready_retail_products(request.user)]

        if source_mode == "reference_plus_retail":
            reference_payloads = [
                build_reference_product_payload(item)
                for item in self._get_reference_products_for_local_mode(q=q, type_id=type_id, subtype_id=subtype_id)
            ]
            retail_payloads = [build_retail_product_payload(item) for item in self._get_ready_retail_products(request.user)]
            return reference_payloads + retail_payloads

        return None

    def _build_response(self, request, payload):
        profile_id = payload.get("profile")
        mode = str(payload.get("mode") or "catalog").strip()
        cart_id = payload.get("cart")
        limit = int(payload.get("limit") or 50)
        q = payload.get("q")
        type_id = payload.get("type_id")
        subtype_id = payload.get("subtype_id")
        comparison_mode = str(payload.get("comparison_mode") or "subgroup").strip()
        local_products = payload.get("local_products") or None
        selected_product_ids = payload.get("selected_product_ids") or None
        source_mode = str(payload.get("source_mode") or "reference_only").strip()

        profile = get_object_or_404(ConsumerProfile, pk=int(profile_id), user=request.user)
        active_goal_exists = ConsumerGoal.objects.filter(
            profile_id=profile.id,
            profile__user=request.user,
            is_active=True,
        ).exists()
        if not active_goal_exists:
            return Response(
                {"detail": "Для выбранного профиля не задана активная цель питания."},
                status=status.HTTP_409_CONFLICT,
            )

        if local_products is None:
            local_products = self._build_local_products_payload(
                request=request,
                source_mode=source_mode,
                q=q,
                type_id=int(type_id) if type_id else None,
                subtype_id=int(subtype_id) if subtype_id else None,
            )

        if source_mode == "retail_only" and selected_product_ids:
            selected_product_ids = [
                -abs(int(product_id))
                for product_id in selected_product_ids
                if product_id not in (None, "")
            ]

        data = recommend(
            profile_id=int(profile_id),
            mode=mode,
            cart_id=int(cart_id) if cart_id else None,
            limit=limit,
            q=q or None,
            type_id=int(type_id) if type_id else None,
            subtype_id=int(subtype_id) if subtype_id else None,
            comparison_mode=comparison_mode,
            local_products=local_products,
            selected_product_ids=selected_product_ids,
        )
        return Response(data)

    def get(self, request):
        return self._build_response(request, request.query_params)

    def post(self, request):
        return self._build_response(request, request.data)
