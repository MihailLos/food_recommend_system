from django.db import connection, transaction
from django.db.models import Avg, Case, Exists, F, OuterRef, Q, Subquery, Value, When
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveAPIView
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import FoodProducts, FoodProductSubtypes, FoodProductTypes

from .models import (
    AnalyzedProduct, ExperimentData, PreprocessedProductData,
    ProcessedProductData, ProcessingType, UnprocessedProductData,
)
from .records import edit_parts, record_details, record_queryset, update_record
from .serializers import (
    BatchSerializer, DictionaryItem, JournalFilterOptions, ProcessingTypeInput, RecordDetailsSerializer,
    RecordEditInput, RecordInput, RecordSerializer, TechnologyOptions,
)


SORT_FIELDS = ("batch", "processing", "weight", "dry_matter")


class JournalQuery(serializers.Serializer):
    batch = serializers.IntegerField(min_value=1, max_value=2147483647, required=False)
    processing = serializers.IntegerField(min_value=0, max_value=2147483647, required=False)
    ordering = serializers.ChoiceField(
        choices=[field for key in SORT_FIELDS for field in (key, f"-{key}")], required=False,
    )


def journal_queryset(params):
    records = record_queryset()
    if "batch" in params:
        records = records.filter(analyzed_product_id=params["batch"])
    heat = ProcessedProductData.objects.filter(
        Q(unprocessed_product_id=OuterRef("pk")) | Q(preprocessed_product__unprocessed_product_id=OuterRef("pk")),
    )
    prep = PreprocessedProductData.objects.filter(unprocessed_product_id=OuterRef("pk"))
    method = params.get("processing")
    if method == 0:
        records = records.filter(~Exists(heat), ~Exists(prep))
    elif method is not None:
        records = records.filter(Exists(heat.filter(cpt_id=method)) | (~Exists(heat) & Exists(prep.filter(cpt_id=method))))
    ordering = params.get("ordering")
    if not ordering:
        return records
    key = ordering.lstrip("-")
    if key == "batch":
        expression = F("analyzed_product_id")
    elif key == "processing":
        expression = Coalesce(
            Subquery(heat.order_by("cpt__name", "id").values("cpt__name")[:1]),
            Subquery(prep.order_by("cpt__name", "id").values("cpt__name")[:1]),
            Value("Без обработки"),
        )
    elif key == "weight":
        expression = Coalesce(
            Subquery(heat.order_by("id").values("weight_g")[:1]),
            Subquery(prep.order_by("id").values("weight_g")[:1]),
            F("weight_g"),
        )
    else:
        expression = Subquery(ExperimentData.objects.filter(
            Q(unprocessed_product_id=OuterRef("pk"))
            | Q(preprocessed_product__unprocessed_product_id=OuterRef("pk"))
            | Q(processed_product__unprocessed_product_id=OuterRef("pk"))
            | Q(processed_product__preprocessed_product__unprocessed_product_id=OuterRef("pk")),
        ).annotate(
            stage_order=Case(
                When(processed_product__isnull=False, then=Value(0)),
                When(preprocessed_product__isnull=False, then=Value(1)),
                default=Value(2),
            ),
            percent=Avg("parallels__dry_matter_pct", default=F("reported_dry_matter_pct")),
        ).order_by("stage_order", "id").values("percent")[:1])
    direction = expression.desc if ordering.startswith("-") else expression.asc
    return records.order_by(direction(nulls_last=True), "-id")


class RecordListView(ListCreateAPIView):
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        filters = JournalQuery(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return journal_queryset(filters.validated_data)

    @extend_schema(parameters=[JournalQuery])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_serializer_class(self):
        return RecordInput if self.request.method == "POST" else RecordSerializer

    @extend_schema(request=RecordInput, responses={201: RecordDetailsSerializer})
    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = record_queryset(details=True).get(pk=serializer.save().pk)
        return Response(record_details(record), status=status.HTTP_201_CREATED)


class RecordDetailView(RetrieveAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = RecordDetailsSerializer

    def get_queryset(self):
        return record_queryset(details=True)

    def retrieve(self, request, *args, **kwargs):
        return Response(record_details(self.get_object()))

    @extend_schema(request=RecordEditInput, responses=RecordDetailsSerializer)
    @transaction.atomic
    def put(self, request, pk):
        raw = get_object_or_404(UnprocessedProductData.objects.select_for_update(), pk=pk)
        AnalyzedProduct.objects.select_for_update().get(pk=raw.analyzed_product_id)
        record = self.get_queryset().get(pk=raw.pk)
        parts = edit_parts(record)
        if parts is None:
            return Response({"detail": "В записи несколько обработок или анализов."}, status=status.HTTP_409_CONFLICT)
        serializer = RecordEditInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data["edit_version"] != record_details(record)["edit_version"]:
            return Response({"detail": "Запись уже изменилась. Откройте её заново."}, status=status.HTTP_409_CONFLICT)
        update_record(record, serializer.validated_data, parts)
        return Response(record_details(self.get_queryset().get(pk=raw.pk)))


class JournalFiltersView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=JournalFilterOptions)
    def get(self, request):
        batches = AnalyzedProduct.objects.filter(unprocessedproductdata__isnull=False).select_related("manual").distinct().order_by("id")
        heat = ProcessedProductData.objects.filter(
            Q(unprocessed_product_id=OuterRef("unprocessed_product_id"))
            | Q(preprocessed_product__unprocessed_product_id=OuterRef("unprocessed_product_id")),
        )
        primary = PreprocessedProductData.objects.filter(~Exists(heat)).values("cpt_id")
        heated = ProcessedProductData.objects.values("cpt_id")
        methods = ProcessingType.objects.filter(Q(pk__in=primary) | Q(pk__in=heated)).order_by("name", "id")
        has_raw = UnprocessedProductData.objects.filter(
            preprocessedproductdata__isnull=True, processedproductdata__isnull=True,
        ).exists()
        processing = list(methods.values("id", "name"))
        if has_raw:
            processing.insert(0, {"id": 0, "name": "Без обработки"})
        return Response({"batches": BatchSerializer(batches, many=True).data, "processing": processing})


class BatchListView(ListAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = BatchSerializer

    @extend_schema(parameters=[OpenApiParameter("search", str)])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        batches = AnalyzedProduct.objects.select_related("manual").order_by("-id")
        query = self.request.query_params.get("search", "").strip()
        if query:
            match = Q(product_name__icontains=query) | Q(sort_name__icontains=query) | Q(source_place__icontains=query)
            if query.isascii() and query.isdecimal() and len(query) <= 19:
                match |= Q(pk=int(query))
            batches = batches.filter(match)
        return batches


class OptionsView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(responses=TechnologyOptions)
    def get(self, request):
        return Response({
            "processing_types": list(ProcessingType.objects.order_by("name", "id").values("id", "name")),
            "groups": list(FoodProductTypes.objects.order_by("name", "id").values("id", "name")),
            "subgroups": list(FoodProductSubtypes.objects.order_by("name", "id").values("id", "name", "product_type_id")),
        })


class ProcessingTypeCreateView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(request=ProcessingTypeInput, responses={200: DictionaryItem, 201: DictionaryItem})
    @transaction.atomic
    def post(self, request):
        serializer = ProcessingTypeInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data["name"]

        with connection.cursor() as cursor:
            # Serialize lookup and insertion, including concurrent writes to the catalog table.
            cursor.execute('LOCK TABLE "Culinary_Processing_Types" IN SHARE ROW EXCLUSIVE MODE')
            existing = next((
                item for item in ProcessingType.objects.order_by("id")
                if " ".join(item.name.split()).casefold() == name.casefold()
            ), None)
            if existing is not None:
                return Response(DictionaryItem(existing).data)

            # Imported IDs can be ahead of the catalog sequence.
            cursor.execute(
                """
                INSERT INTO "Culinary_Processing_Types" ("ID", "Name")
                SELECT setval(sequence_id::regclass, GREATEST(
                    nextval(sequence_id::regclass),
                    (SELECT COALESCE(MAX("ID"), 0)::bigint + 1 FROM "Culinary_Processing_Types")
                )), %s
                FROM pg_get_serial_sequence('"Culinary_Processing_Types"', 'ID') AS sequence(sequence_id)
                RETURNING "ID"
                """,
                [name],
            )
            processing_id = cursor.fetchone()[0]
        return Response({"id": processing_id, "name": name}, status=status.HTTP_201_CREATED)


class CatalogMatchView(APIView):
    permission_classes = [IsAdminUser]

    @extend_schema(
        parameters=[OpenApiParameter("subgroup", int), OpenApiParameter("search", str)],
        responses=DictionaryItem(many=True),
    )
    def get(self, request):
        query = request.query_params.get("search", "").strip()
        subgroup = request.query_params.get("subgroup", "")
        products = FoodProducts.objects.order_by("name", "id")
        if subgroup.isascii() and subgroup.isdecimal() and len(subgroup) <= 10:
            products = products.filter(subtype_id=int(subgroup))
        elif len(query) >= 2:
            products = products.filter(name__icontains=query)[:50]
        else:
            return Response([])
        return Response(list(products.values("id", "name")))
