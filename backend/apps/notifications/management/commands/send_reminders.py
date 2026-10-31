from django.core.management.base import BaseCommand

from apps.notices.services import publish_due
from apps.notifications.services import send_scheduled


class Command(BaseCommand):
    help = (
        "Publish scheduled notices that are due, announce assignments that have opened and remind "
        "students 24 hours before deadlines. Celery beat runs these on its own; use this command "
        "without Redis or from cron."
    )

    def handle(self, *args, **options):
        notices = publish_due()
        counts = send_scheduled()
        self.stdout.write(
            self.style.SUCCESS(
                f"{notices} scheduled notices published; {counts['opened']} opened-assignment and "
                f"{counts['reminded']} reminder notifications sent."
            )
        )
