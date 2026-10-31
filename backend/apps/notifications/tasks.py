"""Celery entry points. Without Redis (local dev, tests) Celery runs these inline."""

from celery import shared_task
from django.db import transaction

from . import services


@shared_task(acks_late=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=5)
def fan_out(event: str, object_id: int) -> int:
    handler = {
        "notice": services.notice_published,
        "class_change": services.class_changed,
        "assignment_opened": services.assignment_opened,
        "grades_released": services.grades_released,
    }[event]
    return handler(object_id)


@shared_task
def send_scheduled() -> dict[str, int]:
    return services.send_scheduled()


def after_commit(event: str, object_id: int) -> None:
    """Queue fan-out only once the triggering change is safely saved."""
    transaction.on_commit(lambda: fan_out.delay(event, object_id))
