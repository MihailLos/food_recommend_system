from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0002_fix_nutrient_dictionary_source_groups"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                (
                    "ALTER TABLE \"Consumer_Goals\" "
                    "ADD COLUMN IF NOT EXISTS \"preferences_replace_base\" boolean NOT NULL DEFAULT FALSE"
                ),
                (
                    "UPDATE \"Nutrient_Stats\" "
                    "SET unit = 'mg' "
                    "WHERE nutrient_code = 'cholesterol_g'"
                ),
                (
                    "UPDATE \"Nutrient_Dictionary\" "
                    "SET unit = 'mg' "
                    "WHERE code = 'cholesterol_g'"
                ),
            ],
            reverse_sql=[
                (
                    "ALTER TABLE \"Consumer_Goals\" "
                    "DROP COLUMN IF EXISTS \"preferences_replace_base\""
                ),
                (
                    "UPDATE \"Nutrient_Stats\" "
                    "SET unit = 'g' "
                    "WHERE nutrient_code = 'cholesterol_g'"
                ),
                (
                    "UPDATE \"Nutrient_Dictionary\" "
                    "SET unit = 'g' "
                    "WHERE code = 'cholesterol_g'"
                ),
            ],
        ),
    ]
