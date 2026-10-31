from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from apps.core.audience import can_target
from apps.core.models import AudienceTarget
from apps.governance import audit
from apps.identity.roles import is_institution_admin

from .models import Notice

MAX_TITLE = 200
MAX_BODY = 5000


def _validate(notice: Notice) -> None:
    notice.title = (notice.title or "").strip()
    notice.body = (notice.body or "").strip()
    if not notice.title:
        raise ValidationError("Give the notice a title.")
    if len(notice.title) > MAX_TITLE:
        raise ValidationError(f"Titles can be up to {MAX_TITLE} characters.")
    if not notice.body:
        raise ValidationError("Write the notice text.")
    if len(notice.body) > MAX_BODY:
        raise ValidationError(f"Notices can be up to {MAX_BODY} characters.")


def _check_targets(author, targets: list[tuple[str, int]]) -> None:
    for scope_type, scope_id in targets:
        if not can_target(author, scope_type, scope_id):
            raise PermissionDenied("You can't post to one of the chosen audiences.")


def _set_targets(notice: Notice, targets: list[tuple[str, int]]) -> None:
    content_type = ContentType.objects.get_for_model(Notice)
    AudienceTarget.objects.filter(content_type=content_type, object_id=notice.pk).delete()
    AudienceTarget.objects.bulk_create(
        AudienceTarget(
            institution_id=notice.institution_id,
            content_type=content_type,
            object_id=notice.pk,
            scope_type=scope_type,
            scope_id=scope_id,
        )
        for scope_type, scope_id in dict.fromkeys(targets)
    )


def targets_of(notice: Notice) -> list[tuple[str, int]]:
    return [(t.scope_type, t.scope_id) for t in notice.targets.order_by("pk")]


@transaction.atomic
def publish_notice(
    *, author, notice: Notice, targets: list[tuple[str, int]], notify: bool = True
) -> Notice:
    _validate(notice)
    if not targets:
        raise ValidationError("Choose who should see this notice.")
    _check_targets(author, targets)

    notice.author = author
    notice.institution_id = author.institution_id
    notice.status = Notice.Status.PUBLISHED
    notice.published_at = timezone.now()
    notice.save()
    _set_targets(notice, targets)
    audit.record(
        actor=author,
        action="notice.published",
        target=notice,
        changes={"targets": [f"{t}:{i}" for t, i in targets]},
    )
    if notify:
        from apps.notifications.tasks import after_commit

        after_commit("notice", notice.pk)
    return notice


@transaction.atomic
def save_draft(*, author, notice: Notice, targets: list[tuple[str, int]]) -> Notice:
    """Drafts are visible only to their author (visibility requires status=published)."""
    _validate(notice)
    _check_targets(author, targets)
    notice.author = author
    notice.institution_id = author.institution_id
    notice.status = Notice.Status.DRAFT
    notice.save()
    _set_targets(notice, targets)
    return notice


def publish_draft(*, author, notice: Notice) -> Notice:
    if notice.author_id != author.pk:
        raise PermissionDenied("Only the author can publish a draft.")
    if notice.status != Notice.Status.DRAFT:
        raise ValidationError("This notice isn't a draft.")
    return publish_notice(author=author, notice=notice, targets=targets_of(notice))


@transaction.atomic
def archive_notice(*, user, notice: Notice) -> Notice:
    """Takes a notice out of everyone's feed; history and the audit trail are kept."""
    if notice.author_id != user.pk and not is_institution_admin(user):
        raise PermissionDenied("You can only archive your own notices.")
    if notice.status != Notice.Status.ARCHIVED:
        notice.status = Notice.Status.ARCHIVED
        notice.save(update_fields=["status", "updated_at"])
        audit.record(actor=user, action="notice.archived", target=notice)
    return notice
