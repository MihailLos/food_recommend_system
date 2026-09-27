from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0004_goal_nutrient_targets"),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                'ALTER TABLE "Consumer_Goals" '
                'ADD COLUMN IF NOT EXISTS "target_mode" text NOT NULL DEFAULT \'calculated\';'
            ),
            reverse_sql=(
                'ALTER TABLE "Consumer_Goals" '
                'DROP COLUMN IF EXISTS "target_mode";'
            ),
        ),
    ]
