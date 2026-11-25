from datetime import datetime
from typing import Literal

from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone
from ninja import File, Query, Router, Schema, Status
from ninja.errors import HttpError
from ninja.files import UploadedFile

from apps.core.audience import audience_options, parse_target, reach, scope_label
from apps.core.files import serve

from . import services
from .models import Notice

router = Router(tags=["notices"])


class FileOut(Schema):
    id: int
    name: str
    size: int
    content_type: str


def _files(notice: Notice) -> list[dict]:
    return [
        {"id": f.pk, "name": f.original_name, "size": f.size, "content_type": f.content_type}
        for f in notice.attachments.all()
    ]


class NoticeOut(Schema):
    id: int
    title: str
    body: str
    priority: str
    published_at: datetime | None
    edited_at: datetime | None = None
    author_name: str
    attachments: list[FileOut] = []

    @staticmethod
    def resolve_attachments(obj):
        return _files(obj)

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
    publish_at: datetime | None
    expires_at: datetime | None
    expired: bool
    updated_at: datetime
    edited_at: datetime | None = None
    targets: list[TargetOut]
    reach: int
    attachments: list[FileOut] = []


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
    # With publish=True: when to send it out (leave empty for now) and when to take it down.
    publish_at: datetime | None = None
    expires_at: datetime | None = None


class ScheduleIn(Schema):
    publish_at: datetime


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
        "publish_at": notice.publish_at,
        "expires_at": notice.expires_at,
        "expired": notice.expires_at is not None and notice.expires_at <= timezone.now(),
        "updated_at": notice.updated_at,
        "edited_at": notice.edited_at,
        "attachments": _files(notice),
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
    services.publish_due()  # schedules work even when no background worker is running
    return (
        Notice.objects.live()
        .visible_to(request.user)
        .select_related("author")
        .prefetch_related("attachments")
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
    services.publish_due()
    notices = Notice.objects.filter(author=request.user).exclude(
        status=Notice.Status.ARCHIVED
    ).order_by("-updated_at")[:50]
    return [_mine_out(n) for n in notices]


@router.post("", response={201: MyNoticeOut, 403: ErrorOut, 422: ErrorOut})
def create_notice(request, payload: NoticeIn):
    notice = Notice(title=payload.title, body=payload.body, priority=payload.priority,
                    expires_at=payload.expires_at)
    targets = _parse_targets(payload.targets)
    try:
        if not payload.publish:
            services.save_draft(author=request.user, notice=notice, targets=targets)
        elif payload.publish_at is not None:
            services.schedule_notice(author=request.user, notice=notice, targets=targets,
                                     publish_at=payload.publish_at)
        else:
            services.publish_notice(author=request.user, notice=notice, targets=targets)
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


@router.post("/{notice_id}/schedule", response={200: MyNoticeOut, 403: ErrorOut, 422: ErrorOut})
def schedule(request, notice_id: int, payload: ScheduleIn):
    notice = _own_notice(request, notice_id)
    try:
        services.reschedule(author=request.user, notice=notice, publish_at=payload.publish_at)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    return Status(200, _mine_out(notice))


@router.post("/{notice_id}/unschedule",
             response={200: MyNoticeOut, 403: ErrorOut, 422: ErrorOut})
def unschedule(request, notice_id: int):
    notice = _own_notice(request, notice_id)
    try:
        services.unschedule(author=request.user, notice=notice)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    return Status(200, _mine_out(notice))


class NoticeEditIn(Schema):
    title: str
    body: str
    priority: Literal["normal", "important"] = "normal"
    expires_at: datetime | None = None
    # Only read for drafts and scheduled notices: a published one keeps its audience.
    targets: list[str] | None = None


@router.patch("/{notice_id}", response={200: MyNoticeOut, 403: ErrorOut, 422: ErrorOut})
def edit_notice(request, notice_id: int, payload: NoticeEditIn):
    notice = _own_notice(request, notice_id)
    targets = _parse_targets(payload.targets) if payload.targets is not None else None
    try:
        services.update_notice(author=request.user, notice=notice, title=payload.title,
                               body=payload.body, priority=payload.priority,
                               expires_at=payload.expires_at, targets=targets)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    return Status(200, _mine_out(notice))


@router.post("/{notice_id}/attachments", response={201: FileOut, 403: ErrorOut, 422: ErrorOut})
def attach(request, notice_id: int, file: File[UploadedFile]):
    notice = _own_notice(request, notice_id)
    try:
        f = services.add_attachment(author=request.user, notice=notice, upload=file)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    return Status(201, {"id": f.pk, "name": f.original_name, "size": f.size,
                        "content_type": f.content_type})


@router.delete("/{notice_id}/attachments/{file_id}", response={204: None, 403: ErrorOut})
def detach(request, notice_id: int, file_id: int):
    notice = _own_notice(request, notice_id)
    try:
        services.remove_attachment(author=request.user, notice=notice, file_id=file_id)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    return Status(204, None)


@router.get("/files/{file_id}", response={200: None})
def download(request, file_id: int):
    stored = services.downloadable_file(request.user, file_id)
    if stored is None:
        raise HttpError(404, "File not found")  # the same whether missing or not yours
    return serve(stored, cache="private, max-age=3600")


@router.post("/{notice_id}/archive", response={204: None, 403: ErrorOut})
def archive(request, notice_id: int):
    notice = _own_notice(request, notice_id)
    try:
        services.archive_notice(user=request.user, notice=notice)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    return Status(204, None)
