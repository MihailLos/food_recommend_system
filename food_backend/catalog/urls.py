from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (FoodProductTypeViewSet, FoodProductViewSet,
                    MacronutrientsViewSet, MineralsViewSet,
                    VitaminsViewSet, OtherNutrientsViewSet, FatAcidsViewSet, AllergenListView, ProductAllergensView,
                    ConsumerProfileViewSet, WorkActivityGroupViewSet, ConsumerGoalViewSet, ProfileTargetsView,
                    NutrientDictionaryViewSet, RecommendationsView, FoodProductSubtypeViewSet,
                    CsrfCookieView, RegisterView, LoginView, LogoutView, CurrentUserView)
from .views import (
    AdminCatalogGroupViewSet,
    AdminCatalogProductViewSet,
    AdminCatalogSubtypeViewSet,
    FoodAdditiveGroupViewSet,
    FoodAdditiveViewSet,
    RetailFoodProductViewSet,
    RecommendationAvailableNutrientsView,
)

router = DefaultRouter()
router.register(r"types", FoodProductTypeViewSet)
router.register(r"subtypes", FoodProductSubtypeViewSet)
router.register(r"products", FoodProductViewSet)
router.register(r"macros", MacronutrientsViewSet)
router.register(r"minerals", MineralsViewSet)
router.register(r"vitamins", VitaminsViewSet)
router.register(r"other", OtherNutrientsViewSet)
router.register(r"fat-acids", FatAcidsViewSet)
router.register(r"consumer/profiles", ConsumerProfileViewSet, basename="consumer-profiles")
router.register(r"work-activity-groups", WorkActivityGroupViewSet, basename="work-activity-groups")
router.register(r"allergens", AllergenListView, basename="allergens")
router.register(r"consumer/goals", ConsumerGoalViewSet, basename="consumer-goals")
router.register(r"nutrients-dictionary", NutrientDictionaryViewSet, basename="nutrients-dictionary")
router.register(r"food-additive-groups", FoodAdditiveGroupViewSet, basename="food-additive-groups")
router.register(r"food-additives", FoodAdditiveViewSet, basename="food-additives")
router.register(r"retail-products", RetailFoodProductViewSet, basename="retail-products")
router.register(r"admin-catalog/groups", AdminCatalogGroupViewSet, basename="admin-catalog-groups")
router.register(r"admin-catalog/subgroups", AdminCatalogSubtypeViewSet, basename="admin-catalog-subgroups")
router.register(r"admin-catalog/products", AdminCatalogProductViewSet, basename="admin-catalog-products")

urlpatterns = [
    path("", include(router.urls)),
    path("auth/csrf/", CsrfCookieView.as_view(), name="auth-csrf"),
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", CurrentUserView.as_view(), name="auth-me"),
    path("consumer/profiles/<int:profile_id>/targets/", ProfileTargetsView.as_view(), name="profile-targets"),
    path("consumer/recommendations/available-nutrients/", RecommendationAvailableNutrientsView.as_view(), name="recommendation-available-nutrients"),
    path("consumer/recommendations/", RecommendationsView.as_view()),
]
