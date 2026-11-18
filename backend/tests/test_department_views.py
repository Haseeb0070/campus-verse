"""Department coordinators see their departments' people and report, and nothing more."""

import pytest

from apps.academic.models import Course, CourseOffering, Department, Section
from apps.enrollment.models import SectionEnrollment
from apps.identity.models import RoleAssignment, User


@pytest.fixture
def coordinator(campus):
    person = User.objects.create_user(email="coord@test.edu", institution=campus.inst,
                                      kind=User.Kind.TEACHER)
    RoleAssignment.objects.create(institution=campus.inst, user=person, department=campus.cs,
                                  role=RoleAssignment.Role.DEPARTMENT_COORDINATOR)
    return person


@pytest.fixture
def maths(campus):
    """Another department, with its own student."""
    dept = Department.objects.create(institution=campus.inst, name="Maths", code="MA")
    course = Course.objects.create(institution=campus.inst, department=dept, code="MA-101",
                                   title="Calculus")
    offering = CourseOffering.objects.create(institution=campus.inst, course=course,
                                             term=campus.offering.term)
    section = Section.objects.create(institution=campus.inst, offering=offering, code="1A")
    student = User.objects.create_user(email="maths@test.edu", institution=campus.inst)
    SectionEnrollment.objects.create(institution=campus.inst, section=section, student=student)
    return dept


def test_coordinators_see_their_departments_people(client, campus, coordinator, maths):
    client.force_login(coordinator)
    emails = {p["email"] for p in client.get("/api/manage/structure/department/people").json()}
    assert {"ayesha@test.edu", "hamza@test.edu", "imran@test.edu"} <= emails
    assert "maths@test.edu" not in emails
    assert client.get(f"/api/manage/structure/department/people?department={maths.pk}") \
        .status_code == 403
    csv = client.get("/api/manage/structure/department/people.csv")
    assert csv["Content-Type"].startswith("text/csv")

    client.force_login(campus.ayesha)  # a student: none of this
    assert client.get("/api/manage/structure/department/people").status_code == 403


def test_coordinators_report_is_their_departments_only(client, campus, coordinator, maths):
    client.force_login(coordinator)
    report = client.get("/api/manage/structure/department/reports?days=30").json()
    assert report["scope"] == "department"
    assert report["people"]["students"] == 2  # Ayesha and Hamza, not the maths student
    assert report["moderation"]["open"] == 0 and report["sync"]["sources"] == 0

    client.force_login(campus.admin)  # admins can look at any one department
    maths_report = client.get(f"/api/manage/structure/department/reports?department={maths.pk}")
    assert maths_report.json()["people"]["students"] == 1
