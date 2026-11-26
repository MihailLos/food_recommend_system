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


def mass_field(*, optional=False, allow_zero=False):
    return serializers.DecimalField(
        max_digits=14, decimal_places=6,
        min_value=Decimal("0") if allow_zero else Decimal("0.000001"),
        required=not optional, allow_null=optional,
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


class ParallelInput(serializers.Serializer):
    m0_g = mass_field(allow_zero=True)
    m1_g = mass_field(allow_zero=True)
    m2_g = mass_field(allow_zero=True)

    def validate(self, attrs):
        m0, m1, m2 = attrs["m0_g"], attrs["m1_g"], attrs["m2_g"]
        errors = {}
        if m1 <= m0:
            errors["m1_g"] = "Масса бюкса с навеской должна быть больше массы тары."
        if not m0 <= m2 <= m1:
            errors["m2_g"] = "Масса после сушки должна быть между массой тары и массой до сушки."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class AnalysisInput(serializers.Serializer):
    stage = serializers.ChoiceField(choices=tuple(STAGE_FIELDS))
    result_mode = serializers.ChoiceField(choices=ExperimentData.ResultMode.choices)
    reported_dry_matter_pct = serializers.DecimalField(
        max_digits=14, decimal_places=6, min_value=0, max_value=100, required=False, allow_null=True,
    )
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
                [ExperimentParallel(experiment=experiment, **parallel) for parallel in parallels],
            )
        return raw


class ParallelSerializer(serializers.ModelSerializer):
    dry_residue_g = serializers.DecimalField(max_digits=14, decimal_places=6, read_only=True)
    dry_matter_pct = serializers.DecimalField(max_digits=15, decimal_places=12, read_only=True)

    class Meta:
        model = ExperimentParallel
        fields = ("parallel_number", "m0_g", "m1_g", "m2_g", "dry_residue_g", "dry_matter_pct")
        read_only_fields = fields


class AnalysisSerializer(serializers.ModelSerializer):
    parallel_count = serializers.IntegerField()
    avg_dry_residue_g = serializers.DecimalField(max_digits=14, decimal_places=6, allow_null=True)
    final_dry_matter_pct = serializers.DecimalField(max_digits=15, decimal_places=12)
    parallels = ParallelSerializer(many=True, read_only=True, source="ordered_parallels")

    class Meta:
        model = ExperimentData
        fields = ("id", "result_mode", "parallel_count", "avg_dry_residue_g", "final_dry_matter_pct", "parallels")


class HeatingSerializer(serializers.ModelSerializer):
    processing_name = serializers.CharField(source="cpt.name")
    analyses = AnalysisSerializer(many=True)

    class Meta:
        model = ProcessedProductData
        fields = (
            "id", "processing_name", "weight_g", "processing_temperature_celsius",
            "added_water_g", "added_oil_g", "analyses",
        )


class PreprocessingSerializer(serializers.ModelSerializer):
    processing_name = serializers.CharField(source="cpt.name")
    analyses = AnalysisSerializer(many=True)
    heating = HeatingSerializer(many=True)

    class Meta:
        model = PreprocessedProductData
        fields = ("id", "processing_name", "is_cut", "weight_g", "analyses", "heating")


class RecordSerializer(serializers.ModelSerializer):
    batch = BatchSerializer(source="analyzed_product")
    analyses = AnalysisSerializer(many=True)
    preprocessing = PreprocessingSerializer(many=True)
    heating = HeatingSerializer(many=True)

    class Meta:
        model = UnprocessedProductData
        fields = ("id", "batch", "weight_g", "analyses", "preprocessing", "heating")
