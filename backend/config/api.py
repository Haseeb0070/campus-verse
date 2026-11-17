import hmac
import logging

from django.conf import settings
from django.views.decorators.csrf import ensure_csrf_cookie
from ninja import NinjaAPI
from ninja.decorators import decorate_view
from ninja.errors import HttpError
from ninja.security import django_auth

from apps.academic.api import router as sections_router
from apps.administration.api import router as manage_router
from apps.administration.structure_api import router as structure_router
from apps.assignments.api import router as assignments_router
from apps.attendance.api import progress_router
from apps.attendance.api import router as attendance_router
from apps.chat.api import router as chat_router
from apps.events.api import router as events_router
from apps.feed.api import router as feed_router
from apps.identity.api import router as me_router
from apps.notices.api import router as notices_router
from apps.notifications.api import router as notifications_router
from apps.resources.api import router as resources_router
from apps.scheduling.api import router as timetable_router
from apps.search.api import router as search_router

logger = logging.getLogger(__name__)

api = NinjaAPI(
    title="CampusVerse API",
    version="0.1.0",
    auth=django_auth,  # session auth; Ninja enforces CSRF on unsafe methods for it
    urls_namespace="api",
)


@api.get("/health", auth=None, tags=["system"])
def health(request):
    return {"status": "ok"}


@api.post("/cron", auth=None, tags=["system"])
def cron(request):
    """Runs the scheduled jobs, for hosts with no Celery beat (an outside timer calls this).

    Locked behind CRON_SECRET, sent as "Authorization: Bearer <secret>". Without a secret set,
    the endpoint doesn't exist. Each job is idempotent, so a missed or doubled call is harmless:
    the next one catches up.
    """
    secret = settings.CAMPUSVERSE_CRON_SECRET
    sent = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not secret or not hmac.compare_digest(sent.encode(), secret.encode()):
        raise HttpError(404, "Not found")

    from apps.administration.tasks import run_due_sources
    from apps.notices.tasks import publish_due
    from apps.notifications.tasks import send_scheduled

    results: dict[str, object] = {}
    # Quickest and most time-sensitive first; a slow sync source can't hold up a notice.
    for name, job in (
        ("notices_published", publish_due),
        ("notifications", send_scheduled),
        ("sources_synced", run_due_sources),
    ):
        try:
            results[name] = job()
        except Exception:  # one failing job shouldn't stop the others
            logger.exception("Scheduled job %s failed", name)
            results[name] = "failed"
    return results


@api.get("/csrf", auth=None, tags=["system"])
@decorate_view(ensure_csrf_cookie)
def csrf(request):
    """Sets the csrftoken cookie the web app sends back as X-CSRFToken."""
    return {"status": "ok"}


api.add_router("/me", me_router)
api.add_router("/notices", notices_router)
api.add_router("/timetable", timetable_router)
api.add_router("/chat", chat_router)
api.add_router("/sections", sections_router)
api.add_router("/assignments", assignments_router)
api.add_router("/notifications", notifications_router)
api.add_router("/manage/structure", structure_router)
api.add_router("/manage", manage_router)
api.add_router("/feed", feed_router)
api.add_router("/resources", resources_router)
api.add_router("/events", events_router)
api.add_router("/attendance", attendance_router)
api.add_router("/progress", progress_router)
api.add_router("/search", search_router)
