from datetime import date

import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from apps.academic.models import AcademicTerm, Course, Department, Section
from apps.administration import structure
from apps.enrollment.models import SectionEnrollment
from apps.governance.models import AuditLog
from apps.identity.models import RoleAssignment, User
from apps.scheduling.services import member_section_ids


@pytest.fixture
def coordinator(campus):
    person = User.objects.create_user(email="coord@test.edu", password="x" * 12,
                                      kind=User.Kind.STAFF, institution=campus.inst)
    RoleAssignment.objects.create(institution=campus.inst, user=person, department=campus.cs,
                                  role=RoleAssignment.Role.DEPARTMENT_COORDINATOR)
    return person


def test_admins_build_terms_departments_programs_and_courses(campus):
    spring = structure.save_term(campus.admin, None, name="Spring 2027", code="s27",
                                 starts_on=date(2027, 2, 1), ends_on=date(2027, 6, 1))
    structure.make_current(campus.admin, spring)
    assert list(AcademicTerm.objects.filter(is_current=True)) == [spring]
    with pytest.raises(ValidationError, match="end after"):
        structure.save_term(campus.admin, None, name="Bad", code="B",
                            starts_on=date(2027, 2, 1), ends_on=date(2027, 1, 1))

    math = structure.save_department(campus.admin, None, name="Mathematics", code="math")
    assert math.code == "MATH"
    with pytest.raises(ValidationError, match="already uses that code"):
        structure.save_department(campus.admin, None, name="Maths again", code="MATH")
    structure.save_program(campus.admin, None, department_id=math.pk, name="BS Maths", code="BSM")
    course = structure.save_course(campus.admin, None, department_id=math.pk, code="math-210",
                                   title="Linear Algebra", color="gold", credit_hours=3)
    assert (course.code, course.color) == ("MATH-210", "gold")
    with pytest.raises(ValidationError, match="colours"):
        structure.save_course(campus.admin, course, department_id=math.pk, code="MATH-210",
                              title="x", color="neon", credit_hours=3)
    assert AuditLog.objects.filter(action__in=["term.saved", "department.saved",
                                               "course.saved"]).count() == 3  # not the refused ones


def test_coordinators_manage_only_their_departments(campus, coordinator):
    assert structure.can_manage_structure(coordinator)
    structure.save_course(coordinator, None, department_id=campus.cs.pk, code="CS-410",
                          title="Compilers", color="sky", credit_hours=3)
    other = Department.objects.create(institution=campus.inst, name="Physics", code="PHY")
    with pytest.raises(PermissionDenied):
        structure.save_course(coordinator, None, department_id=other.pk, code="PHY-1",
                              title="Mechanics", color="sky", credit_hours=3)
    with pytest.raises(PermissionDenied):
        structure.save_department(coordinator, None, name="Chemistry", code="CHEM")
    with pytest.raises(PermissionDenied):
        structure.save_term(coordinator, None, name="T", code="T",
                            starts_on=date(2027, 1, 1), ends_on=date(2027, 2, 1))
    assert not structure.can_manage_structure(campus.teacher)
    assert not structure.can_manage_structure(campus.ayesha)


def test_sections_teachers_and_enrollment(campus):
    course = Course.objects.get(code="CS-301")
    term = campus.offering.term
    section = structure.create_section(campus.admin, course_id=course.pk, term_id=term.pk,
                                       code="3d")
    assert (section.code, section.offering) == ("3D", campus.offering)  # reuses the offering
    with pytest.raises(ValidationError, match="3B already has CS-301 that term"):
        structure.create_section(campus.admin, course_id=course.pk, term_id=term.pk, code="3B")

    with pytest.raises(ValidationError, match="is a student"):
        structure.assign_teacher(campus.admin, section, campus.ayesha.pk)
    structure.assign_teacher(campus.admin, section, campus.teacher.pk)
    assert section.pk in member_section_ids(campus.teacher)  # access follows at once

    assert structure.enroll(campus.admin, section, [campus.ayesha.pk, campus.hamza.pk]) == 2
    assert structure.enroll(campus.admin, section, [campus.ayesha.pk]) == 0  # already in
    with pytest.raises(ValidationError, match="isn't a student"):
        structure.enroll(campus.admin, section, [campus.teacher.pk])
    assert section.pk in member_section_ids(campus.hamza)

    structure.set_enrollment(campus.admin, section, campus.hamza.pk, "dropped")
    assert section.pk not in member_section_ids(campus.hamza)
    assert SectionEnrollment.objects.get(section=section, student=campus.hamza).status == "dropped"
    assert structure.enroll(campus.admin, section, [campus.hamza.pk]) == 1  # back again

    structure.update_section(campus.admin, section, status="archived")
    assert section.pk not in member_section_ids(campus.ayesha)  # archived: no longer current
    with pytest.raises(ValidationError, match="archived"):
        structure.enroll(campus.admin, section, [campus.ayesha.pk])
    structure.remove_teacher(campus.admin, section, campus.teacher.pk)
    actions = set(AuditLog.objects.values_list("action", flat=True))
    assert {"section.created", "section.teacher_assigned", "section.students_enrolled",
            "section.enrollment_changed", "section.updated", "section.teacher_removed"} <= actions


def test_structure_api(client, campus, coordinator):
    client.force_login(campus.teacher)
    assert client.get("/api/manage/structure").status_code == 403

    client.force_login(coordinator)
    data = client.get("/api/manage/structure").json()
    assert data["is_admin"] is False and [d["code"] for d in data["departments"]] == ["CS"]
    made = client.post("/api/manage/structure/sections", {
        "course_id": Course.objects.get(code="CS-301").pk, "term_id": campus.offering.term_id,
        "code": "3E"}, content_type="application/json")
    assert made.status_code == 201 and made.json()["code"] == "3E"
    sid = made.json()["id"]
    with_teacher = client.post(f"/api/manage/structure/sections/{sid}/teachers",
                               {"user_id": campus.teacher.pk}, content_type="application/json")
    assert [t["email"] for t in with_teacher.json()["teacher_list"]] == ["imran@test.edu"]
    enrolled = client.post(f"/api/manage/structure/sections/{sid}/students",
                           {"user_ids": [campus.ayesha.pk]}, content_type="application/json")
    assert enrolled.json()["students"] == 1
    rows = client.get("/api/manage/structure/sections",
                      {"term_id": campus.offering.term_id}).json()
    assert {r["code"] for r in rows} == {"3B", "3C", "3E"}
    assert client.post("/api/manage/structure/terms", {
        "name": "X", "code": "X", "starts_on": "2027-01-01", "ends_on": "2027-02-01"},
        content_type="application/json").status_code == 403
    assert Section.objects.filter(code="3E").exists()


def test_people_search_for_sections(client, campus, coordinator):
    client.force_login(coordinator)
    students = client.get("/api/manage/structure/people", {"kind": "student", "q": "ay"}).json()
    assert [p["email"] for p in students] == ["ayesha@test.edu"]
    teachers = client.get("/api/manage/structure/people", {"kind": "teacher"}).json()
    assert "imran@test.edu" in [p["email"] for p in teachers]
    assert "someone@other.edu" not in [p["email"] for p in teachers]
