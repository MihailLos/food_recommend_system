from django.contrib.sessions.models import Session
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Delete all active Django sessions."

    def handle(self, *args, **options):
        count, _ = Session.objects.all().delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {count} session row(s)."))
