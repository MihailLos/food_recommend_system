from django.core.management.base import BaseCommand

from catalog.models import ConsumerProfile


class Command(BaseCommand):
    help = "Delete legacy guest consumer profiles (user IS NULL)."

    def handle(self, *args, **options):
        qs = ConsumerProfile.objects.filter(user__isnull=True)
        count = qs.count()
        qs.delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {count} guest profile(s)."))

