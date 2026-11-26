from django.db import connection

from .models import ProcessedProductData


def dry_matter_retention(processed_product_id, *, before_experiment_id=None, after_experiment_id=None):
    """Calculate retention from analyses linked to the applicable portion stage.

    A missing or ambiguous analysis leaves retention unavailable. An explicit
    selection must still match the batch and stage before heating, or the
    exact processed portion after heating.
    """
    product = ProcessedProductData.objects.select_related(
        "unprocessed_product", "preprocessed_product__unprocessed_product",
    ).get(pk=processed_product_id)
    if product.preprocessed_product_id is not None:
        before = product.preprocessed_product
        batch_id = before.unprocessed_product.analyzed_product_id
        before_condition = """
            preprocessed_product_id IN (
                SELECT p.id FROM "Preprocessed_Products_Data" p
                JOIN "Unprocessed_Products_Data" u ON u.id = p.unprocessed_product_id
                WHERE u.analyzed_product_id = %s
            )
        """
    else:
        before = product.unprocessed_product
        batch_id = before.analyzed_product_id
        before_condition = """
            unprocessed_product_id IN (
                SELECT id FROM "Unprocessed_Products_Data" WHERE analyzed_product_id = %s
            )
        """
    if product.uses_oil:
        # A sample percentage without oil does not give the oil-free weight of the full product.
        return None

    with connection.cursor() as cursor:
        def analyze(condition, portion_id, experiment_id):
            cursor.execute(
                f"""
                SELECT final_dry_matter_pct FROM "Average_Experiment_Data"
                WHERE {condition} AND final_dry_matter_pct IS NOT NULL
                  AND (%s::integer IS NULL OR experiment_id = %s)
                LIMIT 2
                """,
                [portion_id, experiment_id, experiment_id],
            )
            rows = cursor.fetchall()
            return rows[0][0] if len(rows) == 1 else None

        before_pct = analyze(before_condition, batch_id, before_experiment_id)
        after_pct = analyze("processed_product_id = %s", product.pk, after_experiment_id)

    if not before_pct or after_pct is None:
        return None
    return 100 * product.weight_g * after_pct / (before.weight_g * before_pct)
