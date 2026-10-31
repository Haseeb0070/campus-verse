from ninja import NinjaAPI
from ninja.security import django_auth

from apps.notices.api import router as notices_router

api = NinjaAPI(
    title="CampusVerse API",
    version="0.1.0",
    auth=django_auth,  # session auth; Ninja enforces CSRF on unsafe methods for it
    urls_namespace="api",
)


@api.get("/health", auth=None, tags=["system"])
def health(request):
    return {"status": "ok"}


api.add_router("/notices", notices_router)
