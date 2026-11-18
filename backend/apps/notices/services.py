from datetime import timedelta

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


MAX_SCHEDULE_AHEAD = timedelta(days=365)


def _check_times(notice: Notice, *, goes_out) -> None:
    """A scheduled time must be ahead and within a year; an expiry must come after it goes out."""
    now = timezone.now()
    if notice.publish_at is not None and notice.status == Notice.Status.SCHEDULED:
        if notice.publish_at <= now:
            raise ValidationError("Pick a time in the future, or publish it now.")
        if notice.publish_at > now + MAX_SCHEDULE_AHEAD:
            raise ValidationError("Notices can be scheduled up to a year ahead.")
    if notice.expires_at is not None and notice.expires_at <= (goes_out or now):
        raise ValidationError("The take-down time has to be after it goes out.")


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
    notice.publish_at = None
    _check_times(notice, goes_out=notice.published_at)
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
    notice.publish_at = None
    _check_times(notice, goes_out=None)
    notice.save()
    _set_targets(notice, targets)
    return notice


@transaction.atomic
def schedule_notice(
    *, author, notice: Notice, targets: list[tuple[str, int]], publish_at
) -> Notice:
    """Saves the notice to publish itself later (FR-NOT-03). Until then only the author sees it;
    nobody is notified until it actually goes out."""
    _validate(notice)
    if not targets:
        raise ValidationError("Choose who should see this notice.")
    _check_targets(author, targets)
    notice.author = author
    notice.institution_id = author.institution_id
    notice.status = Notice.Status.SCHEDULED
    notice.publish_at = publish_at
    _check_times(notice, goes_out=publish_at)
    notice.save()
    _set_targets(notice, targets)
    audit.record(actor=author, action="notice.scheduled", target=notice,
                 changes={"publish_at": publish_at.isoformat()})
    return notice


def reschedule(*, author, notice: Notice, publish_at) -> Notice:
    """Schedule a draft, or move a scheduled notice to a new time."""
    if notice.author_id != author.pk:
        raise PermissionDenied("Only the author can schedule this notice.")
    if notice.status not in (Notice.Status.DRAFT, Notice.Status.SCHEDULED):
        raise ValidationError("Only drafts and scheduled notices can be scheduled.")
    return schedule_notice(author=author, notice=notice, targets=targets_of(notice),
                           publish_at=publish_at)


def unschedule(*, author, notice: Notice) -> Notice:
    if notice.author_id != author.pk:
        raise PermissionDenied("Only the author can change this notice.")
    if notice.status != Notice.Status.SCHEDULED:
        raise ValidationError("This notice isn't scheduled.")
    notice.status = Notice.Status.DRAFT
    notice.publish_at = None
    notice.save(update_fields=["status", "publish_at", "updated_at"])
    audit.record(actor=author, action="notice.unscheduled", target=notice)
    return notice


def publish_due(now=None) -> int:
    """Publish every scheduled notice whose time has come. Run by the scheduler, and also on
    page loads so schedules work without a worker. Safe to run concurrently."""
    from apps.notifications.tasks import after_commit

    now = now or timezone.now()
    published = 0
    due = Notice.objects.filter(status=Notice.Status.SCHEDULED, publish_at__lte=now)
    for notice_id in due.values_list("pk", flat=True)[:100]:
        with transaction.atomic():
            notice = (
                Notice.objects.select_for_update()
                .filter(pk=notice_id, status=Notice.Status.SCHEDULED)
                .first()
            )
            if notice is None:  # someone else got there first
                continue
            notice.status = Notice.Status.PUBLISHED
            notice.published_at = notice.publish_at
            notice.save(update_fields=["status", "published_at", "updated_at"])
            audit.record(actor=notice.author, action="notice.published", target=notice,
                         changes={"scheduled": True})
            after_commit("notice", notice.pk)
            published += 1
    return published


def publish_draft(*, author, notice: Notice) -> Notice:
    if notice.author_id != author.pk:
        raise PermissionDenied("Only the author can publish a draft.")
    if notice.status not in (Notice.Status.DRAFT, Notice.Status.SCHEDULED):
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


# Editing and files ----------------------------------------------------------------------------

MAX_FILES = 5


@transaction.atomic
def update_notice(*, author, notice: Notice, title: str, body: str, priority: str,
                  expires_at=None, targets: list[tuple[str, int]] | None = None) -> Notice:
    """The author changes their notice. Once it has gone out, who it went to stays the same (the
    people already told keep seeing it); the words, importance and take-down time can change."""
    if notice.author_id != author.pk:
        raise PermissionDenied("Only the author can edit this notice.")
    if notice.status == Notice.Status.ARCHIVED:
        raise ValidationError("This notice is archived.")
    before = {"title": notice.title, "body": notice.body, "priority": notice.priority,
              "expires_at": notice.expires_at}
    notice.title, notice.body, notice.priority = title, body, priority
    notice.expires_at = expires_at
    _validate(notice)
    goes_out = notice.published_at or notice.publish_at or timezone.now()
    if notice.expires_at is not None and notice.expires_at <= goes_out:
        raise ValidationError("The take-down time has to be after it goes out.")
    if notice.status == Notice.Status.PUBLISHED:
        notice.edited_at = timezone.now()
    elif targets is not None:
        _check_targets(author, targets)
        _set_targets(notice, targets)
    notice.save()
    changed = {k: [str(v), str(getattr(notice, k))] for k, v in before.items()
               if v != getattr(notice, k)}
    if changed:
        audit.record(actor=author, action="notice.edited", target=notice,
                     changes={k: "changed" for k in changed})  # the words stay in the history
    return notice


def add_attachment(*, author, notice: Notice, upload):
    from apps.core.files import store_upload

    if notice.author_id != author.pk:
        raise PermissionDenied("Only the author can add files.")
    if notice.attachments.count() >= MAX_FILES:
        raise ValidationError(f"A notice can have up to {MAX_FILES} files.")
    stored = store_upload(author, upload)
    notice.attachments.add(stored)
    return stored


def remove_attachment(*, author, notice: Notice, file_id: int) -> None:
    if notice.author_id != author.pk:
        raise PermissionDenied("Only the author can remove files.")
    notice.attachments.remove(file_id)


def downloadable_file(user, file_id: int):
    """A notice's file, for anyone who can read that notice (and its author)."""
    from apps.core.models import StoredFile

    stored = StoredFile.objects.filter(pk=file_id, institution_id=user.institution_id).first()
    if stored is None:
        return None
    through = Notice.attachments.through.objects.filter(storedfile_id=file_id)
    notice_ids = list(through.values_list("notice_id", flat=True))
    if not notice_ids:
        return None
    if Notice.objects.filter(pk__in=notice_ids, author=user).exists():
        return stored
    if Notice.objects.live().visible_to(user).filter(pk__in=notice_ids).exists():
        return stored
    return None
