from datetime import datetime

from django.core.exceptions import ValidationError
from ninja import Router, Schema, Status

from . import preferences, services
from .models import Notification

router = Router(tags=["notifications"])


class NotificationOut(Schema):
    id: int
    kind: str
    title: str
    body: str
    link: str
    created_at: datetime
    read: bool

    @staticmethod
    def resolve_read(obj):
        return obj.read_at is not None


class NotificationList(Schema):
    items: list[NotificationOut]
    unread: int


class ReadIn(Schema):
    ids: list[int] | None = None  # omit to mark everything read


class ReadOut(Schema):
    updated: int


class PreferenceOut(Schema):
    key: str
    label: str
    detail: str
    locked: bool
    in_app: bool
    email: bool


class PreferenceIn(Schema):
    changes: dict[str, dict[str, bool]]


class ErrorOut(Schema):
    detail: str


@router.get("/preferences", response=list[PreferenceOut])
def get_preferences(request):
    return preferences.preferences_of(request.user)


@router.patch("/preferences", response={200: list[PreferenceOut], 422: ErrorOut})
def set_preferences(request, payload: PreferenceIn):
    try:
        return Status(200, preferences.update_preferences(request.user, payload.changes))
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})


@router.get("", response=NotificationList)
def list_notifications(request, limit: int = 30, unread_only: bool = False):
    # Notifications switched off for the app stay on record (and may be emailed), unlisted here.
    mine = Notification.objects.filter(recipient=request.user, in_app=True)
    items = mine.filter(read_at__isnull=True) if unread_only else mine
    return {
        "items": list(items[: max(1, min(limit, 100))]),
        "unread": mine.filter(read_at__isnull=True).count(),
    }


@router.post("/read", response=ReadOut)
def mark_read(request, payload: ReadIn):
    # Scoped to the signed-in user, so other people's IDs are silently ignored.
    return {"updated": services.mark_read(request.user, payload.ids)}
