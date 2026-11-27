"""Attendance as an Excel workbook (.xlsx): a day's register for one subject, or for the whole
class across every subject that day, ready to print or share (WhatsApp, email).

Each lecture gets its own sheet: the college and class, the subject, date and time, who took it,
every student in college roll order with their status, and the totals. The whole-day file starts
with a summary: each student against each lecture of the day.
"""

import io
import re
from collections import Counter
from datetime import date

from django.http import HttpResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from apps.academic.models import Section

from .models import AttendanceRecord, AttendanceSession
from .services import roster

LABEL = {"present": "Present", "late": "Late", "absent": "Absent", "excused": "Excused"}
SHORT = {"present": "P", "late": "L", "absent": "A", "excused": "E"}
FILL = {
    "present": PatternFill("solid", fgColor="DCF2E3"),
    "late": PatternFill("solid", fgColor="FCEFC7"),
    "absent": PatternFill("solid", fgColor="F8D7D3"),
    "excused": PatternFill("solid", fgColor="DCE8F8"),
}
HEAD_FILL = PatternFill("solid", fgColor="192840")
HEAD_FONT = Font(bold=True, color="FFFFFF")
THIN = Side(style="thin", color="C9D2DE")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _when(session) -> str:
    if session.meeting_id and session.meeting:
        return f"{session.meeting.starts_at:%H:%M}–{session.meeting.ends_at:%H:%M}"
    return "Extra class"


def _sheet_title(section: Section, session, used: set[str]) -> str:
    base = f"{section.offering.course.code} {_when(session).replace(':', '.')}"
    title = re.sub(r"[\[\]:*?/\\]", "-", base)[:31]
    while title in used:
        title = title[:28] + f" {len(used)}"
    used.add(title)
    return title


def _write_lecture(ws, section: Section, session, students: list) -> Counter:
    institution = section.institution
    cohort = section.cohort
    records = {r.student_id: r for r in AttendanceRecord.objects.filter(session=session)}
    ws.append([institution.name])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Class: {cohort.label if cohort else section.code} ({section.code})"])
    ws.append([f"Subject: {section.offering.course.title} ({section.offering.course.code})"])
    ws.append([f"Date: {session.date:%A %d %B %Y} · Time: {_when(session)}"])
    taken = f"Taken by: {session.taken_by.get_full_name() or session.taken_by.email}"
    if not session.confirmed:
        taken += " (waiting for the teacher's approval)"
    ws.append([taken])
    ws.append([])
    header = ["Sr", "College roll", "University roll", "Name", "Status", "Note"]
    ws.append(header)
    head_row = ws.max_row
    for col in range(1, len(header) + 1):
        cell = ws.cell(row=head_row, column=col)
        cell.fill, cell.font, cell.border = HEAD_FILL, HEAD_FONT, BOX
        cell.alignment = Alignment(horizontal="center")
    counts: Counter = Counter()
    for i, s in enumerate(students, start=1):
        record = records.get(s.pk)
        status = record.status if record else ""
        counts[status or "not marked"] += 1
        ws.append([i, s.college_roll, s.external_id, s.get_full_name() or s.email,
                   LABEL.get(status, "Not marked"), record.note if record else ""])
        for col in range(1, len(header) + 1):
            ws.cell(row=ws.max_row, column=col).border = BOX
        if status in FILL:
            ws.cell(row=ws.max_row, column=5).fill = FILL[status]
    ws.append([])
    total = len(students)
    ws.append(["", "", "", "Total students", total])
    for key in ("present", "late", "absent", "excused"):
        ws.append(["", "", "", LABEL[key], counts.get(key, 0)])
    if counts.get("not marked"):
        ws.append(["", "", "", "Not marked", counts["not marked"]])
    for row in range(ws.max_row - 5, ws.max_row + 1):
        ws.cell(row=row, column=4).font = Font(bold=True)
    for col, width in zip("ABCDEF", (5, 12, 15, 30, 12, 30), strict=True):
        ws.column_dimensions[col].width = width
    ws.freeze_panes = ws.cell(row=head_row + 1, column=1)
    ws.print_title_rows = f"{head_row}:{head_row}"
    ws.page_setup.fitToWidth = 1
    return counts


def _sessions(sections, day: date):
    return list(
        AttendanceSession.objects.filter(section__in=sections, date=day)
        .select_related("section__offering__course", "section__cohort__program",
                        "section__institution", "meeting", "taken_by")
        .order_by("meeting__starts_at", "section__offering__course__code")
    )


def subject_day(section: Section, day: date) -> Workbook:
    """One subject's register(s) for the day: a sheet per lecture."""
    wb = Workbook()
    wb.remove(wb.active)
    students = roster(section)
    used: set[str] = set()
    sessions = _sessions([section], day)
    for session in sessions:
        _write_lecture(wb.create_sheet(_sheet_title(section, session, used)), section, session,
                       students)
    if not sessions:
        ws = wb.create_sheet("No attendance")
        code = section.offering.course.code
        ws.append([f"No attendance was taken for {code} on {day:%d %B %Y}."])
    return wb


def class_day(section: Section, day: date) -> Workbook:
    """The whole class's day: a summary of every lecture, then a sheet per lecture."""
    wb = Workbook()
    summary = wb.active
    summary.title = "Summary"
    if section.cohort_id:
        sections = list(Section.objects.filter(cohort_id=section.cohort_id,
                                               offering__term_id=section.offering.term_id))
    else:
        sections = [section]
    sessions = _sessions(sections, day)
    students = roster(section)
    label = section.cohort.label if section.cohort_id else section.code
    summary.append([section.institution.name])
    summary["A1"].font = Font(bold=True, size=14)
    summary.append([f"Class: {label} ({section.code}) · {day:%A %d %B %Y}"])
    summary.append(["P present · L late · A absent · E excused · — not marked"])
    summary.append([])
    header = ["Sr", "College roll", "University roll", "Name"] + [
        f"{s.section.offering.course.code} {_when(s)}" for s in sessions
    ] + ["Present", "Absent"]
    summary.append(header)
    head_row = summary.max_row
    for col in range(1, len(header) + 1):
        cell = summary.cell(row=head_row, column=col)
        cell.fill, cell.font, cell.border = HEAD_FILL, HEAD_FONT, BOX
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
    marks = {(r.session_id, r.student_id): r.status
             for r in AttendanceRecord.objects.filter(session__in=sessions)}
    for i, st in enumerate(students, start=1):
        row = [i, st.college_roll, st.external_id, st.get_full_name() or st.email]
        statuses = [marks.get((s.pk, st.pk), "") for s in sessions]
        row += [SHORT.get(x, "—") for x in statuses]
        row += [sum(x in ("present", "late") for x in statuses), statuses.count("absent")]
        summary.append(row)
        for col, status in enumerate(statuses, start=5):
            cell = summary.cell(row=summary.max_row, column=col)
            cell.alignment = Alignment(horizontal="center")
            if status in FILL:
                cell.fill = FILL[status]
        for col in range(1, len(header) + 1):
            summary.cell(row=summary.max_row, column=col).border = BOX
    for col, width in enumerate([5, 12, 15, 30] + [14] * len(sessions) + [9, 9], start=1):
        summary.column_dimensions[get_column_letter(col)].width = width
    summary.row_dimensions[head_row].height = 32
    summary.freeze_panes = summary.cell(row=head_row + 1, column=5)
    if not sessions:
        summary.append([])
        summary.append([f"No attendance was taken for this class on {day:%d %B %Y}."])
    used: set[str] = {"Summary"}
    for session in sessions:
        _write_lecture(wb.create_sheet(_sheet_title(session.section, session, used)),
                       session.section, session, roster(session.section))
    return wb


def xlsx_response(wb: Workbook, filename: str) -> HttpResponse:
    buffer = io.BytesIO()
    wb.save(buffer)
    response = HttpResponse(
        buffer.getvalue(),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    safe = re.sub(r"[^\w.\- +]+", "-", filename).strip() or "attendance.xlsx"
    response["Content-Disposition"] = f'attachment; filename="{safe}"'
    response["Cache-Control"] = "private, no-store"
    return response
