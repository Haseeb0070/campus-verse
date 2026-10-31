from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from apps.scheduling.models import ClassMeeting, Room, ScheduleChange
from apps.scheduling.services import next_occurrence, occurrences

THURSDAY = date(2026, 11, 5)
MONDAY_AFTER = date(2026, 11, 9)


@pytest.fixture
def week(campus):
    room = Room.objects.create(institution=campus.inst, code="B-204")
    other_room = Room.objects.create(institution=campus.inst, code="B-210")
    thu_3b = ClassMeeting.objects.create(
        institution=campus.inst, section=campus.s3b, weekday=3,
        starts_at=time(10, 30), ends_at=time(11, 50), room=room,
    )
    thu_3c = ClassMeeting.objects.create(
        institution=campus.inst, section=campus.s3c, weekday=3,
        starts_at=time(14, 30), ends_at=time(15, 50), room=room,
    )
    return {"room": room, "other_room": other_room, "thu_3b": thu_3b, "thu_3c": thu_3c}


def test_students_see_only_their_sections(campus, week):
    ayesha = occurrences(campus.ayesha, THURSDAY, 1)
    assert [(o.course_code, o.section_code) for o in ayesha] == [("CS-301", "3B")]
    occ = ayesha[0]
    assert occ.starts_at == datetime(2026, 11, 5, 10, 30, tzinfo=ZoneInfo("Asia/Karachi"))
    assert occ.room == "B-204"
    assert occ.teachers == ["imran@test.edu"]
    assert occurrences(campus.hamza, THURSDAY, 1)[0].section_code == "3C"
    assert occurrences(campus.outsider, THURSDAY, 1) == []


def test_teachers_see_sections_they_teach(campus, week):
    assert [o.section_code for o in occurrences(campus.teacher, THURSDAY, 1)] == ["3B"]


def test_meetings_only_run_on_their_weekday_within_the_term(campus, week):
    assert occurrences(campus.ayesha, THURSDAY - timedelta(days=1), 1) == []
    week_of = occurrences(campus.ayesha, MONDAY_AFTER - timedelta(days=7), 7)
    assert [o.date for o in week_of] == [THURSDAY]
    assert occurrences(campus.ayesha, date(2027, 1, 7), 1) == []  # after the term ends


def test_cancelled_class_still_shows_as_cancelled(campus, week):
    ScheduleChange.objects.create(
        institution=campus.inst, meeting=week["thu_3b"], date=THURSDAY,
        status=ScheduleChange.Status.CANCELLED, note="Teacher away",
    )
    occ = occurrences(campus.ayesha, THURSDAY, 1)[0]
    assert (occ.status, occ.note) == ("cancelled", "Teacher away")


def test_room_change_applies_to_that_day_only(campus, week):
    ScheduleChange.objects.create(
        institution=campus.inst, meeting=week["thu_3b"], date=THURSDAY,
        status=ScheduleChange.Status.ROOM_CHANGED, new_room=week["other_room"],
    )
    assert occurrences(campus.ayesha, THURSDAY, 1)[0].room == "B-210"
    assert occurrences(campus.ayesha, THURSDAY + timedelta(days=7), 1)[0].room == "B-204"


def test_moved_class_appears_on_both_days(campus, week):
    ScheduleChange.objects.create(
        institution=campus.inst, meeting=week["thu_3b"], date=THURSDAY,
        status=ScheduleChange.Status.MOVED, new_date=MONDAY_AFTER, new_starts_at=time(15, 0),
        new_ends_at=time(16, 20),
    )
    span = occurrences(campus.ayesha, THURSDAY, 5)
    assert [(o.date, o.status) for o in span] == [
        (THURSDAY, "moved"),
        (MONDAY_AFTER, "rescheduled"),
    ]
    assert span[1].starts_at.time() == time(15, 0)
    assert span[0].moved_to == span[1].starts_at
    assert span[1].moved_from == THURSDAY


def test_next_occurrence_skips_ended_and_moved_classes(campus, week):
    tz = ZoneInfo("Asia/Karachi")
    during = datetime(2026, 11, 5, 11, 0, tzinfo=tz)
    assert next_occurrence(campus.ayesha, now=during).date == THURSDAY
    after = datetime(2026, 11, 5, 12, 0, tzinfo=tz)
    assert next_occurrence(campus.ayesha, now=after).date == THURSDAY + timedelta(days=7)
    ScheduleChange.objects.create(
        institution=campus.inst, meeting=week["thu_3b"], date=THURSDAY + timedelta(days=7),
        status=ScheduleChange.Status.CANCELLED,
    )
    assert next_occurrence(campus.ayesha, now=after).date == THURSDAY + timedelta(days=14)


def test_timetable_api(client, campus, week):
    client.force_login(campus.ayesha)
    rows = client.get("/api/timetable", {"start": THURSDAY.isoformat(), "days": 7}).json()
    assert [(r["course_code"], r["date"], r["status"]) for r in rows] == [
        ("CS-301", "2026-11-05", "scheduled")
    ]
    assert client.get("/api/timetable", {"days": 90}).status_code == 422


def test_me_api_lists_sections_and_roles(client, campus):
    client.force_login(campus.ayesha)
    me = client.get("/api/me").json()
    assert me["institution"]["name"] == "Test University"
    assert [(s["course_code"], s["code"]) for s in me["sections"]] == [("CS-301", "3B")]
    client.force_login(campus.admin)
    assert client.get("/api/me").json()["roles"] == ["institution_admin"]


def test_csrf_endpoint_sets_cookie(client, db):
    response = client.get("/api/csrf")
    assert response.status_code == 200
    assert "csrftoken" in response.cookies
