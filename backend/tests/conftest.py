from datetime import date
from types import SimpleNamespace

import pytest
from django.core.cache import cache

from apps.academic.models import (
    AcademicTerm,
    Course,
    CourseOffering,
    Department,
    Institution,
    Section,
)
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.identity.models import RoleAssignment, User


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()


@pytest.fixture
def campus(db):
    """One institution, one CS department, CS-301 with sections 3B and 3C, plus people."""
    inst = Institution.objects.create(name="Test University", slug="test-u")
    other_inst = Institution.objects.create(name="Other University", slug="other-u")
    cs = Department.objects.create(institution=inst, name="Computer Science", code="CS")
    term = AcademicTerm.objects.create(
        institution=inst, name="Fall 2026", code="F26",
        starts_on=date(2026, 9, 1), ends_on=date(2026, 12, 31), is_current=True,
    )
    course = Course.objects.create(
        institution=inst, department=cs, code="CS-301", title="Data Structures"
    )
    offering = CourseOffering.objects.create(institution=inst, course=course, term=term)
    s3b = Section.objects.create(institution=inst, offering=offering, code="3B")
    s3c = Section.objects.create(institution=inst, offering=offering, code="3C")

    def person(email, kind, institution=inst):
        return User.objects.create_user(email=email, password="test-pass-123", kind=kind,
                                        institution=institution)

    teacher = person("imran@test.edu", User.Kind.TEACHER)
    ayesha = person("ayesha@test.edu", User.Kind.STUDENT)
    hamza = person("hamza@test.edu", User.Kind.STUDENT)
    admin = person("nadia@test.edu", User.Kind.STAFF)
    outsider = person("someone@other.edu", User.Kind.STUDENT, institution=other_inst)

    TeacherAssignment.objects.create(institution=inst, section=s3b, teacher=teacher)
    SectionEnrollment.objects.create(institution=inst, section=s3b, student=ayesha)
    SectionEnrollment.objects.create(institution=inst, section=s3c, student=hamza)
    RoleAssignment.objects.create(
        institution=inst, user=admin, role=RoleAssignment.Role.INSTITUTION_ADMIN
    )

    return SimpleNamespace(
        inst=inst, cs=cs, offering=offering, s3b=s3b, s3c=s3c, teacher=teacher,
        ayesha=ayesha, hamza=hamza, admin=admin, outsider=outsider,
    )
