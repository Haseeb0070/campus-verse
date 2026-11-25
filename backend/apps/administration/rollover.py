"""Starting a new semester. The new term is created; subjects and their teachers can be copied
(for subjects that repeat); students are carried over by section: each section's students join
its new-term subjects, and its CR and GR carry on. The old term can be closed (subjects archived,
enrollments completed) and the new one made current. Every step is audit-logged and runs in one
transaction."""

from dataclasses import dataclass

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.academic.models import AcademicTerm, CourseOffering, Section
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.governance import audit

from .structure import make_current, require_admin, save_term


@dataclass
class RolloverResult:
    term: AcademicTerm
    sections_copied: int = 0
    teachers_copied: int = 0
    students_carried: int = 0
    sections_closed: int = 0


def carry_students(admin, from_term: AcademicTerm, to_term: AcademicTerm) -> int:
    """Enrolls each section's students in its new-term subjects. A subject without a section
    (from before sections existed) takes the students of last term's subjects with the same code.
    Returns how many enrollments were added (people already enrolled are left alone)."""
    from apps.classreps.services import carry_reps

    from .cohorts import enroll_members

    require_admin(admin)
    if from_term.pk == to_term.pk:
        raise ValidationError("Choose a different term to carry students from.")
    old = (
        SectionEnrollment.objects.filter(
            section__offering__term=from_term,
            status__in=[SectionEnrollment.Status.ACTIVE, SectionEnrollment.Status.COMPLETED],
        )
        .values_list("section__code", "student_id")
    )
    by_code: dict[str, set[int]] = {}
    for code, student in old:
        by_code.setdefault(code.lower(), set()).add(student)
    added = 0
    for section in Section.objects.filter(offering__term=to_term, status=Section.Status.ACTIVE):
        if section.cohort_id:
            added += enroll_members(section)
            continue
        students = by_code.get(section.code.lower(), set())
        if not students:
            continue
        have = set(SectionEnrollment.objects.filter(section=section)
                   .values_list("student_id", flat=True))
        new = [
            SectionEnrollment(institution_id=section.institution_id, section=section, student_id=s)
            for s in students - have
        ]
        SectionEnrollment.objects.bulk_create(new)
        added += len(new)
    carry_reps(admin, from_term, to_term)
    if added:
        audit.record(actor=admin, action="term.students_carried", target=to_term,
                     changes={"from": from_term.code, "enrollments": added})
    return added


@transaction.atomic
def start_semester(admin, from_term: AcademicTerm, *, name: str, code: str, starts_on, ends_on,
                   copy_sections: bool = False, copy_teachers: bool = False,
                   carry: bool = True, close_old: bool = True, make_new_current: bool = True,
                   ) -> RolloverResult:
    require_admin(admin)
    if from_term.institution_id != admin.institution_id:
        raise ValidationError("That term isn't in your institution.")
    if starts_on <= from_term.starts_on:
        raise ValidationError("The new semester has to start after the one it follows.")
    term = save_term(admin, None, name=name, code=code, starts_on=starts_on, ends_on=ends_on)
    result = RolloverResult(term=term)

    if copy_sections:
        for offering in CourseOffering.objects.filter(term=from_term, course__is_active=True) \
                .select_related("course"):
            new_offering, _ = CourseOffering.objects.get_or_create(
                institution_id=offering.institution_id, course=offering.course, term=term
            )
            for section in offering.sections.filter(status=Section.Status.ACTIVE):
                new_section = Section.objects.create(
                    institution_id=section.institution_id, offering=new_offering,
                    code=section.code, program=section.program, cohort_id=section.cohort_id,
                )
                result.sections_copied += 1
                if copy_teachers:
                    for t in TeacherAssignment.objects.filter(section=section):
                        TeacherAssignment.objects.create(
                            institution_id=t.institution_id, section=new_section,
                            teacher_id=t.teacher_id, role=t.role,
                        )
                        result.teachers_copied += 1

    if carry:
        result.students_carried = carry_students(admin, from_term, term)

    if close_old:
        old_sections = Section.objects.filter(offering__term=from_term,
                                              status=Section.Status.ACTIVE)
        SectionEnrollment.objects.filter(
            section__in=old_sections, status=SectionEnrollment.Status.ACTIVE
        ).update(status=SectionEnrollment.Status.COMPLETED)
        result.sections_closed = old_sections.update(status=Section.Status.ARCHIVED)

    if make_new_current:
        make_current(admin, term)

    audit.record(actor=admin, action="term.started", target=term, changes={
        "from": from_term.code, "sections_copied": result.sections_copied,
        "teachers_copied": result.teachers_copied, "students_carried": result.students_carried,
        "sections_closed": result.sections_closed,
    })
    return result
