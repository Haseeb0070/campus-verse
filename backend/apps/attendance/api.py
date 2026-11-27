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
    college_roll: str
    university_roll: str
    initials: str
    status: str | None
    note: str


class OtherOut(Schema):
    meeting_id: int | None
    time: str | None
    taken_by: str


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
    taken_elsewhere: OtherOut | None
    marks: list[MarkOut]


class MarkIn(Schema):
    student_id: int
    status: str
    note: str = ""


class SaveIn(Schema):
    date: date
    meeting_id: int | None = None
    change: bool = False  # editing a register that's already taken
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
    except services.AlreadyTaken as err:
        return Status(409, {"detail": err.messages[0]})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})


def _sheet_out(request, section, day, meeting_id) -> dict:
    data = services.sheet(request.user, section, day, meeting_id)
    session, other = data["session"], data["other"]
    return {
        "section_id": section.pk,
        "title": f"{section.offering.course.code} · {section.code}",
        "date": day, "meeting_id": meeting_id, "saved": session is not None,
        "taken_by": str(session.taken_by) if session else None,
        "saved_at": session.updated_at if session else None,
        "locked": data["locked"], "can_correct": data["can_correct"],
        "taken_elsewhere": {
            "meeting_id": other.meeting_id,
            "time": f"{other.meeting.starts_at:%H:%M}" if other.meeting else None,
            "taken_by": str(other.taken_by),
        } if other else None,
        "marks": [
            {"student_id": s.pk, "name": s.get_full_name() or s.email, "initials": initials(s),
             "college_roll": s.college_roll, "university_roll": s.external_id,
             "status": data["saved"][s.pk].status if s.pk in data["saved"] else None,
             "note": data["saved"][s.pk].note if s.pk in data["saved"] else ""}
            for s in data["students"]
        ],
    }


@router.get("/sections/{section_id}/sheet", response={200: SheetOut, 403: ErrorOut})
def get_sheet(request, section_id: int, day: date, meeting_id: int | None = None):
    section = _section(request, section_id)
    return _call(lambda: Status(200, _sheet_out(request, section, day, meeting_id)))


@router.put("/sections/{section_id}/sheet",
            response={200: SheetOut, 403: ErrorOut, 409: ErrorOut, 422: ErrorOut})
def save_sheet(request, section_id: int, payload: SaveIn):
    section = _section(request, section_id)

    def go():
        services.save(request.user, section, payload.date, payload.meeting_id,
                      {m.student_id: (m.status, m.note) for m in payload.marks},
                      change=payload.change)
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


@router.get("/sections/{section_id}/report.csv", response={200: None, 403: ErrorOut})
def report_csv(request, section_id: int):
    from apps.core.exports import csv_response

    section = _section(request, section_id)
    try:
        data = services.section_report(request.user, section)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(403, {"detail": err.messages[0]})
    rows = [
        (s.external_id, s.get_full_name() or s.email, m["sessions"], m["present"], m["late"],
         m["absent"], m["excused"], "" if m["rate"] is None else f"{m['rate']}%")
        for s, m in data["students"]
    ]
    name = f"{section.offering.course.code} {section.code} attendance.csv"
    return csv_response(name, ["College ID", "Name", "Classes", "Present", "Late", "Absent",
                               "Excused", "Attendance"], rows)


def _workbook_section(request, section_id: int) -> Section:
    section = Section.objects.filter(
        pk=section_id, institution_id=request.user.institution_id
    ).select_related("offering__course", "offering__term", "cohort__program", "institution").first()
    if section is None:
        raise HttpError(404, "Section not found")
    try:
        services.require_enabled(request.user.institution)
    except PermissionDenied as err:
        raise HttpError(403, str(err)) from None
    return section


@router.get("/sections/{section_id}/day.xlsx", response={200: None, 403: ErrorOut, 404: ErrorOut})
def subject_day_xlsx(request, section_id: int, day: date):
    """One subject's attendance for a day, as an Excel file: its teachers, the class's CR/GR,
    coordinators and admins."""
    from .workbook import subject_day, xlsx_response

    section = _workbook_section(request, section_id)
    if not services.can_take(request.user, section):
        raise HttpError(403, "Only this subject's teachers, the class's CR/GR and admins can.")
    name = f"{section.offering.course.code} {section.code} attendance {day:%Y-%m-%d}.xlsx"
    return xlsx_response(subject_day(section, day), name)


@router.get("/sections/{section_id}/class-day.xlsx",
            response={200: None, 403: ErrorOut, 404: ErrorOut})
def class_day_xlsx(request, section_id: int, day: date):
    """The whole class's attendance for a day, every subject, as an Excel file: the class's
    CR/GR, coordinators and admins."""
    from .workbook import class_day, xlsx_response

    section = _workbook_section(request, section_id)
    if not (services.is_rep(request.user, section) or services.can_correct(request.user, section)):
        raise HttpError(403, "Only the class's CR/GR, coordinators and admins can download the "
                             "whole day.")
    name = f"{section.code} attendance {day:%Y-%m-%d}.xlsx"
    return xlsx_response(class_day(section, day), name)
