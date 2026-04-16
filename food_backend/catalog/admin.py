from django.contrib import admin
from . import models

# Register your models here.

@admin.register(models.FoodProductTypes)
class FoodProductTypeAdmin(admin.ModelAdmin):
    search_fields = ["name"]

@admin.register(models.FoodProductSubtypes)
class FoodProductSubtypeAdmin(admin.ModelAdmin):
    search_fields = ["name"]

@admin.register(models.FoodProducts)
class FoodProductAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "subtype", "get_type", "is_complex")
    list_filter = ("subtype__product_type", "subtype", "is_complex")
    search_fields = ("name", "subtype__name", "subtype__product_type__name")

    def get_type(self, obj):
        return obj.subtype.product_type if obj.subtype else None

    get_type.short_description = "Тип продукции"
    get_type.admin_order_field = "subtype__product_type"


admin.site.register(models.Macronutrients)
admin.site.register(models.Minerals)
admin.site.register(models.Vitamins)
admin.site.register(models.OtherNutrients)
admin.site.register(models.FatAcids)
admin.site.register(models.ConsumerGoal)
admin.site.register(models.GoalNutrientPreference)