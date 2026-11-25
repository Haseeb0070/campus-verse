import os

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.audience import audience_options, can_target, scope_label
from apps.core.files import check_upload, store_upload
from apps.core.models import AudienceScope, AudienceTarget
from apps.governance import audit
from apps.identity.models import RoleAssignment
from apps.identity.roles import is_institution_admin
from apps.notifications.models import Notification
from apps.notifications.services import notify
from apps.scheduling.services import member_section_ids

from .models import Comment, Post, Reaction, Report, Visibility

MAX_POST = 5000
MAX_COMMENT = 2000
MAX_FILES = 4
FEED_TYPES = {".png", ".jpg", ".jpeg", ".pdf"}


# Where you can post ---------------------------------------------------------------------------


def can_post_to(user, scope_type: str, scope_id: int) -> bool:
    """Anyone may post in sections they belong to (students included). Wider audiences
    (department, campus) need the same rights as publishing a notice there."""
    if scope_type == AudienceScope.SECTION and scope_id in member_section_ids(user):
        return True
    return can_target(user, scope_type, scope_id)


def post_audiences(user) -> list[dict]:
    from apps.academic.models import Section

    options = {o["key"]: o for o in audience_options(user)}
    sections = Section.objects.filter(pk__in=member_section_ids(user)).select_related(
        "offering__course"
    ).order_by("offering__course__code", "code")
    for s in sections:
        key = f"section:{s.pk}"
        options.setdefault(key, {
            "key": key, "scope_type": "section", "scope_id": s.pk,
            "label": f"{s.offering.course.code} · {s.code}", "group": "Subjects",
            "detail": s.offering.course.title,
        })
    order = {"Subjects": 0, "Departments": 1, "Institution": 2}
    return sorted(options.values(), key=lambda o: (order.get(o["group"], 3), o["label"]))


# Who moderates --------------------------------------------------------------------------------


def is_moderator(user) -> bool:
    """Institution-wide moderation: admins and people with the moderator role."""
    return is_institution_admin(user) or RoleAssignment.objects.filter(
        user=user, role=RoleAssignment.Role.MODERATOR, institution_id=user.institution_id
    ).exists()


def _targets(post: Post) -> list[tuple[str, int]]:
    return [(t.scope_type, t.scope_id) for t in post.targets.all()]


def can_moderate(user, post: Post) -> bool:
    """Institution moderators, or the teachers of every section the post was shared to."""
    if not user.is_authenticated or post.institution_id != user.institution_id:
        return False
    if is_moderator(user):
        return True
    targets = _targets(post)
    return bool(targets) and all(
        scope == AudienceScope.SECTION and can_target(user, scope, pk) for scope, pk in targets
    )


# Reading --------------------------------------------------------------------------------------


def feed_for(user, *, scope: tuple[str, int] | None = None, q: str = "", before: int | None = None,
             limit: int = 20) -> list[Post]:
    """Posts in your audiences (FR-FEED-08: filter by space, search by text). Hidden posts stay
    visible to their author and to people who can moderate them; removed ones only to the author."""
    qs = (
        Post.objects.visible_to(user)
        .filter(Q(visibility=Visibility.VISIBLE) | Q(author=user) | Q(visibility=Visibility.HIDDEN))
        .select_related("author")
        .prefetch_related("targets", "attachments")
    )
    if scope is not None:
        ids = AudienceTarget.objects.filter(
            content_type=ContentType.objects.get_for_model(Post),
            scope_type=scope[0], scope_id=scope[1],
        ).values("object_id")
        qs = qs.filter(pk__in=ids)
    if q.strip():
        qs = qs.filter(body__icontains=q.strip())
    if before:
        qs = qs.filter(pk__lt=before)
    posts = []
    for post in qs[: limit * 2]:
        if post.visibility == Visibility.HIDDEN and post.author_id != user.pk \
                and not can_moderate(user, post):
            continue
        posts.append(post)
        if len(posts) == limit:
            break
    return posts


def get_post_for(user, post_id: int) -> Post:
    post = Post.objects.visible_to(user).filter(pk=post_id).first()
    if post is None:
        raise Post.DoesNotExist
    if post.visibility != Visibility.VISIBLE and post.author_id != user.pk \
            and not (post.visibility == Visibility.HIDDEN and can_moderate(user, post)):
        raise Post.DoesNotExist
    return post


def visible_comments(user, post: Post):
    comments = post.comments.filter(deleted_at__isnull=True).select_related("author")
    if can_moderate(user, post):
        return comments.exclude(visibility=Visibility.REMOVED)
    return comments.filter(Q(visibility=Visibility.VISIBLE) | Q(author=user))


# Writing --------------------------------------------------------------------------------------


@transaction.atomic
def create_post(user, *, body: str, targets: list[tuple[str, int]], uploads=()) -> Post:
    from apps.core.ratelimit import limit

    limit(user, "post", per_minute=5)
    body = (body or "").strip()
    uploads = list(uploads)
    if not body and not uploads:
        raise ValidationError("Write something or attach a file.")
    if len(body) > MAX_POST:
        raise ValidationError(f"Posts can be up to {MAX_POST} characters.")
    if not targets:
        raise ValidationError("Choose where to post.")
    for scope_type, scope_id in targets:
        if not can_post_to(user, scope_type, scope_id):
            raise PermissionDenied("You can't post there.")
    if len(uploads) > MAX_FILES:
        raise ValidationError(f"Attach up to {MAX_FILES} files.")
    for upload in uploads:
        ext, _ = check_upload(upload)
        if ext not in FEED_TYPES:
            raise ValidationError(f"{os.path.basename(upload.name)}: posts take images or PDFs.")

    post = Post.objects.create(institution_id=user.institution_id, author=user, body=body)
    post.attachments.set([store_upload(user, u) for u in uploads])
    ct = ContentType.objects.get_for_model(Post)
    AudienceTarget.objects.bulk_create(
        AudienceTarget(institution_id=post.institution_id, content_type=ct, object_id=post.pk,
                       scope_type=t, scope_id=i)
        for t, i in dict.fromkeys(targets)
    )
    return post


def delete_post(user, post: Post) -> None:
    if post.author_id != user.pk:
        raise PermissionDenied("You can only delete your own posts.")
    post.deleted_at = timezone.now()
    post.save(update_fields=["deleted_at", "updated_at"])


@transaction.atomic
def add_comment(user, post: Post, *, body: str, parent_id: int | None = None) -> Comment:
    from apps.core.ratelimit import limit

    limit(user, "comment", per_minute=20)
    if post.visibility != Visibility.VISIBLE:
        raise ValidationError("This post isn't open for comments.")
    body = (body or "").strip()
    if not body:
        raise ValidationError("Write a comment first.")
    if len(body) > MAX_COMMENT:
        raise ValidationError(f"Comments can be up to {MAX_COMMENT} characters.")
    parent = None
    if parent_id:
        parent = post.comments.filter(pk=parent_id, parent__isnull=True,
                                      deleted_at__isnull=True).first()
        if parent is None:
            raise ValidationError("You can only reply to a comment on this post.")
    comment = Comment.objects.create(
        institution_id=post.institution_id, post=post, parent=parent, author=user, body=body
    )
    who = user.get_full_name() or user.email
    snippet = body if len(body) <= 120 else body[:119] + "…"
    common = {
        "kind": Notification.Kind.FEED_COMMENT,
        "institution_id": post.institution_id,
        "body": snippet,
        "link": f"/feed#post-{post.pk}",
        "actor_id": user.pk,
        "dedupe_key": f"comment:{comment.pk}",
    }
    if parent and parent.author_id != post.author_id:
        notify([parent.author_id], title=f"{who} replied to your comment", **common)
    notify([post.author_id], title=f"{who} commented on your post", **common)
    return comment


def delete_comment(user, comment: Comment) -> None:
    if comment.author_id != user.pk:
        raise PermissionDenied("You can only delete your own comments.")
    comment.deleted_at = timezone.now()
    comment.save(update_fields=["deleted_at", "updated_at"])


def toggle_reaction(user, post: Post) -> bool:
    """Like or unlike a post. Each person has at most one reaction on a post."""
    if post.visibility != Visibility.VISIBLE:
        raise ValidationError("This post isn't open for reactions.")
    deleted, _ = Reaction.objects.filter(post=post, user=user).delete()
    if deleted:
        return False
    Reaction.objects.create(institution_id=post.institution_id, post=post, user=user)
    return True


# Reports and moderation -----------------------------------------------------------------------


def _post_of(target) -> Post:
    return target if isinstance(target, Post) else target.post


def report(user, target, *, reason: str, details: str = "") -> Report:
    if reason not in Report.Reason.values:
        raise ValidationError("Choose a reason.")
    if target.author_id == user.pk:
        raise ValidationError("You can't report your own post. Delete it instead.")
    try:
        with transaction.atomic():
            return Report.objects.create(
                institution_id=target.institution_id,
                content_type=ContentType.objects.get_for_model(type(target)),
                object_id=target.pk, reporter=user, reason=reason, details=details.strip()[:500],
            )
    except IntegrityError:
        raise ValidationError("You've already reported this. A moderator will review it.") from None


def open_reports_for(user) -> list[Report]:
    reports = Report.objects.filter(
        institution_id=user.institution_id, status=Report.Status.OPEN
    ).select_related("reporter", "content_type")
    out = []
    for r in reports:
        target = r.target
        if target is not None and can_moderate(user, _post_of(target)):
            out.append(r)
    return out


@transaction.atomic
def moderate(user, target, *, action: str, note: str = "", report: Report | None = None) -> None:
    """hide (reversible), remove (final), restore, or dismiss a report. Logged with the reason;
    the author is told when their content is hidden or removed (SRS 6.5)."""
    if not can_moderate(user, _post_of(target)):
        raise PermissionDenied("You can't moderate this.")
    if action not in ("hide", "remove", "restore", "dismiss"):
        raise ValidationError("Unknown action.")
    if action == "dismiss" and report is None:
        raise ValidationError("Nothing to dismiss.")
    if action == "restore" and target.visibility != Visibility.HIDDEN:
        raise ValidationError("Only hidden content can be restored.")

    if action in ("hide", "remove", "restore"):
        target.visibility = {
            "hide": Visibility.HIDDEN, "remove": Visibility.REMOVED, "restore": Visibility.VISIBLE,
        }[action]
        target.save(update_fields=["visibility", "updated_at"])

    open_reports = Report.objects.filter(
        content_type=ContentType.objects.get_for_model(type(target)), object_id=target.pk,
        status=Report.Status.OPEN,
    )
    if action == "dismiss":
        open_reports = open_reports.filter(pk=report.pk)
    if action != "restore":
        open_reports.update(
            status=Report.Status.DISMISSED if action == "dismiss" else Report.Status.ACTIONED,
            resolved_by=user, resolved_at=timezone.now(), resolution=action, note=note[:500],
        )

    kind = type(target).__name__.lower()
    audit.record(actor=user, action=f"moderation.{action}", target=target,
                 changes={"kind": kind, "author": target.author_id, "note": note[:200]})
    if action in ("hide", "remove"):
        post = _post_of(target)
        notify(
            [target.author_id],
            kind=Notification.Kind.MODERATION,
            institution_id=target.institution_id,
            title=f"Your {kind} was {'hidden' if action == 'hide' else 'removed'} by a moderator",
            body=note or "It broke the community guidelines for this space.",
            link=f"/feed#post-{post.pk}",
            actor_id=user.pk,
            dedupe_key=f"moderation:{kind}:{target.pk}:{action}",
        )


def target_labels(post: Post) -> list[str]:
    return [scope_label(t, i) for t, i in _targets(post)]
