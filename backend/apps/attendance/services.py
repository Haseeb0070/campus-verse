"""Attendance (SRS 5.12), only where the institution has switched it on.

Teachers take attendance for their own sections. Within a correction window they can change
it freely; after that only the department's coordinators and institution admins can, and every
change after the first save is audit-logged with before and after. Students see their own
summary when the institution allows it.
"""

from collections import Counter
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from apps.academic.models import Section
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.governance import audit
from apps.identity.roles import coordinated_department_ids, is_institution_admin
from apps.scheduling.models import ClassMeeting

from .models import AttendanceRecord, AttendanceSession

CORRECTION_WINDOW = timedelta(hours=48)
Status = AttendanceRecord.Status


def require_enabled(institution) -> None:
    if not institution.attendance_enabled:
        raise PermissionDenied("Attendance isn't switched on for your institution.")


def is_teacher(user, section: Section) -> bool:
    return TeacherAssignment.objects.filter(teacher=user, section=section).exists()


def can_correct(user, section: Section) -> bool:
    """Coordinators of the section's department and institution admins."""
    if section.institution_id != user.institution_id:
        return False
    return is_institution_admin(user) or (
        section.offering.course.department_id in coordinated_department_ids(user)
    )


def is_rep(user, section: Section) -> bool:
    """The class's CR or GR, who may take attendance too (apps.classreps decides the rest)."""
    from apps.classreps.services import rep_role

    return rep_role(user, section) is not None


def can_take(user, section: Section) -> bool:
    return is_teacher(user, section) or can_correct(user, section) or is_rep(user, section)


def _campus_today(institution) -> date:
    return timezone.now().astimezone(ZoneInfo(institution.timezone)).date()


def _closed(session_date: date, institution) -> bool:
    """Past the window for teachers: 48 hours after the end of the class's day, on the campus
    clock (not the server's)."""
    end_of_day = datetime.combine(session_date, time.max, tzinfo=ZoneInfo(institution.timezone))
    return timezone.now() > end_of_day + CORRECTION_WINDOW


def roster(section: Section) -> list:
    """The section's students in college roll order, the way the class list and registers are."""
    return sorted((e.student for e in SectionEnrollment.objects.filter(
        section=section, status=SectionEnrollment.Status.ACTIVE
    ).select_related("student")), key=_roll_order)


def _roll_order(student):
    """College roll order (numbers as numbers), then anyone without one by name."""
    roll = student.college_roll
    return (0, int(roll), "") if roll.isdigit() else (1, 0, student.get_full_name().lower())


class AlreadyTaken(ValidationError):
    """Attendance for this class (or this day) is already in; changing it has to be asked for."""


def find_session(section: Section, day: date, meeting_id: int | None):
    return AttendanceSession.objects.filter(section=section, date=day,
                                            meeting_id=meeting_id).first()


def same_day_session(section: Section, day: date, meeting_id: int | None):
    """Another register for this subject on this day that stops a new one being started.

    A subject with two timetabled classes in a day takes each separately; an extra class
    (not on the timetable) can't be added on a day that already has a register, and a day
    with an extra-class register can't get another.
    """
    others = AttendanceSession.objects.filter(section=section, date=day).exclude(
        meeting_id=meeting_id) if meeting_id is not None else AttendanceSession.objects.filter(
        section=section, date=day, meeting__isnull=False)
    if meeting_id is not None:
        others = others.filter(meeting__isnull=True)
    return others.select_related("meeting", "taken_by").first()


def sheet(user, section: Section, day: date, meeting_id: int | None) -> dict:
    """Everything a teacher needs to take attendance for one class."""
    require_enabled(user.institution)
    if not can_take(user, section):
        raise PermissionDenied("Only this section's teachers can take its attendance.")
    session = find_session(section, day, meeting_id)
    other = None if session else same_day_session(section, day, meeting_id)
    saved = {}
    if session:
        saved = {r.student_id: r for r in session.records.all()}
    students = roster(section)
    locked = _closed(day, user.institution) and not can_correct(user, section)
    return {
        "session": session, "students": students, "saved": saved, "locked": locked,
        "can_correct": can_correct(user, section), "other": other,
    }


@transaction.atomic
def save(user, section: Section, day: date, meeting_id: int | None,
         marks: dict[int, tuple[str, str]], change: bool = False) -> AttendanceSession:
    """marks: student id -> (status, note). Students not marked keep what they had.

    Attendance is taken once per class. Saving over a register that's already in only
    happens when the caller says it's a change (`change=True`), so a second take (a CR
    and the teacher both doing it, or an old screen) never quietly overwrites the first.
    """
    require_enabled(user.institution)
    if not can_take(user, section):
        raise PermissionDenied("Only this section's teachers can take its attendance.")
    if day > _campus_today(user.institution):
        raise ValidationError("You can't take attendance for a future class.")
    if _closed(day, user.institution) and not can_correct(user, section):
        raise PermissionDenied("It's been more than 48 hours. Ask a coordinator to correct it.")
    if meeting_id is not None and not ClassMeeting.objects.filter(
        pk=meeting_id, section=section
    ).exists():
        raise ValidationError("That class isn't in this section's timetable.")
    enrolled = {s.pk for s in roster(section)}
    for student_id, (status, note) in marks.items():
        if student_id not in enrolled:
            raise ValidationError("Someone in the list isn't enrolled in this section.")
        if status not in Status.values:
            raise ValidationError("Each student is present, late, absent or excused.")
        if len(note or "") > 200:
            raise ValidationError("Notes can be up to 200 characters.")

    session = AttendanceSession.objects.select_for_update().filter(
        section=section, date=day, meeting_id=meeting_id).first()
    first_time = session is None
    if not first_time and not change:
        raise AlreadyTaken(f"Attendance for this class was already taken by {session.taken_by}. "
                           "Use Change to edit it.")
    if first_time and same_day_session(section, day, meeting_id):
        raise AlreadyTaken("Attendance for this subject is already taken today. "
                           "Open that class and use Change to edit it.")
    if first_time:
        session = AttendanceSession.objects.create(
            institution_id=section.institution_id, section=section, date=day,
            meeting_id=meeting_id, taken_by=user,
        )
    existing = {r.student_id: r for r in session.records.select_for_update()}
    changes = {}
    for student_id, (status, note) in marks.items():
        note = (note or "").strip()
        record = existing.get(student_id)
        if record is None:
            AttendanceRecord.objects.create(institution_id=section.institution_id,
                                            session=session, student_id=student_id,
                                            status=status, note=note)
            if not first_time:
                changes[student_id] = [None, status]
        elif (record.status, record.note) != (status, note):
            changes[student_id] = [record.status, status]
            record.status, record.note = status, note
            record.save()  # history keeps the previous mark
    if first_time:
        counts = Counter(status for status, _ in marks.values())
        audit.record(actor=user, action="attendance.taken", target=session, changes=dict(counts))
    elif changes:
        audit.record(actor=user, action="attendance.corrected", target=session,
                     changes={str(k): v for k, v in changes.items()})
    if not (is_teacher(user, section) or can_correct(user, section)):
        # A CR or GR took it: the teacher is told, and may need to approve it first.
        from apps.classreps.services import rep_took_attendance

        rep_took_attendance(user, section, session)
    return session


def _summary(records) -> dict:
    counts = Counter(r.status for r in records)
    total = sum(counts.values())
    attended = counts[Status.PRESENT] + counts[Status.LATE]
    counted = total - counts[Status.EXCUSED]  # excused absences don't count against you
    return {
        "sessions": total,
        "present": counts[Status.PRESENT], "late": counts[Status.LATE],
        "absent": counts[Status.ABSENT], "excused": counts[Status.EXCUSED],
        "rate": round(100 * attended / counted) if counted else None,
    }


def section_report(user, section: Section) -> dict:
    require_enabled(user.institution)
    if not can_take(user, section):
        raise PermissionDenied("Only this section's teachers can see its attendance.")
    records = list(AttendanceRecord.objects.filter(session__section=section,
                                                   session__confirmed=True)
                   .select_related("session"))
    by_student: dict[int, list] = {}
    for r in records:
        by_student.setdefault(r.student_id, []).append(r)
    sessions = list(AttendanceSession.objects.filter(section=section, confirmed=True)
                    .select_related("taken_by", "meeting")[:60])
    return {
        "students": [(s, _summary(by_student.get(s.pk, []))) for s in roster(section)],
        "sessions": sessions,
    }


def my_summary(user) -> list[tuple[Section, dict]]:
    """A student's own attendance per section, when the institution allows them to see it."""
    institution = user.institution
    if institution is None or not institution.attendance_enabled:
        return []
    if not institution.attendance_visible_to_students:
        raise PermissionDenied("Your institution doesn't show attendance to students.")
    records = AttendanceRecord.objects.filter(student=user, session__confirmed=True).select_related(
        "session__section__offering__course")
    by_section: dict[int, list] = {}
    sections = {}
    for r in records:
        by_section.setdefault(r.session.section_id, []).append(r)
        sections[r.session.section_id] = r.session.section
    return [(sections[sid], _summary(recs)) for sid, recs in by_section.items()]
