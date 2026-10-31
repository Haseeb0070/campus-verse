from django.core.management.base import BaseCommand

from apps.notifications.services import send_scheduled


class Command(BaseCommand):
    help = (
        "Announce assignments that have opened and remind students 24 hours before deadlines. "
        "Celery beat runs this every 5 minutes; use this command without Redis or from cron."
    )

    def handle(self, *args, **options):
        counts = send_scheduled()
        self.stdout.write(
            self.style.SUCCESS(
                f"{counts['opened']} opened-assignment and {counts['reminded']} reminder "
                "notifications sent."
            )
        )
