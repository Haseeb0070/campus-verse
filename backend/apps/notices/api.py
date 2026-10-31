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
    author_name: str

    @staticmethod
    def resolve_author_name(obj):
        return str(obj.author)


@router.get("", response=list[NoticeOut])
def list_notices(request, limit: int = 50):
    return (
        Notice.objects.published()
        .visible_to(request.user)
        .select_related("author")
        .order_by("-published_at")[: max(1, min(limit, 100))]
    )
