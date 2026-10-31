"""A student's progress view (SRS 5.12): what's known so far, each part labelled with where it
comes from. Nothing here is an official result, and no grade or GPA is computed: marks are
shown as released by teachers, attendance as recorded."""

from apps.assignments.models import Assignment, Grade
from apps.enrollment.models import SectionEnrollment

from . import services

GRADES_SOURCE = "Teacher-entered marks, released by your teachers. Not an official result."
ATTENDANCE_SOURCE = "Recorded by your teachers in CampusVerse."


def my_progress(user) -> list[dict]:
    sections = [e.section for e in SectionEnrollment.objects.filter(
        student=user, status=SectionEnrollment.Status.ACTIVE
    ).select_related("section__offering__course", "section__offering__term")]
    released = Assignment.objects.filter(
        section__in=sections, status=Assignment.Status.PUBLISHED, grades_released_at__isnull=False
    ).order_by("due_at")
    grades = {g.assignment_id: g for g in Grade.objects.filter(student=user,
                                                               assignment__in=released)}
    institution = user.institution
    show_attendance = bool(institution and institution.attendance_enabled
                           and institution.attendance_visible_to_students)
    attendance = {s.pk: summary for s, summary in services.my_summary(user)} \
        if show_attendance else {}

    out = []
    for section in sections:
        course = section.offering.course
        marked = [
            {"id": a.pk, "title": a.title, "max_points": a.max_points,
             "points": grades[a.pk].points if a.pk in grades else None}
            for a in released if a.section_id == section.pk
        ]
        graded = [m for m in marked if m["points"] is not None]
        out.append({
            "section_id": section.pk, "section_code": section.code, "course_code": course.code,
            "course_title": course.title, "color": course.color, "term": section.offering.term.name,
            "assignments": marked,
            "points": sum(m["points"] for m in graded) if graded else None,
            "max_points": sum(m["max_points"] for m in graded) if graded else None,
            "grades_source": GRADES_SOURCE,
            "attendance": attendance.get(section.pk) if show_attendance else None,
            "attendance_source": ATTENDANCE_SOURCE if show_attendance else None,
        })
    return out
