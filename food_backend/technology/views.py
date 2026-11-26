from django.db import connection, transaction
from django.db.models import Avg, Count, F, Prefetch, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveAPIView
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import FoodProducts, FoodProductSubtypes, FoodProductTypes

from .models import (
    AnalyzedProduct, ExperimentData, ExperimentParallel, PreprocessedProductData,
    ProcessedProductData, ProcessingType, UnprocessedProductData,
)
from .serializers import (
    BatchSerializer, DictionaryItem, ProcessingTypeInput, RecordInput, RecordSerializer, TechnologyOptions,
)


def record_queryset(*, details=False):
    analyses = ExperimentData.objects.annotate(
        parallel_count=Count("parallels"),
        avg_dry_residue_g=Avg("parallels__dry_residue_g"),
        final_dry_matter_pct=Avg("parallels__dry_matter_pct", default=F("reported_dry_matter_pct")),
    ).order_by("id")
    if details:
        analyses = analyses.prefetch_related(Prefetch(
            "parallels", queryset=ExperimentParallel.objects.order_by("parallel_number"),
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


class RecordListView(ListCreateAPIView):
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        return record_queryset()

    def get_serializer_class(self):
        return RecordInput if self.request.method == "POST" else RecordSerializer

    @extend_schema(request=RecordInput, responses={201: RecordSerializer})
    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = record_queryset(details=True).get(pk=serializer.save().pk)
        return Response(RecordSerializer(record).data, status=status.HTTP_201_CREATED)


class RecordDetailView(RetrieveAPIView):
    permission_classes = [IsAdminUser]
    serializer_class = RecordSerializer

    def get_queryset(self):
        return record_queryset(details=True)


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
