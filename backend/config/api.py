from django.views.decorators.csrf import ensure_csrf_cookie
from ninja import NinjaAPI
from ninja.decorators import decorate_view
from ninja.security import django_auth

from apps.identity.api import router as me_router
from apps.notices.api import router as notices_router
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
