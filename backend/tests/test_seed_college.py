"""seed_college: the BS CS (G1+G2) timetable from the college's sheet, replacing the demo data."""

from datetime import time

import pytest
from django.core.management import call_command

from apps.academic.models import Institution, Section
from apps.enrollment.models import TeacherAssignment
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
    call_command("seed_college", domain="gcs.test")

    assert list(Institution.objects.values_list("slug", flat=True)) == ["gcs-lahore"]

    # One class: every course has a single G1+G2 section.
    assert set(Section.objects.values_list("code", flat=True)) == {"G1+G2"}
    assert Section.objects.count() == 7

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
    assert set(User.objects.values_list("email", flat=True)) == {
        "admin@gcs.test", "nabeel@gcs.test", "mati.urrehman@gcs.test", "rawa@gcs.test",
        "sadaf@gcs.test",
    }
    assert User.objects.get(email="sadaf@gcs.test").check_password("test-seed-password")


def test_a_second_run_changes_nothing():
    call_command("seed_college", domain="gcs.test")
    User.objects.filter(email="nabeel@gcs.test").update(first_name="Nabeel A.")
    call_command("seed_college", domain="gcs.test")
    assert User.objects.get(email="nabeel@gcs.test").first_name == "Nabeel A."


def test_without_a_password_nothing_is_touched(campus, monkeypatch):
    monkeypatch.delenv("SEED_PASSWORD")
    call_command("seed_college")
    assert Institution.objects.filter(slug="test-u").exists()
    assert not Institution.objects.filter(slug="gcs-lahore").exists()
