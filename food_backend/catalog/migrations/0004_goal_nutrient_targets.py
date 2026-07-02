from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0003_goal_preferences_mode_and_cholesterol_unit"),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                (
                    "CREATE TABLE IF NOT EXISTS \"Goal_Nutrient_Targets\" ("
                    "\"id\" serial PRIMARY KEY, "
                    "\"goal_id\" integer NOT NULL REFERENCES \"Consumer_Goals\"(\"id\") ON DELETE CASCADE, "
                    "\"nutrient_code\" text NOT NULL REFERENCES \"Nutrient_Dictionary\"(\"code\") ON DELETE CASCADE, "
                    "\"target_value\" double precision NOT NULL, "
                    "CONSTRAINT \"uq_goal_nutrient_target\" UNIQUE (\"goal_id\", \"nutrient_code\")"
                    ")"
                ),
            ],
            reverse_sql=[
                'DROP TABLE IF EXISTS "Goal_Nutrient_Targets"',
            ],
        ),
    ]
