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
        "resource": services.resource_shared,
    }[event]
    return handler(object_id)


@shared_task
def send_scheduled() -> dict[str, int]:
    return services.send_scheduled()


def after_commit(event: str, object_id: int) -> None:
    """Queue fan-out only once the triggering change is safely saved."""
    transaction.on_commit(lambda: fan_out.delay(event, object_id))


@shared_task(acks_late=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=5)
def send_emails(dedupe_key: str, user_ids: list[int]) -> int:
    from .emails import send_for

    return send_for(dedupe_key, user_ids)


def after_commit_email(dedupe_key: str, user_ids: list[int]) -> None:
    if not user_ids:
        return
    from django.conf import settings

    if settings.CAMPUSVERSE_EMAIL_IN_BACKGROUND:
        # No worker: send after the response, so a notice to the whole college doesn't hold up
        # the person posting it (or hit the request time limit).
        transaction.on_commit(lambda: _in_background(dedupe_key, user_ids))
    else:
        transaction.on_commit(lambda: send_emails.delay(dedupe_key, user_ids))


def _in_background(dedupe_key: str, user_ids: list[int]) -> None:
    import threading

    from django.db import close_old_connections

    def run():
        from .emails import send_for

        try:
            send_for(dedupe_key, user_ids)
        except Exception:  # noqa: BLE001 - the cron job sends what's left
            import logging

            logging.getLogger(__name__).warning(
                "Background email %s failed", dedupe_key, exc_info=True
            )
        finally:
            close_old_connections()

    threading.Thread(target=run, name=f"email-{dedupe_key}", daemon=True).start()


@shared_task(acks_late=True)
def send_push(user_ids: list[int], title: str, body: str, link: str, kind: str) -> int:
    from .push import send

    return send(user_ids, title=title, body=body, link=link, kind=kind)


def push_in_background(user_ids: list[int], *, title: str, body: str, link: str, kind: str) -> None:
    """Phone pushes off the request: a Celery task where there's a worker, else a thread, the
    same way emails go."""
    from django.conf import settings

    if not settings.CAMPUSVERSE_EMAIL_IN_BACKGROUND:
        send_push.delay(user_ids, title, body, link, kind)
        return
    import threading

    from django.db import close_old_connections

    def run():
        from .push import send

        try:
            send(user_ids, title=title, body=body, link=link, kind=kind)
        except Exception:  # noqa: BLE001 - best effort; the notification is in the app already
            import logging

            logging.getLogger(__name__).warning("Background push failed", exc_info=True)
        finally:
            close_old_connections()

    threading.Thread(target=run, name="push", daemon=True).start()
