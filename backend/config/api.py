from django.views.decorators.csrf import ensure_csrf_cookie
from ninja import NinjaAPI
from ninja.decorators import decorate_view
from ninja.security import django_auth

from apps.academic.api import router as sections_router
from apps.administration.api import router as manage_router
from apps.assignments.api import router as assignments_router
from apps.chat.api import router as chat_router
from apps.events.api import router as events_router
from apps.feed.api import router as feed_router
from apps.identity.api import router as me_router
from apps.notices.api import router as notices_router
from apps.notifications.api import router as notifications_router
from apps.resources.api import router as resources_router
from apps.scheduling.api import router as timetable_router

api = NinjaAPI(
    title="CampusVerse API",
    version="0.1.0",
    auth=django_auth,  # session auth; Ninja enforces CSRF on unsafe methods for it
    urls_namespace="api",
)


@api.get("/health", auth=None, tags=["system"])
def health(request):
    return {"status": "ok"}


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
api.add_router("/manage", manage_router)
api.add_router("/feed", feed_router)
api.add_router("/resources", resources_router)
api.add_router("/events", events_router)
