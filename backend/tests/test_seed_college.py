"""seed_college: the BS CS (G1+G2) timetable from the college's sheet, replacing the demo data."""

from datetime import time

import pytest
from django.core.management import call_command

from apps.academic.models import Cohort, CohortMember, Course, Institution, Section
from apps.enrollment.models import SectionEnrollment, TeacherAssignment
from apps.identity.models import User
from apps.scheduling.models import ClassMeeting

pytestmark = pytest.mark.django_db(transaction=True)  # the command flushes the database

MON, TUE, WED, THU, FRI, SAT = range(6)


@pytest.fixture(autouse=True)
def seed_env(settings, monkeypatch):
    settings.DEBUG = True
    monkeypatch.setenv("SEED_PASSWORD", "test-seed-password")


def meetings(code):
    rows = ClassMeeting.objects.filter(section__offering__course__code=code).select_related("room")
    return sorted((m.weekday, m.starts_at, m.ends_at, m.room.code) for m in rows)


def teacher_of(code):
    a = TeacherAssignment.objects.select_related("teacher").get(
        section__offering__course__code=code
    )
    return a.teacher.get_full_name()


def test_replaces_the_demo_and_builds_the_bscs_timetable(campus):
    assert Institution.objects.filter(slug="test-u").exists()  # stand-in for the demo data
    call_command("seed_college", domain="gcslahore.edu.pk")

    assert list(Institution.objects.values_list("slug", flat=True)) == ["gcs-lahore"]

    # One section, BSCS24, taking all seven subjects.
    assert set(Section.objects.values_list("code", flat=True)) == {"BSCS24"}
    assert Section.objects.count() == 7
    section = Cohort.objects.get()
    assert section.label == "BS Computer Science · 2024–2028 · Morning"
    assert set(section.subjects.all()) == set(Section.objects.all())

    # (1-3) is Monday to Wednesday, (4-6) Thursday to Saturday, rooms as printed.
    assert meetings("CC-310") == [(d, time(10, 45), time(11, 45), "R-127") for d in (MON, TUE, WED)]
    assert meetings("HQ-005") == [(d, time(9, 30), time(10, 30), "R-27") for d in (THU, FRI, SAT)]
    assert meetings("EC-330") == [(d, time(8, 30), time(9, 30), "R-127") for d in (THU, FRI, SAT)]
    assert meetings("DC-321") == [(d, time(12, 45), time(13, 45), "R-127") for d in (THU, FRI, SAT)]
    assert ClassMeeting.objects.count() == 21

    assert teacher_of("CC-313") == "Nabeel"
    assert teacher_of("HQ-005") == "Mati ur Rehman"
    assert teacher_of("DC-322") == "Rawa"
    assert teacher_of("CC-320") == "Sadaf"
    assert set(User.objects.exclude(kind="student").values_list("email", flat=True)) == {
        "admin@gcslahore.edu.pk", "nabeel@gcslahore.edu.pk", "mati.urrehman@gcslahore.edu.pk",
        "rawa@gcslahore.edu.pk",
        "sadaf@gcslahore.edu.pk",
    }
    assert User.objects.get(email="sadaf@gcslahore.edu.pk").check_password("test-seed-password")


def test_every_student_is_enrolled_in_all_seven_subjects():
    call_command("seed_college", domain="gcslahore.edu.pk")
    students = User.objects.filter(kind="student")
    assert students.count() == 66
    assert SectionEnrollment.objects.count() == 66 * 7
    assert all(s.enrollments.count() == 7 for s in students)
    assert CohortMember.objects.filter(cohort__code="BSCS24", status="active").count() == 66

    haseeb = User.objects.get(email="126139@gcslahore.edu.pk")  # college roll 550
    assert (haseeb.first_name, haseeb.last_name) == ("Muhammad", "Haseeb")
    assert haseeb.external_id == "126139"
    assert haseeb.check_password("test-seed-password")
    assert User.objects.get(email="126188@gcslahore.edu.pk").get_full_name() == "Anusha Qaiser"
    assert User.objects.get(email="126189@gcslahore.edu.pk").get_full_name() == "Abu Haraira"
    assert User.objects.get(email="126180@gcslahore.edu.pk").get_full_name() == "Faiza"
    assert Course.objects.get(code="EC-330").title == "Web Development"
    assert User.objects.get(email="126120@gcslahore.edu.pk").last_name == "Qureshi"
    assert User.objects.get(email="126179@gcslahore.edu.pk").get_full_name() == "Irum Akhtar"


def test_a_rerun_adds_missing_students_and_fixes_titles():
    call_command("seed_college", domain="gcslahore.edu.pk")
    User.objects.filter(email="126139@gcslahore.edu.pk").delete()
    Course.objects.filter(code="EC-330").update(title="Web Engineering")
    User.objects.filter(email="126179@gcslahore.edu.pk").update(last_name="Ikhter")
    call_command("seed_college", domain="gcslahore.edu.pk")
    assert User.objects.filter(email="126139@gcslahore.edu.pk").exists()
    assert SectionEnrollment.objects.count() == 66 * 7
    assert Course.objects.get(code="EC-330").title == "Web Development"
    assert User.objects.get(email="126179@gcslahore.edu.pk").last_name == "Akhtar"


def test_a_second_run_changes_nothing():
    call_command("seed_college", domain="gcslahore.edu.pk")
    User.objects.filter(email="nabeel@gcslahore.edu.pk").update(first_name="Nabeel A.")
    call_command("seed_college", domain="gcslahore.edu.pk")
    assert User.objects.get(email="nabeel@gcslahore.edu.pk").first_name == "Nabeel A."


def test_without_a_password_nothing_is_touched(campus, monkeypatch):
    monkeypatch.delenv("SEED_PASSWORD")
    call_command("seed_college")
    assert Institution.objects.filter(slug="test-u").exists()
    assert not Institution.objects.filter(slug="gcs-lahore").exists()


def test_a_new_rebuild_starts_over_once(monkeypatch):
    """A college set up before the current REBUILD is replaced on the next run, once."""
    from apps.core.management.commands import seed_college
    from apps.governance.models import AuditLog

    call_command("seed_college", domain="gcslahore.edu.pk")
    User.objects.filter(email="nabeel@gcslahore.edu.pk").update(first_name="Changed")
    assert AuditLog.objects.filter(action="seed.rebuilt").count() == 1

    monkeypatch.setattr(seed_college, "REBUILD", "a later fresh start")
    call_command("seed_college", domain="gcslahore.edu.pk")
    assert User.objects.get(email="nabeel@gcslahore.edu.pk").first_name == "Nabeel"  # rebuilt

    User.objects.filter(email="nabeel@gcslahore.edu.pk").update(first_name="Changed again")
    call_command("seed_college", domain="gcslahore.edu.pk")  # remembered: no second wipe
    assert User.objects.get(email="nabeel@gcslahore.edu.pk").first_name == "Changed again"
