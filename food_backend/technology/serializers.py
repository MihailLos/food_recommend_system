from decimal import Decimal

from rest_framework import serializers

from .models import (
    AnalyzedProduct, ExperimentData, ExperimentParallel, PreprocessedProductData,
    ProcessedProductData, ProcessingType, UnprocessedProductData,
)


STAGE_FIELDS = {
    "raw": "unprocessed_product",
    "preprocessed": "preprocessed_product",
    "processed": "processed_product",
}
OIL_FREE_MASSES = tuple(f"m{i}_without_oil_g" for i in range(3))
OIL_FREE_PERCENT = "reported_dry_matter_without_oil_pct"
OIL_FREE_RESIDUE = "reported_dry_residue_without_oil_g"
OIL_FREE_PARALLEL_FIELDS = (*OIL_FREE_MASSES, OIL_FREE_RESIDUE, OIL_FREE_PERCENT)


class DictionaryItem(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class ProcessingTypeInput(serializers.Serializer):
    name = serializers.CharField(max_length=255)

    def validate_name(self, value):
        return " ".join(value.split())


class SubgroupItem(DictionaryItem):
    product_type_id = serializers.IntegerField()


class TechnologyOptions(serializers.Serializer):
    processing_types = DictionaryItem(many=True)
    groups = DictionaryItem(many=True)
    subgroups = SubgroupItem(many=True)


class BatchSerializer(serializers.ModelSerializer):
    manual_name = serializers.CharField(source="manual.name", read_only=True, default=None)

    class Meta:
        model = AnalyzedProduct
        fields = ("id", "product_name", "sort_name", "source_place", "acquisition_date", "manual", "manual_name")
        extra_kwargs = {"product_name": {"max_length": 120}}


class JournalFilterOptions(serializers.Serializer):
    batches = BatchSerializer(many=True)
    processing = DictionaryItem(many=True)


def mass_field(*, optional=False, allow_zero=False):
    return serializers.DecimalField(
        max_digits=14, decimal_places=6,
        min_value=Decimal("0") if allow_zero else Decimal("0.000001"),
        required=not optional, allow_null=optional,
    )


def optional_percent():
    return serializers.DecimalField(
        max_digits=14, decimal_places=6, min_value=0, max_value=100, required=False, allow_null=True,
    )


class PreprocessingInput(serializers.Serializer):
    cpt = serializers.PrimaryKeyRelatedField(queryset=ProcessingType.objects.all())
    weight_g = mass_field()
    is_cut = serializers.BooleanField(default=False)


class HeatingInput(serializers.Serializer):
    cpt = serializers.PrimaryKeyRelatedField(queryset=ProcessingType.objects.all())
    weight_g = mass_field(allow_zero=True)
    processing_temperature_celsius = serializers.DecimalField(
        max_digits=10, decimal_places=3, required=False, allow_null=True,
    )
    added_water_g = mass_field(optional=True, allow_zero=True)
    added_oil_g = mass_field(optional=True, allow_zero=True)
    oil_used = serializers.BooleanField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs.get("oil_used") is False and (attrs.get("added_oil_g") or 0) > 0:
            raise serializers.ValidationError({"added_oil_g": "Отметьте, что масло использовали."})
        return attrs


def weighing_errors(attrs, names):
    m0, m1, m2 = (attrs[key] for key in names)
    errors = {}
    if m1 <= m0:
        errors[names[1]] = "Масса бюкса с навеской должна быть больше массы тары."
    if not m0 <= m2 <= m1:
        errors[names[2]] = "Масса после сушки должна быть между массой тары и массой до сушки."
    return errors


class ParallelInput(serializers.Serializer):
    m0_g = mass_field(allow_zero=True)
    m1_g = mass_field(allow_zero=True)
    m2_g = mass_field(allow_zero=True)
    m0_without_oil_g = mass_field(optional=True, allow_zero=True)
    m1_without_oil_g = mass_field(optional=True, allow_zero=True)
    m2_without_oil_g = mass_field(optional=True, allow_zero=True)
    reported_dry_residue_without_oil_g = mass_field(optional=True, allow_zero=True)
    reported_dry_matter_without_oil_pct = optional_percent()
    parallel_number = serializers.IntegerField(min_value=1, required=False)

    def validate(self, attrs):
        errors = weighing_errors(attrs, ("m0_g", "m1_g", "m2_g"))
        if any(attrs.get(key) is not None for key in OIL_FREE_MASSES):
            missing = [key for key in OIL_FREE_MASSES if attrs.get(key) is None]
            if missing:
                errors.update(dict.fromkeys(missing, "Введите все три массы без учёта масла."))
            else:
                errors.update(weighing_errors(attrs, OIL_FREE_MASSES))
            for key in (OIL_FREE_RESIDUE, OIL_FREE_PERCENT):
                if attrs.get(key) is not None:
                    errors[key] = "При заполненных взвешиваниях результат рассчитывается автоматически."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class AnalysisInput(serializers.Serializer):
    stage = serializers.ChoiceField(choices=tuple(STAGE_FIELDS))
    result_mode = serializers.ChoiceField(choices=ExperimentData.ResultMode.choices)
    reported_dry_matter_pct = optional_percent()
    reported_dry_matter_without_oil_pct = optional_percent()
    parallels = ParallelInput(many=True, required=False)

    def validate(self, attrs):
        reported = attrs.get("reported_dry_matter_pct")
        parallels = attrs.get("parallels")
        if attrs["result_mode"] == ExperimentData.ResultMode.REPORTED:
            if reported is None:
                raise serializers.ValidationError({"reported_dry_matter_pct": "Введите готовый процент."})
            if parallels:
                raise serializers.ValidationError({"parallels": "Для готового процента взвешивания не вводятся."})
        else:
            if not parallels:
                raise serializers.ValidationError({"parallels": "Добавьте хотя бы одну параллель."})
            if reported is not None:
                raise serializers.ValidationError({"reported_dry_matter_pct": "Процент рассчитывается по взвешиваниям."})
        return attrs


class RecordInput(serializers.Serializer):
    batch = BatchSerializer(required=False)
    batch_id = serializers.PrimaryKeyRelatedField(queryset=AnalyzedProduct.objects.all(), required=False)
    weight_g = mass_field()
    preprocessing = PreprocessingInput(required=False)
    heating = HeatingInput(required=False)
    analysis = AnalysisInput(required=False)

    def validate(self, attrs):
        if ("batch" in attrs) == ("batch_id" in attrs):
            raise serializers.ValidationError({"batch_id": "Выберите существующую партию или заполните данные новой."})
        analysis = attrs.get("analysis")
        if analysis and (
            (analysis["stage"] == "preprocessed" and "preprocessing" not in attrs)
            or (analysis["stage"] == "processed" and "heating" not in attrs)
        ):
            raise serializers.ValidationError({"analysis": {"stage": "Сначала добавьте этот вид обработки."}})
        if analysis:
            heating = attrs.get("heating", {})
            uses_oil = heating.get("oil_used") is True or (heating.get("added_oil_g") or 0) > 0
            message = "Укажите использование масла при тепловой обработке."
            if analysis["stage"] != "processed" or not uses_oil:
                errors = {}
                if analysis.get(OIL_FREE_PERCENT) is not None:
                    errors[OIL_FREE_PERCENT] = message
                parallel_errors = [
                    {key: message for key in OIL_FREE_PARALLEL_FIELDS if parallel.get(key) is not None}
                    for parallel in analysis.get("parallels", [])
                ]
                if any(parallel_errors):
                    errors["parallels"] = parallel_errors
                if errors:
                    raise serializers.ValidationError({"analysis": errors})
        return attrs

    def create(self, validated_data):
        batch = validated_data.get("batch_id")
        if batch is None:
            batch = AnalyzedProduct.objects.create(**validated_data["batch"])
        raw = UnprocessedProductData.objects.create(analyzed_product=batch, weight_g=validated_data["weight_g"])
        stages = {"raw": raw}
        if "preprocessing" in validated_data:
            stages["preprocessed"] = PreprocessedProductData.objects.create(
                unprocessed_product=raw, **validated_data["preprocessing"],
            )
        if "heating" in validated_data:
            heat_source = {"preprocessed_product": stages["preprocessed"]} if "preprocessed" in stages else {
                "unprocessed_product": raw,
            }
            stages["processed"] = ProcessedProductData.objects.create(**heat_source, **validated_data["heating"])
        if "analysis" in validated_data:
            analysis = validated_data["analysis"].copy()
            stage = analysis.pop("stage")
            parallels = analysis.pop("parallels", [])
            experiment = ExperimentData.objects.create(**{STAGE_FIELDS[stage]: stages[stage]}, **analysis)
            ExperimentParallel.objects.bulk_create(
                [ExperimentParallel(experiment=experiment, **{
                    key: value for key, value in parallel.items() if key != "parallel_number"
                }) for parallel in parallels],
            )
        return raw


class RecordEditInput(RecordInput):
    edit_version = serializers.CharField(min_length=64, max_length=64)


class ParallelSerializer(serializers.ModelSerializer):
    dry_residue_g = serializers.DecimalField(max_digits=14, decimal_places=6, read_only=True)
    dry_matter_pct = serializers.DecimalField(max_digits=15, decimal_places=12, read_only=True)
    dry_residue_without_oil_g = serializers.DecimalField(max_digits=14, decimal_places=6, read_only=True, allow_null=True)
    dry_matter_without_oil_pct = serializers.DecimalField(max_digits=15, decimal_places=12, read_only=True, allow_null=True)

    class Meta:
        model = ExperimentParallel
        fields = (
            "parallel_number", "m0_g", "m1_g", "m2_g", "dry_residue_g", "dry_matter_pct",
            *OIL_FREE_PARALLEL_FIELDS, "dry_residue_without_oil_g", "dry_matter_without_oil_pct",
        )
        read_only_fields = fields


class AnalysisSerializer(serializers.ModelSerializer):
    parallel_count = serializers.IntegerField()
    avg_dry_residue_g = serializers.DecimalField(max_digits=14, decimal_places=6, allow_null=True)
    final_dry_matter_pct = serializers.DecimalField(max_digits=15, decimal_places=12)
    avg_dry_residue_without_oil_g = serializers.DecimalField(max_digits=14, decimal_places=6, allow_null=True)
    avg_dry_matter_without_oil_pct = serializers.DecimalField(max_digits=15, decimal_places=12, allow_null=True)
    final_dry_matter_without_oil_pct = serializers.DecimalField(max_digits=15, decimal_places=12, allow_null=True)
    oil_free_residue_count = serializers.IntegerField()
    oil_free_pct_count = serializers.IntegerField()
    parallels = ParallelSerializer(many=True, read_only=True, source="ordered_parallels")

    class Meta:
        model = ExperimentData
        fields = (
            "id", "result_mode", "parallel_count", "avg_dry_residue_g", "final_dry_matter_pct", "parallels",
            "reported_dry_matter_pct", OIL_FREE_PERCENT, "avg_dry_residue_without_oil_g",
            "avg_dry_matter_without_oil_pct", "final_dry_matter_without_oil_pct",
            "oil_free_residue_count", "oil_free_pct_count",
        )


class HeatingSerializer(serializers.ModelSerializer):
    processing_name = serializers.CharField(source="cpt.name")
    analyses = AnalysisSerializer(many=True)
    uses_oil = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProcessedProductData
        fields = (
            "id", "cpt", "processing_name", "weight_g", "processing_temperature_celsius",
            "added_water_g", "added_oil_g", "oil_used", "uses_oil", "analyses",
        )


class PreprocessingSerializer(serializers.ModelSerializer):
    processing_name = serializers.CharField(source="cpt.name")
    analyses = AnalysisSerializer(many=True)
    heating = HeatingSerializer(many=True)

    class Meta:
        model = PreprocessedProductData
        fields = ("id", "cpt", "processing_name", "is_cut", "weight_g", "analyses", "heating")


class RecordSerializer(serializers.ModelSerializer):
    batch = BatchSerializer(source="analyzed_product")
    analyses = AnalysisSerializer(many=True)
    preprocessing = PreprocessingSerializer(many=True)
    heating = HeatingSerializer(many=True)

    class Meta:
        model = UnprocessedProductData
        fields = ("id", "batch", "weight_g", "analyses", "preprocessing", "heating")


class RecordDetailsSerializer(RecordSerializer):
    edit_version = serializers.CharField(read_only=True)
    editable = serializers.BooleanField(read_only=True)

    class Meta(RecordSerializer.Meta):
        fields = (*RecordSerializer.Meta.fields, "edit_version", "editable")


class ReferenceDifferenceSerializer(serializers.Serializer):
    basis = serializers.ChoiceField(choices=("measured", "with_oil", "without_oil"))
    measured_pct = serializers.DecimalField(max_digits=15, decimal_places=12)
    difference_pp = serializers.DecimalField(max_digits=15, decimal_places=12)


class ReferenceComparisonSerializer(serializers.Serializer):
    analysis_id = serializers.IntegerField()
    product_name = serializers.CharField(allow_null=True)
    applied_steps = serializers.ListField(child=serializers.CharField())
    skipped_steps = serializers.ListField(child=serializers.CharField())
    reference_pct = serializers.DecimalField(max_digits=15, decimal_places=12, allow_null=True)
    sample_weight_g = serializers.DecimalField(max_digits=14, decimal_places=6)
    reference_sample_dry_matter_g = serializers.DecimalField(max_digits=20, decimal_places=12, allow_null=True)
    reason = serializers.CharField(allow_null=True)
    results = ReferenceDifferenceSerializer(many=True)


class RecordWithComparisonsSerializer(RecordDetailsSerializer):
    reference_comparisons = ReferenceComparisonSerializer(many=True, read_only=True)

    class Meta(RecordDetailsSerializer.Meta):
        fields = (*RecordDetailsSerializer.Meta.fields, "reference_comparisons")
