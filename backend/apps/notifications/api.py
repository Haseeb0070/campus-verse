from datetime import datetime

from ninja import Router, Schema

from . import services
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


@router.get("", response=NotificationList)
def list_notifications(request, limit: int = 30, unread_only: bool = False):
    mine = Notification.objects.filter(recipient=request.user)
    items = mine.filter(read_at__isnull=True) if unread_only else mine
    return {
        "items": list(items[: max(1, min(limit, 100))]),
        "unread": mine.filter(read_at__isnull=True).count(),
    }


@router.post("/read", response=ReadOut)
def mark_read(request, payload: ReadIn):
    # Scoped to the signed-in user, so other people's IDs are silently ignored.
    return {"updated": services.mark_read(request.user, payload.ids)}
