from django.db import models
from django.db.models import F, Q


class ProcessingType(models.Model):
    """Mapping to the existing catalog dictionary; migrations do not own it."""
    id = models.IntegerField(primary_key=True, db_column="ID")
    name = models.TextField(db_column="Name")

    class Meta:
        managed = False
        db_table = "Culinary_Processing_Types"


class RawMaterialBatch(models.Model):
    code = models.TextField(unique=True)
    product = models.TextField()
    product_sort = models.TextField(null=True, blank=True)
    retailer_location = models.TextField(null=True, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    origin = models.TextField(null=True, blank=True)
    harvest_date = models.DateField(null=True, blank=True)
    storage_conditions = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "raw_materials_batches"


class ExperimentSeries(models.Model):
    code = models.TextField(unique=True)
    title = models.TextField()
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "experiment_series"


class ExperimentSample(models.Model):
    class State(models.TextChoices):
        BEFORE = "before_processing", "До обработки"
        AFTER = "after_processing", "После обработки"

    code = models.TextField(unique=True)
    batch = models.ForeignKey(RawMaterialBatch, on_delete=models.PROTECT)
    sample_state = models.TextField(choices=State.choices)
    selection_date = models.DateField(null=True, blank=True)
    preparation_description = models.TextField(null=True, blank=True)
    source_reference = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "experiment_samples"
        constraints = [models.CheckConstraint(condition=Q(sample_state__in=["before_processing", "after_processing"]), name="tech_sample_state")]


class TechnologicalExperiment(models.Model):
    code = models.TextField(unique=True)
    batch = models.ForeignKey(RawMaterialBatch, on_delete=models.PROTECT)
    series = models.ForeignKey(ExperimentSeries, on_delete=models.PROTECT)
    replicate_number = models.PositiveIntegerField()
    processing_type = models.ForeignKey(ProcessingType, on_delete=models.PROTECT)
    before_sample = models.ForeignKey(ExperimentSample, on_delete=models.PROTECT, null=True, blank=True, related_name="experiments_before")
    after_sample = models.ForeignKey(ExperimentSample, on_delete=models.PROTECT, null=True, blank=True, related_name="experiments_after")
    experiment_date = models.DateField(null=True, blank=True)
    cutting_shape = models.TextField(null=True, blank=True)
    cutting_size_mm = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    using_machinery = models.TextField(null=True, blank=True)
    temperature_celsius = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    processing_time_min = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    water_size_g = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    oil_size_g = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    initial_product_weight_g = models.DecimalField(max_digits=14, decimal_places=6)
    final_product_weight_g = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    gross_product_weight_g = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    preparation_description = models.TextField(null=True, blank=True)
    foil_used = models.BooleanField(null=True, blank=True)
    temperature_measurement_point = models.TextField(null=True, blank=True)
    time_start_event = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "technological_experiments"
        constraints = [
            models.UniqueConstraint(fields=["series", "replicate_number"], name="tech_series_replicate"),
            models.CheckConstraint(condition=Q(replicate_number__gt=0), name="tech_replicate_positive"),
            models.CheckConstraint(condition=Q(initial_product_weight_g__gt=0), name="tech_initial_mass_positive"),
        ] + [models.CheckConstraint(condition=Q(**{f"{field}__isnull": True}) | Q(**{f"{field}__gte": 0}), name=f"tech_nonnegative_{field}") for field in ["final_product_weight_g", "gross_product_weight_g", "processing_time_min", "water_size_g", "oil_size_g", "cutting_size_mm"]]


class DryMatterMeasurement(models.Model):
    sample = models.ForeignKey(ExperimentSample, on_delete=models.PROTECT, related_name="measurements")
    laboratory_parallel_number = models.PositiveIntegerField()
    reported_dry_matter_pct = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    analysis_date = models.DateField(null=True, blank=True)
    container_code = models.TextField(null=True, blank=True)
    m0_g = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    m1_g = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    m2_g = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True)
    method_reference = models.TextField(null=True, blank=True)
    drying_temperature_celsius = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    source_reference = models.TextField(null=True, blank=True)
    excluded_from_analysis = models.BooleanField(default=False)
    exclusion_reason = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "dry_matter_measurements"
        constraints = [
            models.UniqueConstraint(fields=["sample", "laboratory_parallel_number"], name="tech_sample_parallel"),
            models.CheckConstraint(condition=Q(laboratory_parallel_number__gt=0), name="tech_parallel_positive"),
            models.CheckConstraint(condition=Q(reported_dry_matter_pct__isnull=True) | Q(reported_dry_matter_pct__range=(0, 100)), name="tech_reported_pct_range"),
            models.CheckConstraint(condition=Q(m0_g__isnull=True) | Q(m1_g__isnull=True) | Q(m1_g__gt=F("m0_g")), name="tech_wet_mass_gt_tare"),
            models.CheckConstraint(condition=Q(m0_g__isnull=True) | Q(m2_g__isnull=True) | Q(m2_g__gte=F("m0_g")), name="tech_dry_mass_gte_tare"),
            models.CheckConstraint(condition=Q(m1_g__isnull=True) | Q(m2_g__isnull=True) | Q(m2_g__lte=F("m1_g")), name="tech_dry_mass_lte_wet"),
            models.CheckConstraint(condition=Q(excluded_from_analysis=False) | (Q(exclusion_reason__isnull=False) & ~Q(exclusion_reason__regex=r"^\s*$")), name="tech_exclusion_reason"),
        ] + [models.CheckConstraint(condition=Q(**{f"{field}__isnull": True}) | Q(**{f"{field}__gte": 0}), name=f"tech_nonnegative_{field}") for field in ["m0_g", "m1_g", "m2_g"]]


class DryingWeighing(models.Model):
    measurement = models.ForeignKey(DryMatterMeasurement, on_delete=models.PROTECT, related_name="weighings")
    weighing_number = models.PositiveIntegerField()
    additional_drying_time_min = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    mass_g = models.DecimalField(max_digits=14, decimal_places=6)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "drying_weighings"
        constraints = [
            models.UniqueConstraint(fields=["measurement", "weighing_number"], name="tech_measurement_weighing"),
            models.CheckConstraint(condition=Q(weighing_number__gt=0), name="tech_weighing_positive"),
            models.CheckConstraint(condition=Q(mass_g__gte=0), name="tech_weighing_mass_nonnegative"),
            models.CheckConstraint(condition=Q(additional_drying_time_min__isnull=True) | Q(additional_drying_time_min__gte=0), name="tech_drying_time_nonnegative"),
        ]
