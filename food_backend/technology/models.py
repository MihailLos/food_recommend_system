from django.db import models
from django.db.models import F, Q


class ProcessingType(models.Model):
    """The processing dictionary is owned by the catalog."""

    id = models.IntegerField(primary_key=True, db_column="ID")
    name = models.TextField(db_column="Name")

    class Meta:
        managed = False
        db_table = "Culinary_Processing_Types"


class AnalyzedProduct(models.Model):
    product_name = models.TextField()
    sort_name = models.TextField(null=True, blank=True)
    source_place = models.TextField(null=True, blank=True)
    acquisition_date = models.DateField(null=True, blank=True)
    manual = models.ForeignKey("catalog.FoodProducts", on_delete=models.PROTECT, null=True, blank=True)

    class Meta:
        db_table = "Analyzed_Products"


class UnprocessedProductData(models.Model):
    analyzed_product = models.ForeignKey(AnalyzedProduct, on_delete=models.PROTECT)
    weight_g = models.DecimalField(max_digits=14, decimal_places=6)

    class Meta:
        db_table = "Unprocessed_Products_Data"
        constraints = [models.CheckConstraint(condition=Q(weight_g__gt=0), name="tech_raw_mass_positive")]


class PreprocessedProductData(models.Model):
    unprocessed_product = models.ForeignKey(UnprocessedProductData, on_delete=models.PROTECT)
    cpt = models.ForeignKey(ProcessingType, on_delete=models.PROTECT)
    is_cut = models.BooleanField()
    weight_g = models.DecimalField(max_digits=14, decimal_places=6)

    @property
    def preprocessing_loss_g(self):
        return self.unprocessed_product.weight_g - self.weight_g

    @property
    def preprocessing_loss_pct(self):
        return self.preprocessing_loss_g * 100 / self.unprocessed_product.weight_g

    class Meta:
        db_table = "Preprocessed_Products_Data"
        constraints = [models.CheckConstraint(condition=Q(weight_g__gt=0), name="tech_preprocessed_mass_positive")]


class ProcessedProductData(models.Model):
    unprocessed_product = models.ForeignKey(UnprocessedProductData, on_delete=models.PROTECT, null=True, blank=True)
    preprocessed_product = models.ForeignKey(PreprocessedProductData, on_delete=models.PROTECT, null=True, blank=True)
    cpt = models.ForeignKey(ProcessingType, on_delete=models.PROTECT)
    weight_g = models.DecimalField(max_digits=14, decimal_places=6)
    processing_temperature_celsius = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True,
        help_text="Температура среды при закладке продукта, °C.",
    )
    added_water_g = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    added_oil_g = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "Processed_Product_Data"
        constraints = [
            models.CheckConstraint(
                condition=Q(unprocessed_product__isnull=False, preprocessed_product__isnull=True)
                | Q(unprocessed_product__isnull=True, preprocessed_product__isnull=False),
                name="tech_processed_one_input",
            ),
            models.CheckConstraint(condition=Q(weight_g__gte=0), name="tech_processed_mass_nonnegative"),
            models.CheckConstraint(condition=Q(added_water_g__gte=0), name="tech_water_nonnegative"),
            models.CheckConstraint(condition=Q(added_oil_g__gte=0), name="tech_oil_nonnegative"),
        ]


class ExperimentData(models.Model):
    class ResultMode(models.TextChoices):
        WEIGHINGS = "weighings", "Рассчитать по взвешиваниям"
        REPORTED = "reported", "Внести готовый процент"

    unprocessed_product = models.ForeignKey(UnprocessedProductData, on_delete=models.PROTECT, null=True, blank=True)
    preprocessed_product = models.ForeignKey(PreprocessedProductData, on_delete=models.PROTECT, null=True, blank=True)
    processed_product = models.ForeignKey(ProcessedProductData, on_delete=models.PROTECT, null=True, blank=True)
    result_mode = models.CharField(max_length=10, choices=ResultMode.choices)
    reported_dry_matter_pct = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = "Experiment_Data"
        constraints = [
            models.CheckConstraint(
                condition=Q(unprocessed_product__isnull=False, preprocessed_product__isnull=True, processed_product__isnull=True)
                | Q(unprocessed_product__isnull=True, preprocessed_product__isnull=False, processed_product__isnull=True)
                | Q(unprocessed_product__isnull=True, preprocessed_product__isnull=True, processed_product__isnull=False),
                name="tech_analysis_one_stage",
            ),
            models.CheckConstraint(
                condition=Q(result_mode="weighings", reported_dry_matter_pct__isnull=True)
                | Q(result_mode="reported", reported_dry_matter_pct__isnull=False, reported_dry_matter_pct__range=(0, 100)),
                name="tech_analysis_result_mode",
            ),
        ]


class ExperimentParallel(models.Model):
    experiment = models.ForeignKey(ExperimentData, on_delete=models.CASCADE, related_name="parallels")
    # PostgreSQL assigns the number before checking constraints on insertion.
    parallel_number = models.PositiveIntegerField(db_default=0, editable=False)
    m0_g = models.DecimalField(max_digits=14, decimal_places=6)
    m1_g = models.DecimalField(max_digits=14, decimal_places=6)
    m2_g = models.DecimalField(max_digits=14, decimal_places=6)
    dry_residue_g = models.GeneratedField(
        expression=F("m2_g") - F("m0_g"),
        output_field=models.DecimalField(max_digits=14, decimal_places=6),
        db_persist=True,
    )
    dry_matter_pct = models.GeneratedField(
        expression=(F("m2_g") - F("m0_g")) * 100 / models.functions.NullIf(F("m1_g") - F("m0_g"), 0),
        output_field=models.DecimalField(max_digits=15, decimal_places=12),
        db_persist=True,
    )

    class Meta:
        db_table = "Experiment_Parallels"
        constraints = [
            models.UniqueConstraint(fields=["experiment", "parallel_number"], name="tech_parallel_number_unique"),
            models.CheckConstraint(condition=Q(parallel_number__gt=0), name="tech_parallel_number_positive"),
            models.CheckConstraint(
                condition=Q(m0_g__gte=0, m1_g__gt=F("m0_g"), m2_g__gte=F("m0_g"), m2_g__lte=F("m1_g")),
                name="tech_parallel_mass_order",
            ),
        ]
