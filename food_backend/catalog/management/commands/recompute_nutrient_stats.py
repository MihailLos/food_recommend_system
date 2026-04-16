import numpy as np
from django.core.management.base import BaseCommand
from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist, MultipleObjectsReturned

from catalog.models import FoodProducts, NutrientDictionary, NutrientStats

GROUP_TO_RELATED = {
    "macros": "macros",
    "minerals": "minerals",
    "vitamins": "vitamins",
    "other": "other_nutrients",
    "fatacids": "fat_acids",
}

class Command(BaseCommand):
    help = "Recompute Nutrient_Stats (p05/p50/p95/min/max/n) for active NutrientDictionary entries."

    def add_arguments(self, parser):
        parser.add_argument("--only-code", type=str, default=None)

    def handle(self, *args, **opts):
        only_code = (opts.get("only_code") or "").strip() or None
        qs = NutrientDictionary.objects.filter(is_active=True).order_by("code")
        if only_code:
            qs = qs.filter(code=only_code)

        updated = 0
        with transaction.atomic():
            for nd in qs:
                related = GROUP_TO_RELATED.get(nd.source_group)
                if not related:
                    continue

                values = []
                # ВАЖНО: у вас модели managed=False, но related_name для O2O задан (macros/minerals/...)
                for p in FoodProducts.objects.all().only("id"):
                    try:
                        rel = getattr(p, related)   # vitamins/macros/minerals/...
                    except ObjectDoesNotExist:
                        rel = None
                    except MultipleObjectsReturned:
                        # есть дубли — пропускаем продукт для этого sourcegroup
                        rel = None
                    if not rel:
                        continue
                    v = getattr(rel, nd.source_field, None)
                    if v is None:
                        continue
                    try:
                        fv = float(v)
                    except Exception:
                        continue
                    values.append(fv)

                if not values:
                    NutrientStats.objects.update_or_create(
                        nutrient_code=nd.code,
                        defaults={
                            "unit": nd.unit,
                            "min_value": None, "max_value": None,
                            "p05": None, "p50": None, "p95": None,
                            "n": 0,
                            "method": "p05_p95",
                        }
                    )
                    continue

                arr = np.array(values, dtype=float)
                row = {
                    "unit": nd.unit,
                    "min_value": float(np.min(arr)),
                    "max_value": float(np.max(arr)),
                    "p05": float(np.percentile(arr, 5)),
                    "p50": float(np.percentile(arr, 50)),
                    "p95": float(np.percentile(arr, 95)),
                    "n": int(arr.size),
                    "method": "p05_p95",
                }

                NutrientStats.objects.update_or_create(
                    nutrient_code=nd.code,
                    defaults=row
                )
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Updated stats rows: {updated}"))
