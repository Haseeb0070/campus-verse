from datetime import datetime
from typing import Literal

from django.core.exceptions import PermissionDenied, ValidationError
from ninja import Query, Router, Schema, Status
from ninja.errors import HttpError

from apps.core.audience import audience_options, parse_target, reach, scope_label

from . import services
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


class TargetOut(Schema):
    key: str
    label: str


class MyNoticeOut(Schema):
    id: int
    title: str
    body: str
    priority: str
    status: str
    published_at: datetime | None
    updated_at: datetime
    targets: list[TargetOut]
    reach: int


class AudienceOut(Schema):
    key: str
    scope_type: str
    scope_id: int
    label: str
    group: str
    detail: str = ""
    reach: int


class ReachOut(Schema):
    people: int


class NoticeIn(Schema):
    title: str
    body: str
    priority: Literal["normal", "important"] = "normal"
    targets: list[str]
    publish: bool = True


class ErrorOut(Schema):
    detail: str


def _parse_targets(keys: list[str]) -> list[tuple[str, int]]:
    try:
        return [parse_target(k) for k in keys]
    except ValueError:
        raise HttpError(422, "One of the audiences isn't valid.") from None


def _mine_out(notice: Notice) -> dict:
    targets = services.targets_of(notice)
    return {
        "id": notice.pk,
        "title": notice.title,
        "body": notice.body,
        "priority": notice.priority,
        "status": notice.status,
        "published_at": notice.published_at,
        "updated_at": notice.updated_at,
        "targets": [{"key": f"{t}:{i}", "label": scope_label(t, i)} for t, i in targets],
        "reach": reach(targets, notice.institution_id),
    }


def _own_notice(request, notice_id: int) -> Notice:
    notice = Notice.objects.filter(pk=notice_id, institution_id=request.user.institution_id).first()
    if notice is None:
        raise HttpError(404, "Notice not found")
    return notice


@router.get("", response=list[NoticeOut])
def list_notices(request, limit: int = 50):
    return (
        Notice.objects.published()
        .visible_to(request.user)
        .select_related("author")
        .order_by("-published_at")[: max(1, min(limit, 100))]
    )


@router.get("/audiences", response=list[AudienceOut])
def audiences(request):
    return audience_options(request.user)


@router.get("/reach", response=ReachOut)
def audience_reach(request, targets: Query[list[str]]):
    parsed = _parse_targets(targets)
    allowed = {o["key"] for o in audience_options(request.user)}
    if any(f"{t}:{i}" not in allowed for t, i in parsed):
        raise HttpError(403, "You can't post to one of the chosen audiences.")
    return {"people": reach(parsed, request.user.institution_id)}


@router.get("/mine", response=list[MyNoticeOut])
def my_notices(request):
    notices = Notice.objects.filter(author=request.user).exclude(
        status=Notice.Status.ARCHIVED
    ).order_by("-updated_at")[:50]
    return [_mine_out(n) for n in notices]


@router.post("", response={201: MyNoticeOut, 403: ErrorOut, 422: ErrorOut})
def create_notice(request, payload: NoticeIn):
    notice = Notice(title=payload.title, body=payload.body, priority=payload.priority)
    targets = _parse_targets(payload.targets)
    action = services.publish_notice if payload.publish else services.save_draft
    try:
        action(author=request.user, notice=notice, targets=targets)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    return Status(201, _mine_out(notice))


@router.post("/{notice_id}/publish", response={200: MyNoticeOut, 403: ErrorOut, 422: ErrorOut})
def publish(request, notice_id: int):
    notice = _own_notice(request, notice_id)
    try:
        services.publish_draft(author=request.user, notice=notice)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    return Status(200, _mine_out(notice))


@router.post("/{notice_id}/archive", response={204: None, 403: ErrorOut})
def archive(request, notice_id: int):
    notice = _own_notice(request, notice_id)
    try:
        services.archive_notice(user=request.user, notice=notice)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    return Status(204, None)
