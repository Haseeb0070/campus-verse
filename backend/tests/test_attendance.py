from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone

from apps.assignments.models import Assignment, Grade
from apps.attendance import progress, services
from apps.attendance.models import AttendanceRecord
from apps.enrollment.models import SectionEnrollment
from apps.governance.models import AuditLog


@pytest.fixture
def enabled(campus):
    campus.inst.attendance_enabled = True
    campus.inst.attendance_visible_to_students = True
    campus.inst.save()
    for person in (campus.teacher, campus.ayesha, campus.hamza, campus.admin):
        person.refresh_from_db()
    SectionEnrollment.objects.create(institution=campus.inst, section=campus.s3b,
                                     student=campus.hamza)
    return campus


def today():
    """The campus's date (Asia/Karachi in the fixtures), which can differ from the server's."""
    from zoneinfo import ZoneInfo

    return timezone.now().astimezone(ZoneInfo("Asia/Karachi")).date()


def take(campus, user=None, day=None, change=False, **marks):
    people = {"ayesha": campus.ayesha.pk, "hamza": campus.hamza.pk}
    return services.save(user or campus.teacher, campus.s3b, day or today(), None,
                         {people[k]: (v, "") for k, v in marks.items()}, change=change)


def test_nothing_happens_until_the_institution_switches_it_on(campus):
    with pytest.raises(PermissionDenied, match="isn't switched on"):
        services.sheet(campus.teacher, campus.s3b, today(), None)
    with pytest.raises(PermissionDenied):
        services.save(campus.teacher, campus.s3b, today(), None, {})
    assert services.my_summary(campus.ayesha) == []


def test_teachers_take_attendance_and_corrections_are_audited(enabled):
    take(enabled, ayesha="present", hamza="absent")
    assert AuditLog.objects.get(action="attendance.taken").changes == {"present": 1, "absent": 1}
    sheet = services.sheet(enabled.teacher, enabled.s3b, today(), None)
    assert {s.email: sheet["saved"][s.pk].status for s in sheet["students"]} == {
        "ayesha@test.edu": "present", "hamza@test.edu": "absent"}

    with pytest.raises(services.AlreadyTaken):  # a second take never overwrites the first
        take(enabled, hamza="late")
    take(enabled, change=True, hamza="late")  # he turned up after all
    corrected = AuditLog.objects.get(action="attendance.corrected")
    assert corrected.changes == {str(enabled.hamza.pk): ["absent", "late"]}
    record = AttendanceRecord.objects.get(student=enabled.hamza)
    assert [h.status for h in record.history.order_by("history_date")] == ["absent", "late"]


def test_who_can_take_it_and_what_is_refused(enabled):
    with pytest.raises(PermissionDenied):
        take(enabled, user=enabled.ayesha, ayesha="present")
    with pytest.raises(ValidationError, match="future"):
        take(enabled, day=today() + timedelta(days=1), ayesha="present")
    with pytest.raises(ValidationError, match="present, late, absent or excused"):
        take(enabled, ayesha="asleep")
    with pytest.raises(ValidationError, match="isn't enrolled"):
        services.save(enabled.teacher, enabled.s3b, today(), None,
                      {enabled.outsider.pk: ("present", "")})


def test_after_48_hours_only_coordinators_and_admins_correct(enabled):
    old = today() - timedelta(days=4)
    with pytest.raises(PermissionDenied, match="48 hours"):
        take(enabled, day=old, ayesha="present")
    assert services.sheet(enabled.teacher, enabled.s3b, old, None)["locked"] is True
    take(enabled, user=enabled.admin, day=old, ayesha="excused")
    assert services.sheet(enabled.admin, enabled.s3b, old, None)["locked"] is False


def test_summaries_count_late_as_attended_and_skip_excused(enabled):
    for days, mark in [(0, "present"), (1, "late"), (2, "absent"), (3, "excused")]:
        take(enabled, user=enabled.admin, day=today() - timedelta(days=days), ayesha=mark)
    (section, summary), = services.my_summary(enabled.ayesha)
    assert section == enabled.s3b
    assert summary == {"sessions": 4, "present": 1, "late": 1, "absent": 1, "excused": 1,
                       "rate": 67}
    report = services.section_report(enabled.teacher, enabled.s3b)
    assert {s.email: r["sessions"] for s, r in report["students"]} == {
        "ayesha@test.edu": 4, "hamza@test.edu": 0}
    enabled.inst.attendance_visible_to_students = False
    enabled.inst.save()
    enabled.ayesha.refresh_from_db()
    with pytest.raises(PermissionDenied, match="doesn't show"):
        services.my_summary(enabled.ayesha)


def test_progress_shows_released_marks_with_their_source(enabled):
    now = timezone.now()
    released = Assignment.objects.create(
        institution=enabled.inst, section=enabled.s3b, title="Lab 1", created_by=enabled.teacher,
        available_from=now - timedelta(days=9), due_at=now - timedelta(days=2), max_points=20,
        grades_released_at=now,
    )
    Assignment.objects.create(
        institution=enabled.inst, section=enabled.s3b, title="Lab 2", created_by=enabled.teacher,
        available_from=now - timedelta(days=9), due_at=now - timedelta(days=1), max_points=10,
    )
    Grade.objects.create(institution=enabled.inst, assignment=released, student=enabled.ayesha,
                         points=Decimal("17"), graded_by=enabled.teacher)
    take(enabled, ayesha="present")
    (course,) = progress.my_progress(enabled.ayesha)
    assert [a["title"] for a in course["assignments"]] == ["Lab 1"]  # Lab 2 isn't released
    assert (course["points"], course["max_points"]) == (Decimal("17"), 20)
    assert "Not an official result" in course["grades_source"]
    assert course["attendance"]["rate"] == 100

    enabled.inst.attendance_visible_to_students = False
    enabled.inst.save()
    enabled.ayesha.refresh_from_db()
    (course,) = progress.my_progress(enabled.ayesha)
    assert course["attendance"] is None and course["attendance_source"] is None


def test_attendance_api(client, enabled):
    client.force_login(enabled.teacher)
    url = f"/api/attendance/sections/{enabled.s3b.pk}/sheet"
    blank = client.get(url, {"day": str(today())}).json()
    assert blank["saved"] is False and [m["status"] for m in blank["marks"]] == [None, None]
    saved = client.put(url, {"date": str(today()), "marks": [
        {"student_id": enabled.ayesha.pk, "status": "present"},
        {"student_id": enabled.hamza.pk, "status": "late", "note": "Bus"}]},
        content_type="application/json").json()
    assert saved["saved"] and saved["taken_by"] == "imran@test.edu"
    report = client.get(f"/api/attendance/sections/{enabled.s3b.pk}/report").json()
    assert len(report["sessions"]) == 1

    client.force_login(enabled.ayesha)
    assert client.get(url, {"day": str(today())}).status_code == 403
    assert client.get("/api/progress").json()[0]["attendance"]["rate"] == 100
    assert client.put("/api/attendance/settings", {"attendance_enabled": False,
                                                   "attendance_visible_to_students": False},
                      content_type="application/json").status_code == 403
    client.force_login(enabled.admin)
    off = client.put("/api/attendance/settings", {"attendance_enabled": False,
                                                  "attendance_visible_to_students": True},
                     content_type="application/json").json()
    assert off == {"attendance_enabled": False, "attendance_visible_to_students": False}
    assert client.get("/api/me").json()["institution"]["attendance_enabled"] is False
