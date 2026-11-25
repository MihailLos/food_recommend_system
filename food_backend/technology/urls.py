from django.urls import path

from .views import BatchListView, CatalogMatchView, OptionsView, RecordDetailView, RecordListView


urlpatterns = [
    path("records/", RecordListView.as_view(), name="technology-records"),
    path("records/<int:pk>/", RecordDetailView.as_view(), name="technology-record-detail"),
    path("batches/", BatchListView.as_view(), name="technology-batches"),
    path("options/", OptionsView.as_view(), name="technology-options"),
    path("catalog-products/", CatalogMatchView.as_view(), name="technology-catalog-products"),
]
