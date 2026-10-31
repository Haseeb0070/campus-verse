from django.db.models import Count, Q
from ninja import Router, Schema
from ninja.errors import HttpError

from apps.chat.serializers import initials
from apps.core.audience import can_target
from apps.enrollment.models import SectionEnrollment, TeacherAssignment

from .models import Section

router = Router(tags=["sections"])


class SectionSummaryOut(Schema):
    id: int
    code: str
    course_code: str
    course_title: str
    color: str
    term: str
    students: int


class PersonOut(Schema):
    id: int
    name: str
    email: str
    initials: str


class RosterOut(Schema):
    section: SectionSummaryOut
    teachers: list[PersonOut]
    students: list[PersonOut]


def _summary(section: Section, students: int) -> dict:
    course = section.offering.course
    return {
        "id": section.pk,
        "code": section.code,
        "course_code": course.code,
        "course_title": course.title,
        "color": course.color,
        "term": section.offering.term.name,
        "students": students,
    }


def _person(user) -> dict:
    return {
        "id": user.pk,
        "name": user.get_full_name() or user.email,
        "email": user.email,
        "initials": initials(user),
    }


@router.get("/teaching", response=list[SectionSummaryOut])
def teaching(request):
    """Sections the signed-in teacher is assigned to."""
    ids = TeacherAssignment.objects.filter(teacher=request.user).values("section_id")
    sections = (
        Section.objects.filter(pk__in=ids, institution_id=request.user.institution_id)
        .select_related("offering__course", "offering__term")
        .annotate(
            active=Count("enrollments", filter=Q(enrollments__status="active"), distinct=True)
        )
        .order_by("offering__course__code", "code")
    )
    return [_summary(s, s.active) for s in sections]


@router.get("/{section_id}/roster", response=RosterOut)
def roster(request, section_id: int):
    """Only people who manage the section (its teachers, coordinators, admins) see who's in it.
    Anyone else gets the same 404 as for a section that doesn't exist."""
    section = (
        Section.objects.select_related("offering__course", "offering__term")
        .filter(pk=section_id, institution_id=request.user.institution_id)
        .first()
    )
    if section is None or not can_target(request.user, "section", section.pk):
        raise HttpError(404, "Section not found")
    students = [
        e.student
        for e in SectionEnrollment.objects.filter(
            section=section, status=SectionEnrollment.Status.ACTIVE
        )
        .select_related("student")
        .order_by("student__first_name", "student__last_name")
    ]
    teachers = [
        a.teacher
        for a in TeacherAssignment.objects.filter(section=section).select_related("teacher")
    ]
    return {
        "section": _summary(section, len(students)),
        "teachers": [_person(t) for t in teachers],
        "students": [_person(s) for s in students],
    }
