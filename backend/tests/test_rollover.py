"""Starting a new semester: the class moves on together, the old term closes."""

from datetime import date

import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from apps.academic.models import AcademicTerm, Course, CourseOffering, Section
from apps.administration.rollover import carry_students, start_semester
from apps.enrollment.models import SectionEnrollment, TeacherAssignment


def next_term(campus, **kw):
    old = campus.offering.term
    return start_semester(campus.admin, old, name="Spring 2027", code="S27",
                          starts_on=date(2027, 2, 1), ends_on=date(2027, 6, 30), **kw)


def test_only_admins_and_dates_must_move_forward(campus):
    with pytest.raises(PermissionDenied):
        start_semester(campus.teacher, campus.offering.term, name="X", code="X",
                       starts_on=date(2027, 2, 1), ends_on=date(2027, 6, 30))
    with pytest.raises(ValidationError, match="start after"):
        start_semester(campus.admin, campus.offering.term, name="X", code="X",
                       starts_on=date(2026, 1, 1), ends_on=date(2026, 6, 30))


def test_copying_sections_teachers_and_carrying_the_class(campus):
    result = next_term(campus, copy_sections=True, copy_teachers=True)
    term = result.term
    assert (result.sections_copied, result.teachers_copied) == (2, 1)
    new_3b = Section.objects.get(offering__term=term, code="3B")
    assert TeacherAssignment.objects.filter(section=new_3b, teacher=campus.teacher).exists()
    # Each class joins the new section with its own name.
    assert list(new_3b.enrollments.values_list("student_id", flat=True)) == [campus.ayesha.pk]
    assert result.students_carried == 2

    # The old term is closed and the new one is current.
    campus.s3b.refresh_from_db()
    assert campus.s3b.status == "archived"
    assert SectionEnrollment.objects.get(section=campus.s3b).status == "completed"
    term.refresh_from_db()
    assert term.is_current
    assert not AcademicTerm.objects.get(pk=campus.offering.term_id).is_current


def test_new_subjects_get_the_class_after_their_import(campus):
    # Next semester's subjects differ: nothing is copied at first.
    result = next_term(campus, copy_sections=False, close_old=False, make_new_current=False)
    assert result.students_carried == 0
    algo = Course.objects.create(institution=campus.inst, department=campus.cs,
                                 code="CS-310", title="Algorithms")
    offering = CourseOffering.objects.create(institution=campus.inst, course=algo,
                                             term=result.term)
    Section.objects.create(institution=campus.inst, offering=offering, code="3B")
    assert carry_students(campus.admin, campus.offering.term, result.term) == 1
    # Running it again adds nobody twice.
    assert carry_students(campus.admin, campus.offering.term, result.term) == 0
