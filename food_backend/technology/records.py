import hashlib

from django.db.models import Avg, Count, DecimalField, F, Prefetch
from django.db.models.functions import Coalesce, NullIf
from rest_framework.exceptions import ValidationError
from rest_framework.renderers import JSONRenderer

from .models import ExperimentData, ExperimentParallel, PreprocessedProductData, ProcessedProductData, UnprocessedProductData
from .serializers import OIL_FREE_PARALLEL_FIELDS, STAGE_FIELDS, RecordSerializer


def oil_free_values(prefix=""):
    m0, m1, m2 = (F(f"{prefix}m{i}_without_oil_g") for i in range(3))
    residue = m2 - m0
    return {
        "dry_residue_without_oil_g": Coalesce(residue, F(f"{prefix}reported_dry_residue_without_oil_g")),
        "dry_matter_without_oil_pct": Coalesce(
            residue * 100 / NullIf(m1 - m0, 0), F(f"{prefix}reported_dry_matter_without_oil_pct"),
            output_field=DecimalField(max_digits=15, decimal_places=12),
        ),
    }


def record_queryset(*, details=False):
    corrected = oil_free_values("parallels__")
    residue = corrected["dry_residue_without_oil_g"]
    percent = corrected["dry_matter_without_oil_pct"]
    analyses = ExperimentData.objects.annotate(
        parallel_count=Count("parallels"),
        avg_dry_residue_g=Avg("parallels__dry_residue_g"),
        final_dry_matter_pct=Avg("parallels__dry_matter_pct", default=F("reported_dry_matter_pct")),
        avg_dry_residue_without_oil_g=Avg(residue),
        avg_dry_matter_without_oil_pct=Avg(percent),
        final_dry_matter_without_oil_pct=Coalesce(F("reported_dry_matter_without_oil_pct"), Avg(percent)),
        oil_free_residue_count=Count(residue),
        oil_free_pct_count=Count(percent),
    ).order_by("id")
    if details:
        analyses = analyses.prefetch_related(Prefetch(
            "parallels", queryset=ExperimentParallel.objects.annotate(**oil_free_values()).order_by("parallel_number"),
            to_attr="ordered_parallels",
        ))

    def with_analyses(queryset):
        return queryset.prefetch_related(Prefetch("experimentdata_set", queryset=analyses, to_attr="analyses"))

    heating = with_analyses(ProcessedProductData.objects.select_related("cpt").order_by("id"))
    heating_relation = Prefetch("processedproductdata_set", queryset=heating, to_attr="heating")
    preprocessing = with_analyses(
        PreprocessedProductData.objects.select_related("cpt").order_by("id"),
    ).prefetch_related(heating_relation)
    return with_analyses(UnprocessedProductData.objects.select_related("analyzed_product__manual")).prefetch_related(
        Prefetch("preprocessedproductdata_set", queryset=preprocessing, to_attr="preprocessing"),
        heating_relation,
    ).order_by("-id")


def edit_parts(record):
    prep = record.preprocessing
    heating = [*record.heating, *(heat for part in prep for heat in part.heating)]
    analyses = [*record.analyses, *(a for part in [*prep, *heating] for a in part.analyses)]
    if any(len(parts) > 1 for parts in (prep, heating, analyses)):
        return None
    return tuple(next(iter(parts), None) for parts in (prep, heating, analyses))


def record_details(record):
    data = dict(RecordSerializer(record).data)
    data["edit_version"] = hashlib.sha256(JSONRenderer().render(data)).hexdigest()
    data["editable"] = edit_parts(record) is not None
    return data


def save_part(model, instance, values):
    if instance is None:
        return model.objects.create(**values)
    for key, value in values.items():
        setattr(instance, key, value)
    instance.save(update_fields=tuple(values))
    return instance


def update_analysis(experiment, data, stages):
    if data is None:
        if experiment is not None:
            experiment.delete()
        return

    data = data.copy()
    stage = data.pop("stage")
    parallels = data.pop("parallels", [])
    known = {p.parallel_number: p for p in experiment.ordered_parallels} if experiment is not None else {}
    numbers = [p["parallel_number"] for p in parallels if "parallel_number" in p]
    if len(set(numbers)) != len(numbers) or any(number not in known for number in numbers):
        raise ValidationError({"analysis": {"parallels": "Проверьте номера сохранённых параллелей."}})
    values = {field: stages[stage] if key == stage else None for key, field in STAGE_FIELDS.items()}
    experiment = save_part(ExperimentData, experiment, {
        **values, "reported_dry_matter_pct": None, "reported_dry_matter_without_oil_pct": None, **data,
    })
    # The database allocates new numbers after the existing ones. Insert before removing old rows.
    for parallel in parallels:
        values = parallel.copy()
        number = values.pop("parallel_number", None)
        save_part(ExperimentParallel, known.get(number), {
            "experiment": experiment, **dict.fromkeys(OIL_FREE_PARALLEL_FIELDS), **values,
        })
    obsolete = [parallel.pk for number, parallel in known.items() if number not in numbers]
    if obsolete:
        ExperimentParallel.objects.filter(pk__in=obsolete).delete()


def update_record(record, data, parts):
    old_prep, old_heat, old_analysis = parts
    current_batch = record.analyzed_product
    if "batch" in data:
        batch = save_part(type(current_batch), current_batch, data["batch"])
    else:
        batch = data["batch_id"]
    save_part(UnprocessedProductData, record, {"analyzed_product": batch, "weight_g": data["weight_g"]})

    prep = heat = None
    if "preprocessing" in data:
        prep = save_part(PreprocessedProductData, old_prep, {
            "unprocessed_product": record, **data["preprocessing"],
        })
    if "heating" in data:
        heat = save_part(ProcessedProductData, old_heat, {
            "unprocessed_product": None if prep is not None else record, "preprocessed_product": prep,
            "oil_used": None, "added_oil_g": None, "added_water_g": None, "processing_temperature_celsius": None,
            **data["heating"],
        })
    update_analysis(old_analysis, data.get("analysis"), {"raw": record, "preprocessed": prep, "processed": heat})
    if old_heat is not None and heat is None:
        old_heat.delete()
    if old_prep is not None and prep is None:
        old_prep.delete()
