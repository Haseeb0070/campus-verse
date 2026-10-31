from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Prefetch, Q

from apps.core.audience import context_keys
from apps.core.models import AudienceScope
from apps.enrollment.models import TeacherAssignment

from .models import ClassMeeting, ScheduleChange


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
    status: str = "scheduled"  # scheduled | cancelled | moved | room_changed | rescheduled
    note: str = ""
    moved_to: datetime | None = None  # on a "moved" occurrence: where it went
    moved_from: date | None = None  # on a "rescheduled" occurrence: its original day


def member_section_ids(user) -> set[int]:
    return {pk for scope, pk in context_keys(user) if scope == AudienceScope.SECTION}


def institution_today(user) -> date:
    return datetime.now(ZoneInfo(user.institution.timezone)).date()


def occurrences(user, start: date, days: int) -> list[Occurrence]:
    """Class occurrences for the user's sections from `start` for `days` days, with one-off
    changes applied. Moved classes appear twice: marked moved on the original day and as
    rescheduled on the new day."""
    if user.institution_id is None or days < 1:
        return []
    tz = ZoneInfo(user.institution.timezone)
    end = start + timedelta(days=days - 1)

    meetings = list(
        ClassMeeting.objects.filter(section_id__in=member_section_ids(user))
        .select_related("section__offering__course", "section__offering__term", "room")
        .prefetch_related(
            Prefetch(
                "section__teacher_assignments",
                queryset=TeacherAssignment.objects.select_related("teacher"),
            )
        )
    )
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
            teachers=[str(a.teacher) for a in section.teacher_assignments.all()],
            status=status,
            note=note,
        )

    result = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        for meeting in meetings:
            term = meeting.section.offering.term
            if meeting.weekday != day.weekday() or not term.starts_on <= day <= term.ends_on:
                continue
            occ = build(meeting, day, meeting.starts_at, meeting.ends_at, meeting.room)
            change = change_on.get((meeting.pk, day))
            if change is not None:
                occ.status = change.status
                occ.note = change.note
                if change.status == ScheduleChange.Status.ROOM_CHANGED and change.new_room:
                    occ.room = change.new_room.code
                if change.status == ScheduleChange.Status.MOVED and change.new_date:
                    occ.moved_to = datetime.combine(
                        change.new_date, change.new_starts_at or meeting.starts_at, tzinfo=tz
                    )
            result.append(occ)

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
        result.append(occ)

    result.sort(key=lambda o: (o.starts_at, o.course_code))
    return result


def next_occurrence(user, now: datetime | None = None, horizon_days: int = 21):
    """The next class that hasn't ended and isn't cancelled or moved away. The horizon covers
    a weekly class whose next meeting is cancelled."""
    if user.institution_id is None:
        return None
    tz = ZoneInfo(user.institution.timezone)
    now = now or datetime.now(tz)
    for occ in occurrences(user, now.astimezone(tz).date(), horizon_days):
        if occ.ends_at > now and occ.status not in ("cancelled", "moved"):
            return occ
    return None
