from collections import Counter
from datetime import datetime
from typing import Literal

from django.core.exceptions import PermissionDenied, ValidationError
from django.db.models import Count
from django.http import FileResponse
from ninja import File, Form, Query, Router, Schema, Status
from ninja.errors import HttpError
from ninja.files import UploadedFile

from apps.chat.serializers import initials
from apps.core.audience import parse_target
from apps.core.models import StoredFile

from . import services
from .models import Comment, Post, Reaction, Report, Visibility

router = Router(tags=["feed"])


class PersonOut(Schema):
    id: int
    name: str
    initials: str
    kind: str


class FileOut(Schema):
    id: int
    name: str
    size: int
    content_type: str


class PostOut(Schema):
    id: int
    author: PersonOut
    body: str
    audiences: list[str]
    attachments: list[FileOut]
    created_at: datetime
    visibility: str
    reaction_count: int
    reacted: bool
    comment_count: int
    mine: bool
    can_moderate: bool


class CommentOut(Schema):
    id: int
    parent_id: int | None
    author: PersonOut
    body: str
    created_at: datetime
    visibility: str
    mine: bool


class AudienceOut(Schema):
    key: str
    label: str
    group: str
    detail: str = ""


class CommentIn(Schema):
    body: str
    parent_id: int | None = None


class ReportIn(Schema):
    target_type: Literal["post", "comment"]
    target_id: int
    reason: str
    details: str = ""


class ModerateIn(Schema):
    target_type: Literal["post", "comment"]
    target_id: int
    action: Literal["hide", "remove", "restore"]
    note: str = ""


class ResolveIn(Schema):
    action: Literal["dismiss", "hide", "remove"]
    note: str = ""


class ReportOut(Schema):
    id: int
    reason: str
    details: str
    reporter: str
    created_at: datetime
    target_type: str
    target_id: int
    post_id: int
    body: str
    author: str
    visibility: str
    reports_on_target: int


class FeedQuery(Schema):
    scope: str | None = None
    q: str = ""
    before: int | None = None


class ErrorOut(Schema):
    detail: str


def _person(u) -> dict:
    return {"id": u.pk, "name": u.get_full_name() or u.email, "initials": initials(u),
            "kind": u.kind}


def _file(f: StoredFile) -> dict:
    return {"id": f.pk, "name": f.original_name, "size": f.size, "content_type": f.content_type}


def _posts_out(user, posts: list[Post]) -> list[dict]:
    ids = [p.pk for p in posts]
    counts: Counter = Counter()
    mine: set[int] = set()
    for post_id, user_id in Reaction.objects.filter(post_id__in=ids).values_list(
        "post_id", "user_id"
    ):
        counts[post_id] += 1
        if user_id == user.pk:
            mine.add(post_id)
    comments = dict(
        Comment.objects.filter(post_id__in=ids, deleted_at__isnull=True,
                               visibility=Visibility.VISIBLE)
        .values("post_id").annotate(n=Count("id")).values_list("post_id", "n")
    )
    return [
        {
            "id": p.pk,
            "author": _person(p.author),
            # Removed content is never shown again, even to its author.
            "body": "" if p.visibility == Visibility.REMOVED else p.body,
            "audiences": services.target_labels(p),
            "attachments": [] if p.visibility == Visibility.REMOVED
            else [_file(f) for f in p.attachments.all()],
            "created_at": p.created_at,
            "visibility": p.visibility,
            "reaction_count": counts[p.pk],
            "reacted": p.pk in mine,
            "comment_count": comments.get(p.pk, 0),
            "mine": p.author_id == user.pk,
            "can_moderate": services.can_moderate(user, p),
        }
        for p in posts
    ]


def _comment(user, c: Comment) -> dict:
    return {
        "id": c.pk, "parent_id": c.parent_id, "author": _person(c.author),
        # visible_comments() already decides who sees what; removed text is never sent back.
        "body": "" if c.visibility == Visibility.REMOVED else c.body,
        "created_at": c.created_at, "visibility": c.visibility, "mine": c.author_id == user.pk,
    }


def _get(request, post_id: int) -> Post:
    try:
        return services.get_post_for(request.user, post_id)
    except Post.DoesNotExist:
        raise HttpError(404, "Post not found") from None


def _target(request, kind: str, target_id: int):
    if kind == "post":
        return _get(request, target_id)
    comment = Comment.objects.select_related("post").filter(
        pk=target_id, deleted_at__isnull=True
    ).first()
    if comment is None:
        raise HttpError(404, "Comment not found")
    _get(request, comment.post_id)  # you must be able to see the post it's on
    return comment


def _call(fn):
    try:
        return fn()
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})


@router.get("/posts", response=list[PostOut])
def feed(request, query: Query[FeedQuery]):
    scope = None
    if query.scope:
        try:
            scope = parse_target(query.scope)
        except ValueError:
            raise HttpError(422, "Unknown space") from None
    posts = services.feed_for(request.user, scope=scope, q=query.q, before=query.before)
    return _posts_out(request.user, posts)


@router.get("/audiences", response=list[AudienceOut])
def audiences(request):
    return services.post_audiences(request.user)


@router.post("/posts", response={201: PostOut, 403: ErrorOut, 422: ErrorOut})
def create(request, body: Form[str] = "", targets: Form[list[str]] = None,
           files: File[list[UploadedFile]] = None):
    try:
        parsed = [parse_target(t) for t in (targets or [])]
    except ValueError:
        return Status(422, {"detail": "Choose where to post."})

    def go():
        post = services.create_post(request.user, body=body, targets=parsed, uploads=files or [])
        return Status(201, _posts_out(request.user, [post])[0])

    return _call(go)


@router.delete("/posts/{post_id}", response={204: None, 403: ErrorOut})
def delete(request, post_id: int):
    post = _get(request, post_id)
    return _call(lambda: (services.delete_post(request.user, post), Status(204, None))[1])


@router.get("/posts/{post_id}/comments", response=list[CommentOut])
def comments(request, post_id: int):
    post = _get(request, post_id)
    return [_comment(request.user, c) for c in services.visible_comments(request.user, post)]


@router.post("/posts/{post_id}/comments",
             response={201: CommentOut, 403: ErrorOut, 422: ErrorOut})
def add_comment(request, post_id: int, payload: CommentIn):
    post = _get(request, post_id)
    return _call(lambda: Status(201, _comment(request.user, services.add_comment(
        request.user, post, body=payload.body, parent_id=payload.parent_id))))


@router.delete("/comments/{comment_id}", response={204: None, 403: ErrorOut})
def delete_comment(request, comment_id: int):
    comment = _target(request, "comment", comment_id)
    return _call(lambda: (services.delete_comment(request.user, comment), Status(204, None))[1])


@router.post("/posts/{post_id}/reactions", response={200: dict, 422: ErrorOut})
def react(request, post_id: int):
    post = _get(request, post_id)
    return _call(lambda: Status(200, {"on": services.toggle_reaction(request.user, post)}))


@router.post("/reports", response={201: dict, 422: ErrorOut})
def make_report(request, payload: ReportIn):
    target = _target(request, payload.target_type, payload.target_id)
    return _call(lambda: Status(201, {"id": services.report(
        request.user, target, reason=payload.reason, details=payload.details).pk}))


@router.get("/files/{file_id}", response={200: None})
def download(request, file_id: int):
    post = Post.objects.filter(attachments__id=file_id).first()
    stored = StoredFile.objects.filter(pk=file_id).first()
    try:
        visible = post is not None and stored is not None and \
            services.get_post_for(request.user, post.pk).visibility != Visibility.REMOVED
    except Post.DoesNotExist:
        visible = False
    if not visible:
        raise HttpError(404, "File not found")
    inline = stored.content_type.startswith("image/")
    response = FileResponse(stored.file.open("rb"), as_attachment=not inline,
                            filename=stored.original_name, content_type=stored.content_type)
    response["Cache-Control"] = "private, max-age=3600"
    return response


# Moderation ----------------------------------------------------------------------------------


@router.get("/moderation/reports", response=list[ReportOut])
def queue(request):
    reports = services.open_reports_for(request.user)
    per_target = Counter((r.content_type_id, r.object_id) for r in reports)
    out = []
    for r in reports:
        t = r.target
        out.append({
            "id": r.pk, "reason": r.reason, "details": r.details, "reporter": str(r.reporter),
            "created_at": r.created_at, "target_type": type(t).__name__.lower(),
            "target_id": t.pk, "post_id": t.pk if isinstance(t, Post) else t.post_id,
            "body": t.body, "author": str(t.author), "visibility": t.visibility,
            "reports_on_target": per_target[(r.content_type_id, r.object_id)],
        })
    return out


@router.post("/moderation/reports/{report_id}/resolve",
             response={204: None, 403: ErrorOut, 422: ErrorOut})
def resolve(request, report_id: int, payload: ResolveIn):
    r = Report.objects.filter(pk=report_id, institution_id=request.user.institution_id,
                              status=Report.Status.OPEN).first()
    if r is None or r.target is None:
        raise HttpError(404, "Report not found")
    return _call(lambda: (services.moderate(request.user, r.target, action=payload.action,
                                            note=payload.note, report=r), Status(204, None))[1])


@router.post("/moderation/actions", response={204: None, 403: ErrorOut, 422: ErrorOut})
def moderate(request, payload: ModerateIn):
    model = Post if payload.target_type == "post" else Comment
    target = model.objects.filter(pk=payload.target_id,
                                  institution_id=request.user.institution_id).first()
    if target is None:
        raise HttpError(404, "Not found")
    return _call(lambda: (services.moderate(request.user, target, action=payload.action,
                                            note=payload.note), Status(204, None))[1])


@router.get("/moderation/summary", response=dict)
def summary(request):
    """Whether to show Moderation in the nav, and the open count for its badge."""
    from apps.enrollment.models import TeacherAssignment

    can = services.is_moderator(request.user) or TeacherAssignment.objects.filter(
        teacher=request.user).exists()
    return {"can_moderate": can, "open": len(services.open_reports_for(request.user)) if can else 0}
