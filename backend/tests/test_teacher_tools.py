from datetime import date, time

import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from apps.core.audience import audience_options, reach
from apps.enrollment.models import TeacherAssignment
from apps.governance.models import AuditLog
from apps.identity.models import User
from apps.notices.models import Notice
from apps.scheduling.models import ClassMeeting, Room, ScheduleChange
from apps.scheduling.services import ScheduleConflict, change_class, occurrences, undo_change

THURSDAY = date(2026, 11, 5)
MONDAY = date(2026, 11, 9)
S = ScheduleChange.Status


@pytest.fixture
def rooms(campus):
    return {
        code: Room.objects.create(institution=campus.inst, code=code)
        for code in ("B-204", "B-210", "B-301")
    }


@pytest.fixture
def meetings(campus, rooms):
    def meet(section, weekday, start, end, room):
        return ClassMeeting.objects.create(
            institution=campus.inst, section=section, weekday=weekday,
            starts_at=start, ends_at=end, room=rooms[room],
        )

    return {
        "3b_thu": meet(campus.s3b, 3, time(10, 30), time(11, 50), "B-204"),
        "3c_thu": meet(campus.s3c, 3, time(10, 30), time(11, 50), "B-210"),
    }


def visible(user):
    return set(Notice.objects.published().visible_to(user).values_list("title", flat=True))


# Class changes -------------------------------------------------------------------------------


def test_teacher_cancels_their_class_and_notifies_the_section(campus, meetings):
    change = change_class(
        campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY, status=S.CANCELLED,
        note="I'm at a conference", notify=True,
    )
    occ = occurrences(campus.ayesha, THURSDAY, 1)
    assert [(o.course_code, o.status, o.change_id) for o in occ] == [
        ("CS-301", "cancelled", change.pk)
    ]
    assert visible(campus.ayesha) == {"Data Structures on Thu 05 Nov is cancelled"}
    assert visible(campus.hamza) == set()
    assert AuditLog.objects.filter(action="schedule.changed", actor=campus.teacher).exists()


def test_only_people_who_manage_the_section_can_change_it(campus, meetings):
    with pytest.raises(PermissionDenied):
        change_class(campus.teacher, meeting=meetings["3c_thu"], day=THURSDAY, status=S.CANCELLED)
    with pytest.raises(PermissionDenied):
        change_class(campus.ayesha, meeting=meetings["3b_thu"], day=THURSDAY, status=S.CANCELLED)
    # Institution admins may change any class.
    change_class(campus.admin, meeting=meetings["3c_thu"], day=THURSDAY, status=S.CANCELLED)


def test_change_must_target_a_real_occurrence(campus, meetings):
    with pytest.raises(ValidationError, match="doesn't meet"):
        change_class(campus.teacher, meeting=meetings["3b_thu"], day=MONDAY, status=S.CANCELLED)
    with pytest.raises(ValidationError, match="within the term"):
        change_class(campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY, status=S.MOVED,
                     new_date=date(2027, 2, 1))
    with pytest.raises(ValidationError, match="end after"):
        change_class(campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY, status=S.MOVED,
                     new_date=MONDAY, new_starts_at=time(15, 0), new_ends_at=time(14, 0))


def test_room_change_detects_double_booking(campus, meetings, rooms):
    with pytest.raises(ScheduleConflict) as err:
        change_class(campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY,
                     status=S.ROOM_CHANGED, new_room=rooms["B-210"])
    assert err.value.messages == ["B-210 is already booked for CS-301 · 3C (10:30–11:50)."]

    change_class(campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY,
                 status=S.ROOM_CHANGED, new_room=rooms["B-301"])
    assert occurrences(campus.ayesha, THURSDAY, 1)[0].room == "B-301"


def test_cancelled_classes_free_their_room(campus, meetings, rooms):
    change_class(campus.admin, meeting=meetings["3c_thu"], day=THURSDAY, status=S.CANCELLED)
    change_class(campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY,
                 status=S.ROOM_CHANGED, new_room=rooms["B-210"])


def test_move_detects_teacher_double_booking(campus, meetings, rooms):
    TeacherAssignment.objects.create(institution=campus.inst, section=campus.s3c,
                                     teacher=campus.teacher)
    ClassMeeting.objects.create(institution=campus.inst, section=campus.s3c, weekday=0,
                                starts_at=time(9, 0), ends_at=time(10, 20), room=rooms["B-301"])
    with pytest.raises(ScheduleConflict, match="teacher is already teaching CS-301 · 3C"):
        change_class(campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY, status=S.MOVED,
                     new_date=MONDAY, new_starts_at=time(9, 30), new_ends_at=time(10, 50))

    change_class(campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY, status=S.MOVED,
                 new_date=MONDAY, new_starts_at=time(11, 0), new_ends_at=time(12, 20))
    week = occurrences(campus.ayesha, THURSDAY, 5)
    assert [(o.date, o.status) for o in week] == [(THURSDAY, "moved"), (MONDAY, "rescheduled")]


def test_a_new_change_replaces_the_old_one_and_undo_restores(campus, meetings, rooms):
    change_class(campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY, status=S.CANCELLED)
    change = change_class(campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY,
                          status=S.ROOM_CHANGED, new_room=rooms["B-301"])
    assert ScheduleChange.objects.count() == 1
    undo_change(campus.teacher, change)
    assert occurrences(campus.ayesha, THURSDAY, 1)[0].status == "scheduled"
    assert AuditLog.objects.filter(action="schedule.change_undone").count() == 1


def test_change_api(client, campus, meetings, rooms):
    client.force_login(campus.teacher)
    rows = client.get("/api/timetable", {"start": THURSDAY.isoformat()}).json()
    assert rows[0]["can_manage"] is True

    url = "/api/timetable/changes"
    clash = client.post(url, {"meeting_id": meetings["3b_thu"].pk, "date": "2026-11-05",
                              "status": "room_changed", "new_room_id": rooms["B-210"].pk},
                        content_type="application/json")
    assert clash.status_code == 409
    assert clash.json()["conflicts"] == ["B-210 is already booked for CS-301 · 3C (10:30–11:50)."]

    ok = client.post(url, {"meeting_id": meetings["3b_thu"].pk, "date": "2026-11-05",
                           "status": "cancelled", "notify": True},
                     content_type="application/json")
    assert ok.status_code == 201
    assert client.delete(f"{url}/{ok.json()['id']}").status_code == 204

    client.force_login(campus.ayesha)
    rows = client.get("/api/timetable", {"start": THURSDAY.isoformat()}).json()
    assert rows[0]["can_manage"] is False
    denied = client.post(url, {"meeting_id": meetings["3b_thu"].pk, "date": "2026-11-05",
                               "status": "cancelled"}, content_type="application/json")
    assert denied.status_code == 403


# Notices -------------------------------------------------------------------------------------


def test_audience_options_follow_permissions(campus):
    assert [o["key"] for o in audience_options(campus.teacher)] == [f"section:{campus.s3b.pk}"]
    admin_keys = [o["key"] for o in audience_options(campus.admin)]
    assert admin_keys == [
        f"institution:{campus.inst.pk}", f"department:{campus.cs.pk}",
        f"section:{campus.s3b.pk}", f"section:{campus.s3c.pk}",
    ]
    assert audience_options(campus.ayesha) == []
    # 3B: Ayesha and her teacher. The department adds Hamza in 3C.
    assert reach([("section", campus.s3b.pk)], campus.inst.pk) == 2
    assert reach([("department", campus.cs.pk)], campus.inst.pk) == 3


def test_draft_publish_archive_flow(client, campus):
    client.force_login(campus.teacher)
    target = f"section:{campus.s3b.pk}"
    created = client.post("/api/notices", {"title": "Lab 3 brief", "body": "Due Friday",
                                           "targets": [target], "publish": False},
                          content_type="application/json")
    assert created.status_code == 201
    draft = created.json()
    assert (draft["status"], draft["reach"], draft["targets"][0]["label"]) == (
        "draft", 2, "CS-301 · 3B"
    )
    assert visible(campus.ayesha) == set()

    assert client.post(f"/api/notices/{draft['id']}/publish").status_code == 200
    assert visible(campus.ayesha) == {"Lab 3 brief"}
    assert [n["status"] for n in client.get("/api/notices/mine").json()] == ["published"]

    assert client.post(f"/api/notices/{draft['id']}/archive").status_code == 204
    assert visible(campus.ayesha) == set()


def test_notice_api_rejects_audiences_you_dont_teach_and_bad_input(client, campus):
    client.force_login(campus.teacher)
    other = f"section:{campus.s3c.pk}"
    denied = client.post("/api/notices", {"title": "Hi", "body": "x", "targets": [other]},
                         content_type="application/json")
    assert denied.status_code == 403
    assert client.get("/api/notices/reach", {"targets": [other]}).status_code == 403
    empty = client.post("/api/notices", {"title": " ", "body": "x",
                                         "targets": [f"section:{campus.s3b.pk}"]},
                        content_type="application/json")
    assert (empty.status_code, empty.json()["detail"]) == (422, "Give the notice a title.")
    assert client.post("/api/notices", {"title": "Hi", "body": "x", "targets": ["nope:1"]},
                       content_type="application/json").status_code == 422


def test_only_the_author_publishes_a_draft(client, campus):
    other_teacher = User.objects.create_user(email="farah@test.edu", password="x" * 12,
                                             kind=User.Kind.TEACHER, institution=campus.inst)
    TeacherAssignment.objects.create(institution=campus.inst, section=campus.s3b,
                                     teacher=other_teacher)
    client.force_login(campus.teacher)
    draft = client.post("/api/notices", {"title": "Draft", "body": "x", "publish": False,
                                         "targets": [f"section:{campus.s3b.pk}"]},
                        content_type="application/json").json()
    client.force_login(other_teacher)
    assert client.post(f"/api/notices/{draft['id']}/publish").status_code == 403


# Sections and rosters ------------------------------------------------------------------------


def test_roster_is_only_for_people_who_manage_the_section(client, campus):
    client.force_login(campus.teacher)
    teaching = client.get("/api/sections/teaching").json()
    assert [(s["code"], s["students"]) for s in teaching] == [("3B", 1)]
    roster = client.get(f"/api/sections/{campus.s3b.pk}/roster").json()
    assert [p["email"] for p in roster["students"]] == ["ayesha@test.edu"]
    assert [p["email"] for p in roster["teachers"]] == ["imran@test.edu"]
    assert client.get(f"/api/sections/{campus.s3c.pk}/roster").status_code == 404

    client.force_login(campus.ayesha)
    assert client.get(f"/api/sections/{campus.s3b.pk}/roster").status_code == 404
    assert client.get("/api/sections/teaching").json() == []

    client.force_login(campus.admin)
    assert client.get(f"/api/sections/{campus.s3c.pk}/roster").status_code == 200


def test_me_marks_sections_you_teach(client, campus):
    client.force_login(campus.teacher)
    assert [s["teaching"] for s in client.get("/api/me").json()["sections"]] == [True]


def test_conflict_check_ignores_the_class_being_moved(campus, meetings):
    # Moving 3B later the same day overlaps its own old slot; that must not count as a clash.
    change_class(campus.teacher, meeting=meetings["3b_thu"], day=THURSDAY, status=S.MOVED,
                 new_date=THURSDAY, new_starts_at=time(11, 0), new_ends_at=time(12, 20))
