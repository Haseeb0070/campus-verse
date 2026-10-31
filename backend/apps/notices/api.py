from datetime import datetime

from ninja import Router, Schema

from .models import Notice

router = Router(tags=["notices"])


class NoticeOut(Schema):
    id: int
    title: str
    body: str
    priority: str
    published_at: datetime | None


@router.get("", response=list[NoticeOut])
def list_notices(request):
    return (
        Notice.objects.published()
        .visible_to(request.user)
        .order_by("-published_at")[:50]
    )
