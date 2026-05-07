from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                (
                    "UPDATE \"Nutrient_Dictionary\" "
                    "SET source_group = 'fat_acids' "
                    "WHERE source_group = 'fatacids'"
                ),
                (
                    "UPDATE \"Nutrient_Dictionary\" "
                    "SET source_group = 'other_nutrients' "
                    "WHERE source_group = 'other'"
                ),
            ],
            reverse_sql=[
                (
                    "UPDATE \"Nutrient_Dictionary\" "
                    "SET source_group = 'fatacids' "
                    "WHERE source_group = 'fat_acids'"
                ),
                (
                    "UPDATE \"Nutrient_Dictionary\" "
                    "SET source_group = 'other' "
                    "WHERE source_group = 'other_nutrients'"
                ),
            ],
        ),
    ]
