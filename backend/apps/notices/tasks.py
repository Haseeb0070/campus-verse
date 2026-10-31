from celery import shared_task

from . import services


@shared_task
def publish_due() -> int:
    """Celery beat runs this every minute to send scheduled notices out on time."""
    return services.publish_due()
