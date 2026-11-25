"""Sections (cohorts): their students follow them into every subject, and their CR/GR carry on."""

from datetime import date

import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from apps.academic.models import Cohort, CohortMember, Course, Program
from apps.administration import cohorts, structure
from apps.administration.rollover import start_semester
from apps.classreps import services as reps
from apps.classreps.models import ClassRep
from apps.enrollment.models import SectionEnrollment
from apps.identity.models import RoleAssignment, User


def active_in(section):
    return set(SectionEnrollment.objects.filter(section=section, status="active")
               .values_list("student_id", flat=True))


@pytest.fixture
def morning(campus):
    """BS CS 2024–2028 Morning A, a new section with Zara and Omar."""
    program = Program.objects.create(institution=campus.inst, department=campus.cs,
                                     name="BS Computer Science", code="BSCS")
    c = cohorts.save_cohort(campus.admin, None, program_id=program.pk, code="cs24-ma", name="A",
                            shift="morning", start_year=2024, end_year=2028)
    zara, omar = (User.objects.create_user(email=f"{n}@test.edu", password="x",
                                           kind=User.Kind.STUDENT, institution=campus.inst)
                  for n in ("zara", "omar"))
    cohorts.add_students(campus.admin, c, [zara.pk, omar.pk])
    campus.morning, campus.program, campus.zara, campus.omar = c, program, zara, omar
    return campus


def test_a_section_has_a_name_and_a_short_code(morning):
    c = morning.morning
    assert (c.code, c.label) == ("CS24-MA", "BS Computer Science · 2024–2028 · Morning · A")
    with pytest.raises(ValidationError, match="already uses that code"):
        cohorts.save_cohort(morning.admin, None, program_id=None, code="CS24-MA")
    with pytest.raises(ValidationError, match="end after it starts"):
        cohorts.save_cohort(morning.admin, None, program_id=None, code="X", start_year=2028,
                            end_year=2024)


def test_a_new_subject_takes_the_sections_code_and_students(morning):
    course = Course.objects.create(institution=morning.inst, department=morning.cs,
                                   code="CS-310", title="AI")
    subject = structure.create_section(morning.admin, course_id=course.pk,
                                       term_id=morning.term.pk, cohort_id=morning.morning.pk)
    assert subject.code == "CS24-MA" and subject.program == morning.program
    assert active_in(subject) == {morning.zara.pk, morning.omar.pk}

    # A student joining later is put in every subject; leaving drops them and their CR role.
    sana = User.objects.create_user(email="sana@test.edu", password="x",
                                    kind=User.Kind.STUDENT, institution=morning.inst)
    cohorts.add_students(morning.admin, morning.morning, [sana.pk])
    assert sana.pk in active_in(subject)
    reps.set_rep(morning.admin, morning.morning, morning.term, sana, "cr")
    assert reps.rep_role(sana, subject) == "cr"
    cohorts.remove_student(morning.admin, morning.morning, sana.pk)
    assert sana.pk not in active_in(subject)
    assert not ClassRep.objects.filter(student=sana).exists()
    assert CohortMember.objects.get(student=sana).status == "left"

    # Renaming the section renames its subjects; a subject's own code can't drift from it.
    cohorts.save_cohort(morning.admin, morning.morning, program_id=morning.program.pk,
                        code="CS24-M1", name="A", shift="morning", start_year=2024,
                        end_year=2028)
    subject.refresh_from_db()
    assert subject.code == "CS24-M1"
    with pytest.raises(ValidationError, match="takes its section's code"):
        structure.update_section(morning.admin, subject, code="ZZ")


def test_coordinators_manage_only_their_departments_sections(morning):
    coord = User.objects.create_user(email="coord@test.edu", password="x",
                                     kind=User.Kind.TEACHER, institution=morning.inst)
    RoleAssignment.objects.create(institution=morning.inst, user=coord, department=morning.cs,
                                  role=RoleAssignment.Role.DEPARTMENT_COORDINATOR)
    cohorts.add_students(coord, morning.morning, [morning.zara.pk])  # theirs: fine
    with pytest.raises(PermissionDenied):
        cohorts.add_students(coord, morning.c3b, [morning.ayesha.pk])  # no program: admin only
    with pytest.raises(PermissionDenied):
        cohorts.save_cohort(coord, None, program_id=None, code="NOPE")
    assert set(cohorts.visible(coord)) == {morning.morning}
    with pytest.raises(PermissionDenied):
        cohorts.add_students(morning.teacher, morning.morning, [morning.ayesha.pk])


def test_next_semester_carries_each_sections_students_and_reps(morning):
    term = morning.term
    reps.set_rep(morning.admin, morning.c3b, term, morning.ayesha, "cr")
    new = start_semester(morning.admin, term, name="Spring 2027", code="S27",
                         starts_on=date(2027, 2, 1), ends_on=date(2027, 6, 30),
                         copy_sections=True, copy_teachers=True).term
    s3b_next = Cohort.objects.get(pk=morning.c3b.pk).subjects.get(offering__term=new)
    assert s3b_next.code == "3B" and active_in(s3b_next) == {morning.ayesha.pk}
    assert reps.rep_role(morning.ayesha, s3b_next) == "cr"


def test_the_sections_api(morning, client):
    client.force_login(morning.admin)
    rows = client.get("/api/manage/sections").json()
    row = next(r for r in rows if r["code"] == "CS24-MA")
    assert (row["students"], row["label"]) == (2, "BS Computer Science · 2024–2028 · Morning · A")
    url = f"/api/manage/sections/{morning.morning.pk}"
    r = client.put(f"{url}/reps", {"term_id": morning.term.pk, "student_id": morning.omar.pk,
                                   "role": "gr"}, content_type="application/json")
    assert r.status_code == 200
    detail = r.json()
    assert detail["gr"] == "omar@test.edu"
    assert {m["email"]: m["role"] for m in detail["members"]}["omar@test.edu"] == "gr"
    r = client.delete(f"{url}/students/{morning.omar.pk}")
    assert r.status_code == 200 and r.json()["gr"] is None

    client.force_login(morning.teacher)
    assert client.get("/api/manage/sections").status_code == 403


def test_a_student_is_in_one_section_at_a_time(morning, client):
    """Ayesha is in 3B (and its CR). Adding her to Morning A asks first; moving takes her out of
    3B's subjects and its CR role, and puts her in Morning A's."""
    reps.set_rep(morning.admin, morning.c3b, morning.term, morning.ayesha, "cr")
    with pytest.raises(cohorts.InOtherSection, match="ayesha@test.edu is in 3B"):
        cohorts.add_students(morning.admin, morning.morning, [morning.ayesha.pk])

    client.force_login(morning.admin)
    url = f"/api/manage/sections/{morning.morning.pk}/students"
    r = client.post(url, {"user_ids": [morning.ayesha.pk]}, content_type="application/json")
    assert r.status_code == 409 and "is in 3B" in r.json()["detail"]
    r = client.post(url, {"user_ids": [morning.ayesha.pk], "move": True},
                    content_type="application/json")
    assert r.status_code == 200
    assert morning.ayesha.pk not in active_in(morning.s3b)
    assert reps.rep_role(morning.ayesha, morning.s3b) is None
    assert set(CohortMember.objects.filter(student=morning.ayesha, status="active")
               .values_list("cohort__code", flat=True)) == {"CS24-MA"}


def test_enrollment_import_puts_students_in_a_section(morning):
    """A row without a course is the whole section; with one, a single subject (an exception)."""
    from apps.administration.import_kinds import apply_enrollment, build_enrollment

    course = Course.objects.create(institution=morning.inst, department=morning.cs,
                                   code="CS-310", title="AI")
    ai = structure.create_section(morning.admin, course_id=course.pk, term_id=morning.term.pk,
                                  cohort_id=morning.morning.pk)
    plan = build_enrollment(morning.inst.pk, morning.term, [
        {"section": "cs24-ma", "person": "ayesha@test.edu"},          # moves from 3B
        {"section": "CS24-MA", "person": "zara@test.edu"},            # already there
        {"section": "3C", "person": "omar@test.edu", "course_code": "CS-301"},  # one subject
        {"section": "NOPE", "person": "omar@test.edu"},
        {"section": "CS24-MA", "person": "imran@test.edu", "role": "teacher"},
    ])
    rows = plan["rows"]
    assert [r["status"] for r in rows] == ["update", "unchanged", "new", "error", "error"]
    assert rows[0]["changes"] == {"section": ["3B", "CS24-MA"]}
    assert "no section NOPE" in rows[3]["message"]
    assert "course a teacher teaches" in rows[4]["message"]

    class Run:
        institution_id = morning.inst.pk

    result = apply_enrollment(Run(), plan, morning.admin)
    assert result["joined_sections"] == 1 and result["enrolled"] == 1
    assert morning.ayesha.pk in active_in(ai) and morning.ayesha.pk not in active_in(morning.s3b)
    assert morning.omar.pk in active_in(morning.s3c)  # an exception, still in Morning A
    assert CohortMember.objects.get(student=morning.omar).cohort == morning.morning
