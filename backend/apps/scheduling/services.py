from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Prefetch, Q

from apps.core.audience import can_target, context_keys
from apps.core.models import AudienceScope
from apps.enrollment.models import TeacherAssignment
from apps.governance import audit

from .models import ClassMeeting, Room, ScheduleChange


@dataclass
class Occurrence:
    meeting_id: int
    section_id: int
    section_code: str
    course_code: str
    course_title: str
    color: str
    kind: str
    date: date
    starts_at: datetime
    ends_at: datetime
    room: str
    mode: str
    online_url: str
    teachers: list[str] = field(default_factory=list)
    teacher_ids: list[int] = field(default_factory=list)
    status: str = "scheduled"  # scheduled | cancelled | moved | room_changed | rescheduled
    note: str = ""
    moved_to: datetime | None = None  # on a "moved" occurrence: where it went
    moved_from: date | None = None  # on a "rescheduled" occurrence: its original day
    change_id: int | None = None
    can_manage: bool = False

    @property
    def is_happening(self) -> bool:
        return self.status not in ("cancelled", "moved")


class ScheduleConflict(ValidationError):
    """The requested slot clashes with another class (room or teacher double-booked)."""


def member_section_ids(user) -> set[int]:
    return {pk for scope, pk in context_keys(user) if scope == AudienceScope.SECTION}


def institution_today(user) -> date:
    return datetime.now(ZoneInfo(user.institution.timezone)).date()


def _meetings(qs):
    return list(
        qs.select_related("section__offering__course", "section__offering__term", "room")
        .prefetch_related(
            Prefetch(
                "section__teacher_assignments",
                queryset=TeacherAssignment.objects.select_related("teacher"),
            )
        )
    )


def _expand(meetings, start: date, end: date, tz) -> list[Occurrence]:
    """Turn weekly meetings into dated occurrences between start and end, applying one-off
    changes. Moved classes appear twice: marked moved on the original day and as rescheduled
    on the new day."""
    by_id = {m.pk: m for m in meetings}
    changes = list(
        ScheduleChange.objects.filter(meeting_id__in=by_id)
        .filter(Q(date__range=(start, end)) | Q(new_date__range=(start, end)))
        .select_related("new_room")
    )
    change_on = {(c.meeting_id, c.date): c for c in changes}

    def build(meeting, day, starts, ends, room, status="scheduled", note=""):
        section = meeting.section
        course = section.offering.course
        assignments = section.teacher_assignments.all()
        return Occurrence(
            meeting_id=meeting.pk,
            section_id=section.pk,
            section_code=section.code,
            course_code=course.code,
            course_title=course.title,
            color=course.color,
            kind=meeting.kind,
            date=day,
            starts_at=datetime.combine(day, starts, tzinfo=tz),
            ends_at=datetime.combine(day, ends, tzinfo=tz),
            room=room.code if room else "",
            mode=meeting.mode,
            online_url=meeting.online_url,
            teachers=[str(a.teacher) for a in assignments],
            teacher_ids=[a.teacher_id for a in assignments],
            status=status,
            note=note,
        )

    result = []
    day = start
    while day <= end:
        for meeting in meetings:
            term = meeting.section.offering.term
            if meeting.weekday != day.weekday() or not term.starts_on <= day <= term.ends_on:
                continue
            occ = build(meeting, day, meeting.starts_at, meeting.ends_at, meeting.room)
            change = change_on.get((meeting.pk, day))
            if change is not None:
                occ.status = change.status
                occ.note = change.note
                occ.change_id = change.pk
                if change.status == ScheduleChange.Status.ROOM_CHANGED and change.new_room:
                    occ.room = change.new_room.code
                if change.status == ScheduleChange.Status.MOVED and change.new_date:
                    occ.moved_to = datetime.combine(
                        change.new_date, change.new_starts_at or meeting.starts_at, tzinfo=tz
                    )
            result.append(occ)
        day += timedelta(days=1)

    for change in changes:
        if change.status != ScheduleChange.Status.MOVED or change.new_date is None:
            continue
        if not start <= change.new_date <= end:
            continue
        meeting = by_id[change.meeting_id]
        occ = build(
            meeting,
            change.new_date,
            change.new_starts_at or meeting.starts_at,
            change.new_ends_at or meeting.ends_at,
            change.new_room or meeting.room,
            status="rescheduled",
            note=change.note,
        )
        occ.moved_from = change.date
        occ.change_id = change.pk
        result.append(occ)

    result.sort(key=lambda o: (o.starts_at, o.course_code))
    return result


def occurrences(user, start: date, days: int) -> list[Occurrence]:
    """Class occurrences for the user's own sections, flagged with whether they may change them."""
    if user.institution_id is None or days < 1:
        return []
    tz = ZoneInfo(user.institution.timezone)
    sections = member_section_ids(user)
    result = _expand(
        _meetings(ClassMeeting.objects.filter(section_id__in=sections)),
        start,
        start + timedelta(days=days - 1),
        tz,
    )
    manageable = {sid for sid in sections if can_target(user, AudienceScope.SECTION, sid)}
    for occ in result:
        occ.can_manage = occ.section_id in manageable
    return result


def next_occurrence(user, now: datetime | None = None, horizon_days: int = 21):
    """The next class that hasn't ended and isn't cancelled or moved away. The horizon covers
    a weekly class whose next meeting is cancelled."""
    if user.institution_id is None:
        return None
    tz = ZoneInfo(user.institution.timezone)
    now = now or datetime.now(tz)
    for occ in occurrences(user, now.astimezone(tz).date(), horizon_days):
        if occ.ends_at > now and occ.is_happening:
            return occ
    return None


def conflicts(
    meeting: ClassMeeting, day: date, starts: time, ends: time, room: Room | None
) -> list[str]:
    """Other classes that would clash with `meeting` running on `day` from starts to ends:
    same room, or a shared teacher, at an overlapping time (SRS FR-SCH-05)."""
    tz = ZoneInfo(meeting.section.offering.term.institution.timezone)
    candidates = ClassMeeting.objects.filter(institution_id=meeting.institution_id).filter(
        Q(weekday=day.weekday())
        | Q(changes__status=ScheduleChange.Status.MOVED, changes__new_date=day)
    ).distinct()
    window_start = datetime.combine(day, starts, tzinfo=tz)
    window_end = datetime.combine(day, ends, tzinfo=tz)
    teachers = set(
        TeacherAssignment.objects.filter(section_id=meeting.section_id).values_list(
            "teacher_id", flat=True
        )
    )
    found = []
    for occ in _expand(_meetings(candidates), day, day, tz):
        if occ.meeting_id == meeting.pk or not occ.is_happening:
            continue
        if not (occ.starts_at < window_end and window_start < occ.ends_at):
            continue
        slot = f"{occ.course_code} · {occ.section_code} ({occ.starts_at:%H:%M}–{occ.ends_at:%H:%M})"
        if room is not None and occ.room == room.code:
            found.append(f"{room.code} is already booked for {slot}.")
        elif teachers & set(occ.teacher_ids):
            found.append(f"The teacher is already teaching {slot}.")
    return found


def _notice_text(meeting, change) -> tuple[str, str]:
    course = meeting.section.offering.course
    when = f"{change.date:%a %d %b}"
    note = f"\n\n{change.note}" if change.note else ""
    if change.status == ScheduleChange.Status.CANCELLED:
        return (f"{course.title} on {when} is cancelled", f"The {meeting.starts_at:%H:%M} "
                f"{meeting.get_kind_display().lower()} on {change.date:%A %d %B} won't take place."
                f"{note}")
    if change.status == ScheduleChange.Status.ROOM_CHANGED:
        return (f"{course.title} on {when} is in {change.new_room.code}",
                f"Same time ({meeting.starts_at:%H:%M}), new room: {change.new_room.code}.{note}")
    starts = change.new_starts_at or meeting.starts_at
    room = change.new_room or meeting.room
    where = f" in {room.code}" if room else ""
    return (f"{course.title} moved to {change.new_date:%a %d %b}, {starts:%H:%M}",
            f"The {change.date:%A} class moves to {change.new_date:%A %d %B} at "
            f"{starts:%H:%M}{where}.{note}")


@transaction.atomic
def change_class(
    user,
    *,
    meeting: ClassMeeting,
    day: date,
    status: str,
    new_date: date | None = None,
    new_starts_at: time | None = None,
    new_ends_at: time | None = None,
    new_room: Room | None = None,
    note: str = "",
    notify: bool = False,
) -> ScheduleChange:
    """Cancel, move or re-room one occurrence of a class. Replaces any earlier change to the
    same occurrence. Raises ScheduleConflict if the new slot clashes."""
    if not can_target(user, AudienceScope.SECTION, meeting.section_id):
        raise PermissionDenied("You can only change classes you teach.")
    term = meeting.section.offering.term
    if day.weekday() != meeting.weekday or not term.starts_on <= day <= term.ends_on:
        raise ValidationError("This class doesn't meet on that date.")

    Status = ScheduleChange.Status
    if status == Status.CANCELLED:
        new_date = new_starts_at = new_ends_at = new_room = None
    elif status == Status.ROOM_CHANGED:
        if new_room is None:
            raise ValidationError("Choose the new room.")
        if new_room.pk == meeting.room_id:
            raise ValidationError("The class is already in that room.")
        clashes = conflicts(meeting, day, meeting.starts_at, meeting.ends_at, new_room)
        if clashes:
            raise ScheduleConflict(clashes)
        new_date = new_starts_at = new_ends_at = None
    elif status == Status.MOVED:
        if new_date is None:
            raise ValidationError("Choose the new date.")
        if not term.starts_on <= new_date <= term.ends_on:
            raise ValidationError("The new date has to be within the term.")
        starts = new_starts_at or meeting.starts_at
        ends = new_ends_at or meeting.ends_at
        if ends <= starts:
            raise ValidationError("The class has to end after it starts.")
        if new_date == day and starts == meeting.starts_at:
            raise ValidationError("Pick a different date or time.")
        clashes = conflicts(meeting, new_date, starts, ends, new_room or meeting.room)
        if clashes:
            raise ScheduleConflict(clashes)
    else:
        raise ValidationError("Unknown change.")

    change, _ = ScheduleChange.objects.update_or_create(
        meeting=meeting,
        date=day,
        defaults={
            "institution_id": meeting.institution_id,
            "status": status,
            "new_date": new_date,
            "new_starts_at": new_starts_at,
            "new_ends_at": new_ends_at,
            "new_room": new_room,
            "note": note.strip()[:200],
            "created_by": user,
        },
    )
    audit.record(
        actor=user,
        action="schedule.changed",
        target=change,
        changes={"meeting": meeting.pk, "date": day.isoformat(), "status": status},
    )
    if notify:
        from apps.notices.models import Notice
        from apps.notices.services import publish_notice

        title, body = _notice_text(meeting, change)
        publish_notice(
            author=user,
            notice=Notice(title=title, body=body, priority=Notice.Priority.IMPORTANT),
            targets=[(AudienceScope.SECTION.value, meeting.section_id)],
        )
    return change


@transaction.atomic
def undo_change(user, change: ScheduleChange) -> None:
    if not can_target(user, AudienceScope.SECTION, change.meeting.section_id):
        raise PermissionDenied("You can only change classes you teach.")
    audit.record(
        actor=user,
        action="schedule.change_undone",
        target=change,
        changes={"meeting": change.meeting_id, "date": change.date.isoformat()},
    )
    change.delete()
