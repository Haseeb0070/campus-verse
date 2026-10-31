import logging
from collections.abc import Iterable
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from apps.core import realtime

from .models import Notification

logger = logging.getLogger(__name__)
Kind = Notification.Kind


def notify(
    recipients: Iterable[int],
    *,
    kind: str,
    institution_id: int,
    title: str,
    dedupe_key: str,
    body: str = "",
    link: str = "",
    actor_id: int | None = None,
    group: str | None = None,
) -> int:
    """Record one notification per recipient (never for the actor), then deliver it the ways
    each person chose: live in the app, by email, or both. Safe to run again for the same event:
    the (recipient, dedupe_key) constraint means no duplicates and no second email."""
    from .preferences import channels, group_for

    wanted = set(recipients) - {actor_id}
    if not wanted:
        return 0
    already = set(
        Notification.objects.filter(recipient_id__in=wanted, dedupe_key=dedupe_key).values_list(
            "recipient_id", flat=True
        )
    )
    new_ids = wanted - already
    if not new_ids:
        return 0
    how = channels(new_ids, group or group_for(kind))
    Notification.objects.bulk_create(
        [
            Notification(
                institution_id=institution_id,
                recipient_id=uid,
                kind=kind,
                title=title[:200],
                body=body[:300],
                link=link,
                actor_id=actor_id,
                dedupe_key=dedupe_key,
                in_app=how[uid][0],
                email_wanted=how[uid][1],
            )
            for uid in sorted(new_ids)
        ],
        ignore_conflicts=True,  # a concurrent retry may have won the race; that's fine
    )
    new = sorted(uid for uid in new_ids if how[uid][0])
    if any(email for _, email in how.values()):
        from .tasks import after_commit_email

        after_commit_email(dedupe_key, sorted(uid for uid in new_ids if how[uid][1]))
    if new:
        payload = {
            "type": "notification.created",
            "kind": kind,
            "title": title,
            "body": body,
            "link": link,
        }

        def push():
            try:
                realtime.broadcast([realtime.user_channel(uid) for uid in new], payload)
            except Exception:  # noqa: BLE001 - stored already; clients catch up on next load
                logger.warning("Live delivery of %s failed", dedupe_key, exc_info=True)

        transaction.on_commit(push)
    return len(new_ids)


def _local(dt, institution) -> str:
    return f"{dt.astimezone(ZoneInfo(institution.timezone)):%a %d %b, %H:%M}"


# Event handlers ------------------------------------------------------------------------------


def notice_published(notice_id: int) -> int:
    from apps.core.audience import audience_user_ids
    from apps.notices.models import Notice
    from apps.notices.services import targets_of

    notice = Notice.objects.filter(pk=notice_id, status=Notice.Status.PUBLISHED).first()
    if notice is None:
        return 0
    body = notice.body.replace("\n", " ")
    return notify(
        audience_user_ids(targets_of(notice), notice.institution_id),
        kind=Kind.NOTICE,
        institution_id=notice.institution_id,
        title=("Important: " if notice.priority == "important" else "") + notice.title,
        body=body if len(body) <= 140 else body[:139] + "…",
        link=f"/notices#notice-{notice.pk}",
        actor_id=notice.author_id,
        dedupe_key=f"notice:{notice.pk}",
        group="important" if notice.priority == "important" else "notices",
    )


def _section_people(section_id: int) -> set[int]:
    from apps.academic.models import Section
    from apps.core.audience import audience_user_ids

    inst = Section.objects.values_list("institution_id", flat=True).get(pk=section_id)
    return audience_user_ids([("section", section_id)], inst)


def class_changed(change_id: int) -> int:
    from apps.scheduling.models import ScheduleChange
    from apps.scheduling.services import change_text

    change = (
        ScheduleChange.objects.select_related(
            "meeting__section__offering__course", "new_room"
        )
        .filter(pk=change_id)
        .first()
    )
    if change is None:
        return 0
    title, _ = change_text(change.meeting, change)
    return notify(
        _section_people(change.meeting.section_id),
        kind=Kind.CLASS_CHANGED,
        institution_id=change.institution_id,
        title=title,
        body=change.note,
        link="/timetable",
        actor_id=change.created_by_id,
        # A later edit to the same occurrence is news again.
        dedupe_key=f"change:{change.pk}:{change.updated_at:%Y%m%d%H%M%S%f}",
    )


def _students(section_id: int) -> set[int]:
    from apps.enrollment.models import SectionEnrollment

    return set(
        SectionEnrollment.objects.filter(
            section_id=section_id, status=SectionEnrollment.Status.ACTIVE
        ).values_list("student_id", flat=True)
    )


def assignment_opened(assignment_id: int) -> int:
    from apps.assignments.models import Assignment

    a = (
        Assignment.objects.select_related("section__offering__course", "institution")
        .filter(pk=assignment_id, status=Assignment.Status.PUBLISHED)
        .first()
    )
    if a is None or a.available_from > timezone.now():
        return 0
    return notify(
        _students(a.section_id),
        kind=Kind.ASSIGNMENT_OPENED,
        institution_id=a.institution_id,
        title=f"New assignment: {a.title}",
        body=f"{a.section.offering.course.code} · due {_local(a.due_at, a.institution)}",
        link=f"/assignments/{a.pk}",
        actor_id=a.created_by_id,
        dedupe_key=f"assignment:{a.pk}:opened",
    )


def grades_released(assignment_id: int) -> int:
    from apps.assignments.models import Assignment

    a = Assignment.objects.filter(pk=assignment_id, grades_released_at__isnull=False).first()
    if a is None:
        return 0
    return notify(
        _students(a.section_id),
        kind=Kind.GRADES_RELEASED,
        institution_id=a.institution_id,
        title=f"Grades are out for {a.title}",
        link=f"/assignments/{a.pk}",
        dedupe_key=f"assignment:{a.pk}:grades",
    )


def resource_shared(resource_id: int) -> int:
    """A new resource, or a new version of one. Each version notifies once."""
    from apps.core.audience import audience_user_ids
    from apps.resources.models import Resource
    from apps.resources.services import targets_of

    r = (
        Resource.objects.select_related("offering__course")
        .filter(pk=resource_id, status=Resource.Status.ACTIVE)
        .first()
    )
    if r is None:
        return 0
    latest = r.versions.select_related("uploaded_by").first()
    number = latest.number if latest else 1
    updated = number > 1
    return notify(
        audience_user_ids(targets_of(r), r.institution_id),
        kind=Kind.RESOURCE,
        institution_id=r.institution_id,
        title=f"{'Updated' if updated else 'New'} in {r.offering.course.code}: {r.title}",
        body=(latest.note if updated and latest.note else r.get_kind_display()),
        link=f"/resources/{r.pk}",
        actor_id=latest.uploaded_by_id if latest else r.created_by_id,
        dedupe_key=f"resource:{r.pk}:v{number}",
    )


def send_scheduled(now=None) -> dict[str, int]:
    """Run every few minutes (Celery beat or the send_reminders command): announces work that
    has just opened, and reminds students who haven't submitted 24 hours before a deadline."""
    from apps.assignments.models import Assignment, Submission

    now = now or timezone.now()
    published = Assignment.objects.filter(status=Assignment.Status.PUBLISHED)
    opened = 0
    for a in published.filter(available_from__lte=now, due_at__gt=now):
        opened += assignment_opened(a.pk)

    reminded = 0
    due_soon = published.filter(
        available_from__lte=now, due_at__gt=now, due_at__lte=now + timedelta(hours=24)
    ).select_related("institution")
    for a in due_soon:
        submitted = set(
            Submission.objects.filter(assignment=a).values_list("student_id", flat=True)
        )
        reminded += notify(
            _students(a.section_id) - submitted,
            kind=Kind.ASSIGNMENT_DUE_SOON,
            institution_id=a.institution_id,
            title=f"{a.title} is due soon",
            body=f"Due {_local(a.due_at, a.institution)}. You haven't submitted yet.",
            link=f"/assignments/{a.pk}",
            dedupe_key=f"assignment:{a.pk}:due24",
        )
    return {"opened": opened, "reminded": reminded}


def mark_read(user, ids: list[int] | None = None) -> int:
    qs = Notification.objects.filter(recipient=user, read_at__isnull=True)
    if ids is not None:
        qs = qs.filter(pk__in=ids)
    return qs.update(read_at=timezone.now())
