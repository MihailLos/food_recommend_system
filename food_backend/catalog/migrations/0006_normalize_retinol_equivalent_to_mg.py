from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0005_consumer_goal_target_mode"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                # Торговые продукты меняем только если РЭ был скопирован из
                # связанного справочного продукта. Ручные значения не затрагиваем.
                '''
                UPDATE "retail_food_products" AS retail
                SET "retinol_index" = retail."retinol_index" / 1000.0
                FROM "Vitamins" AS vitamins
                WHERE retail."related_food_product_id" = vitamins."Food_Product_ID"
                  AND retail."nutrition_fill_mode" IN ('reference_only', 'label_plus_reference')
                  AND retail."retinol_index" = vitamins."Retinol_Index"
                ''',
                # В старых таблицах РЭ был сохранён в мкг, в то время как
                # ориентиры и интерфейс используют мг.
                '''
                UPDATE "Vitamins"
                SET "Retinol_Index" = "Retinol_Index" / 1000.0
                WHERE "Retinol_Index" IS NOT NULL
                ''',
                '''
                UPDATE "Nutrient_Stats"
                SET
                    "unit" = 'mg',
                    "min_value" = "min_value" / 1000.0,
                    "max_value" = "max_value" / 1000.0,
                    "p05" = "p05" / 1000.0,
                    "p50" = "p50" / 1000.0,
                    "p95" = "p95" / 1000.0
                WHERE "nutrient_code" = 'retinol_index'
                ''',
                '''
                UPDATE "Nutrient_Dictionary"
                SET "unit" = 'mg'
                WHERE "code" = 'retinol_index'
                ''',
            ],
            # Автоматический откат мог бы умножить значения, добавленные уже
            # после миграции. Поэтому преобразование намеренно одностороннее.
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
