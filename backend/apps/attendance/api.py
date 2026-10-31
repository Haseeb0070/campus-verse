from datetime import date, datetime
from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from ninja import Router, Schema, Status
from ninja.errors import HttpError

from apps.academic.models import Institution, Section
from apps.chat.serializers import initials
from apps.identity.roles import is_institution_admin

from . import progress, services

router = Router(tags=["attendance"])
progress_router = Router(tags=["progress"])


class ErrorOut(Schema):
    detail: str


class SummaryOut(Schema):
    sessions: int
    present: int
    late: int
    absent: int
    excused: int
    rate: int | None


class MarkOut(Schema):
    student_id: int
    name: str
    initials: str
    status: str | None
    note: str


class SheetOut(Schema):
    section_id: int
    title: str
    date: date
    meeting_id: int | None
    saved: bool
    taken_by: str | None
    saved_at: datetime | None
    locked: bool
    can_correct: bool
    marks: list[MarkOut]


class MarkIn(Schema):
    student_id: int
    status: str
    note: str = ""


class SaveIn(Schema):
    date: date
    meeting_id: int | None = None
    marks: list[MarkIn]


class StudentRowOut(Schema):
    student_id: int
    name: str
    initials: str
    summary: SummaryOut


class SessionOut(Schema):
    id: int
    date: date
    meeting_id: int | None
    time: str | None
    taken_by: str


class ReportOut(Schema):
    students: list[StudentRowOut]
    sessions: list[SessionOut]


class SettingsIn(Schema):
    attendance_enabled: bool
    attendance_visible_to_students: bool


class SettingsOut(SettingsIn):
    pass


class GradeLineOut(Schema):
    id: int
    title: str
    max_points: int
    points: Decimal | None


class CourseProgressOut(Schema):
    section_id: int
    section_code: str
    course_code: str
    course_title: str
    color: str
    term: str
    assignments: list[GradeLineOut]
    points: Decimal | None
    max_points: int | None
    grades_source: str
    attendance: SummaryOut | None
    attendance_source: str | None


def _section(request, section_id: int) -> Section:
    section = Section.objects.filter(
        pk=section_id, institution_id=request.user.institution_id
    ).select_related("offering__course", "offering__term").first()
    if section is None:
        raise HttpError(404, "Section not found")
    return section


def _call(fn):
    try:
        return fn()
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})


def _sheet_out(request, section, day, meeting_id) -> dict:
    data = services.sheet(request.user, section, day, meeting_id)
    session = data["session"]
    return {
        "section_id": section.pk,
        "title": f"{section.offering.course.code} · {section.code}",
        "date": day, "meeting_id": meeting_id, "saved": session is not None,
        "taken_by": str(session.taken_by) if session else None,
        "saved_at": session.updated_at if session else None,
        "locked": data["locked"], "can_correct": data["can_correct"],
        "marks": [
            {"student_id": s.pk, "name": s.get_full_name() or s.email, "initials": initials(s),
             "status": data["saved"][s.pk].status if s.pk in data["saved"] else None,
             "note": data["saved"][s.pk].note if s.pk in data["saved"] else ""}
            for s in data["students"]
        ],
    }


@router.get("/sections/{section_id}/sheet", response={200: SheetOut, 403: ErrorOut})
def get_sheet(request, section_id: int, day: date, meeting_id: int | None = None):
    section = _section(request, section_id)
    return _call(lambda: Status(200, _sheet_out(request, section, day, meeting_id)))


@router.put("/sections/{section_id}/sheet", response={200: SheetOut, 403: ErrorOut, 422: ErrorOut})
def save_sheet(request, section_id: int, payload: SaveIn):
    section = _section(request, section_id)

    def go():
        services.save(request.user, section, payload.date, payload.meeting_id,
                      {m.student_id: (m.status, m.note) for m in payload.marks})
        return Status(200, _sheet_out(request, section, payload.date, payload.meeting_id))
    return _call(go)


@router.get("/sections/{section_id}/report", response={200: ReportOut, 403: ErrorOut})
def report(request, section_id: int):
    section = _section(request, section_id)

    def go():
        data = services.section_report(request.user, section)
        return Status(200, {
            "students": [{"student_id": s.pk, "name": s.get_full_name() or s.email,
                          "initials": initials(s), "summary": summary}
                         for s, summary in data["students"]],
            "sessions": [{"id": x.pk, "date": x.date, "meeting_id": x.meeting_id,
                          "time": f"{x.meeting.starts_at:%H:%M}" if x.meeting else None,
                          "taken_by": str(x.taken_by)} for x in data["sessions"]],
        })
    return _call(go)


@router.put("/settings", response={200: SettingsOut, 403: ErrorOut})
def settings(request, payload: SettingsIn):
    """Institution admins switch attendance on (SRS 5.12: only where approved)."""
    from apps.governance import audit

    if not is_institution_admin(request.user):
        return Status(403, {"detail": "Only institution admins can change this."})
    inst = Institution.objects.get(pk=request.user.institution_id)
    inst.attendance_enabled = payload.attendance_enabled
    inst.attendance_visible_to_students = payload.attendance_enabled and \
        payload.attendance_visible_to_students
    inst.save(update_fields=["attendance_enabled", "attendance_visible_to_students", "updated_at"])
    audit.record(actor=request.user, action="attendance.settings", target=inst,
                 changes=payload.dict())
    return Status(200, {"attendance_enabled": inst.attendance_enabled,
                        "attendance_visible_to_students": inst.attendance_visible_to_students})


@progress_router.get("", response=list[CourseProgressOut])
def my_progress(request):
    return progress.my_progress(request.user)
