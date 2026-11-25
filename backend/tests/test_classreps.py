"""CR and GR: who may name them, and the path a cancel, shift or attendance takes."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from apps.academic.models import CohortMember, Program
from apps.attendance.models import AttendanceSession
from apps.classreps import services
from apps.classreps.models import ClassRep, RepBlock, RepRequest
from apps.enrollment.models import SectionEnrollment
from apps.identity.models import RoleAssignment, User
from apps.notifications.models import Notification
from apps.scheduling.models import ClassMeeting, ScheduleChange
from apps.scheduling.reminders import send_lecture_reminders

TZ = ZoneInfo("Asia/Karachi")


@pytest.fixture
def freezer(monkeypatch):
    """Sets the clock: move_to('2026-12-01 09:00') (Lahore time) or an aware datetime."""
    from django.utils import timezone

    class Clock:
        now = None

        def move_to(self, when):
            if isinstance(when, str):
                when = datetime.fromisoformat(when).replace(tzinfo=TZ)
            self.now = when

    clock = Clock()
    real = timezone.now
    monkeypatch.setattr(timezone, "now", lambda: clock.now or real())
    return clock


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


@pytest.fixture
def klass(campus):
    """Section 3B with a Monday lecture, Ayesha as CR and Sana as GR (the admin chose them)."""
    sana = User.objects.create_user(email="sana@test.edu", password="x", kind=User.Kind.STUDENT,
                                    institution=campus.inst)
    SectionEnrollment.objects.create(institution=campus.inst, section=campus.s3b, student=sana)
    CohortMember.objects.create(institution=campus.inst, cohort=campus.c3b, student=sana)
    meeting = ClassMeeting.objects.create(institution=campus.inst, section=campus.s3b, weekday=0,
                                          starts_at=time(10, 0), ends_at=time(11, 0))
    services.set_rep(campus.admin, campus.c3b, campus.term, campus.ayesha, "cr")
    services.set_rep(campus.admin, campus.c3b, campus.term, sana, "gr")
    campus.sana, campus.meeting = sana, meeting
    # A Monday in the term, well ahead of now.
    day = date(2026, 12, 7)
    campus.day = day
    return campus


def titles(user):
    return list(Notification.objects.filter(recipient=user).values_list("title", flat=True))


def coordinator_of(campus):
    """A CS coordinator, with section 3B in a CS program so it's theirs to manage."""
    program = Program.objects.create(institution=campus.inst, department=campus.cs,
                                     name="BS Computer Science", code="BSCS")
    campus.c3b.program = program
    campus.c3b.save()
    coord = User.objects.create_user(email="coord@test.edu", password="x",
                                     kind=User.Kind.TEACHER, institution=campus.inst)
    RoleAssignment.objects.create(institution=campus.inst, user=coord, department=campus.cs,
                                  role=RoleAssignment.Role.DEPARTMENT_COORDINATOR)
    return coord


def test_admins_and_coordinators_name_reps_teachers_and_students_cannot(campus):
    for who in (campus.ayesha, campus.teacher):
        with pytest.raises(PermissionDenied):
            services.set_rep(who, campus.c3b, campus.term, campus.ayesha, "cr")
    services.set_rep(campus.admin, campus.c3b, campus.term, campus.ayesha, "cr")
    assert services.rep_role(campus.ayesha, campus.s3b) == "cr"
    assert "You're the CR of 3B" in titles(campus.ayesha)
    with pytest.raises(ValidationError, match="isn't in this section"):
        services.set_rep(campus.admin, campus.c3b, campus.term, campus.hamza, "gr")  # in 3C
    coord = coordinator_of(campus)
    services.set_rep(coord, campus.c3b, campus.term, campus.ayesha, None)
    assert services.rep_role(campus.ayesha, campus.s3b) is None
    with pytest.raises(PermissionDenied):  # 3C has no program in their department
        services.set_rep(coord, campus.c3c, campus.term, campus.hamza, "cr")


def test_one_cr_per_section_and_replacing_tells_everyone(klass, client):
    """Ayesha is CR (the admin chose her); a coordinator naming Sana CR must say "replace"."""
    coord = coordinator_of(klass)
    with pytest.raises(services.RoleTaken,
                       match=r"ayesha@test\.edu is already the CR of 3B \(chosen by"):
        services.set_rep(coord, klass.c3b, klass.term, klass.sana, "cr")
    assert services.rep_role(klass.ayesha, klass.s3b) == "cr"

    client.force_login(coord)
    url = f"/api/manage/sections/{klass.c3b.pk}/reps"
    body = {"term_id": klass.term.pk, "student_id": klass.sana.pk, "role": "cr"}
    r = client.put(url, body, content_type="application/json")
    assert r.status_code == 409 and "already the CR" in r.json()["detail"]
    r = client.put(url, body | {"replace": True}, content_type="application/json")
    assert r.status_code == 200
    assert [(x["student_id"], x["role"]) for x in r.json()["reps"]] == [(klass.sana.pk, "cr")]
    assert services.rep_role(klass.ayesha, klass.s3b) is None
    assert "You're no longer the CR of 3B" in titles(klass.ayesha)
    assert "3B has a new CR" in titles(klass.admin)  # who chose Ayesha
    # Sana went from GR to CR, so the section has no GR now, and a new one needs no "replace".
    services.set_rep(coord, klass.c3b, klass.term, klass.ayesha, "gr")
    assert services.rep_role(klass.ayesha, klass.s3b) == "gr"

    # Teachers see the subject's CR/GR; they can't change it.
    client.force_login(klass.teacher)
    seen = client.get(f"/api/reps/sections/{klass.s3b.pk}").json()
    assert {(x["name"], x["role"]) for x in seen} == {("sana@test.edu", "cr"),
                                                     ("ayesha@test.edu", "gr")}
    assert client.put(url, body, content_type="application/json").status_code == 403


def test_trusted_change_applies_at_once_and_asks_the_teacher(klass, freezer):
    freezer.move_to("2026-12-01 09:00")
    services.set_without_approval(klass.teacher, True)
    req = services.request_change(klass.ayesha, meeting=klass.meeting, day=klass.day,
                                  action="cancel", note="Sports day")
    assert req.stage == RepRequest.Stage.APPLIED
    assert ScheduleChange.objects.get(meeting=klass.meeting, date=klass.day).status == "cancelled"
    assert "Your lecture was cancelled on CR call" in titles(klass.teacher)


def test_teacher_approval_and_the_15_minute_rule(klass, freezer):
    freezer.move_to("2026-12-01 09:00")
    req = services.request_change(klass.ayesha, meeting=klass.meeting, day=klass.day,
                                  action="shift", new_date=klass.day + timedelta(days=1),
                                  new_starts_at=time(12, 0), new_ends_at=time(13, 0))
    assert req.stage == RepRequest.Stage.TEACHER_APPROVAL
    assert not ScheduleChange.objects.exists()
    with pytest.raises(PermissionDenied):
        services.teacher_decide(klass.ayesha, req, True)
    services.teacher_decide(klass.teacher, req, True)
    assert ScheduleChange.objects.get(meeting=klass.meeting).status == "moved"

    # 10 minutes before a lecture is too late to ask.
    start = datetime.combine(klass.day + timedelta(days=7), time(10, 0), tzinfo=TZ)
    freezer.move_to(start - timedelta(minutes=10))
    with pytest.raises(ValidationError, match="15"):
        services.request_change(klass.ayesha, meeting=klass.meeting,
                                day=klass.day + timedelta(days=7), action="cancel")


def test_waiting_requests_lapse_15_minutes_before(klass, freezer):
    freezer.move_to("2026-12-01 09:00")
    req = services.request_change(klass.ayesha, meeting=klass.meeting, day=klass.day,
                                  action="cancel")
    start = datetime.combine(klass.day, time(10, 0), tzinfo=TZ)
    freezer.move_to(start - timedelta(minutes=14))
    assert services.expire_overdue() == 1
    req.refresh_from_db()
    assert req.stage == RepRequest.Stage.EXPIRED


def test_gr_cancel_needs_a_cr_but_gr_shift_does_not(klass, freezer):
    freezer.move_to("2026-12-01 09:00")
    services.set_without_approval(klass.teacher, True)
    req = services.request_change(klass.sana, meeting=klass.meeting, day=klass.day,
                                  action="cancel")
    assert req.stage == RepRequest.Stage.CR_APPROVAL
    with pytest.raises(PermissionDenied):
        services.cr_decide(klass.sana, req, True)  # not her own
    services.cr_decide(klass.ayesha, req, True)
    req.refresh_from_db()
    assert req.stage == RepRequest.Stage.APPLIED

    shift = services.request_change(klass.sana, meeting=klass.meeting,
                                    day=klass.day + timedelta(days=7), action="shift",
                                    new_date=klass.day + timedelta(days=8))
    assert shift.stage == RepRequest.Stage.APPLIED


def test_i_didnt_know_undoes_and_takes_power_back(klass, freezer):
    freezer.move_to("2026-12-01 09:00")
    services.set_without_approval(klass.teacher, True)
    req = services.request_change(klass.ayesha, meeting=klass.meeting, day=klass.day,
                                  action="cancel")
    services.teacher_reply(klass.teacher, req, known=False)
    req.refresh_from_db()
    assert req.stage == RepRequest.Stage.UNDONE
    assert not ScheduleChange.objects.exists()
    assert RepBlock.objects.filter(teacher=klass.teacher, rep=klass.ayesha).exists()
    assert any("back on" in t for t in titles(klass.sana))
    with pytest.raises(PermissionDenied, match="taken back"):
        services.request_change(klass.ayesha, meeting=klass.meeting,
                                day=klass.day + timedelta(days=7), action="cancel")
    services.unblock(klass.teacher, klass.ayesha.pk)
    services.request_change(klass.ayesha, meeting=klass.meeting,
                            day=klass.day + timedelta(days=7), action="cancel")


def test_rep_attendance_waits_for_the_teacher(klass, freezer, settings):
    from apps.attendance import services as attendance

    klass.inst.attendance_enabled = True
    klass.inst.save()
    freezer.move_to("2026-12-07 12:00")
    klass.ayesha.refresh_from_db()
    session = attendance.save(klass.ayesha, klass.s3b, klass.day, klass.meeting.pk,
                              {klass.sana.pk: ("present", "")})
    session.refresh_from_db()
    assert session.confirmed is False
    req = RepRequest.objects.get(action="attendance")
    services.teacher_decide(klass.teacher, req, True)
    session.refresh_from_db()
    assert session.confirmed is True
    assert AttendanceSession.objects.count() == 1


def test_reminders_reach_the_teacher_first_then_students(klass, freezer):
    start = datetime.combine(klass.day, time(10, 0), tzinfo=TZ)
    freezer.move_to(start - timedelta(minutes=13))
    send_lecture_reminders()
    assert any("Your lecture" in t for t in titles(klass.teacher))
    assert not any("starts in" in t for t in titles(klass.ayesha))
    freezer.move_to(start - timedelta(minutes=8))
    send_lecture_reminders()
    send_lecture_reminders()  # a second run sends nothing new
    assert sum("starts in" in t for t in titles(klass.ayesha)) == 1
    assert sum("Your lecture" in t for t in titles(klass.teacher)) == 1
    assert ClassRep.objects.count() == 2


def test_api_flow(client, klass, freezer):
    freezer.move_to("2026-12-01 09:00")
    client.force_login(klass.ayesha)
    assert client.get("/api/reps/mine").json()["sections"] == {str(klass.s3b.pk): "cr"}
    r = client.post("/api/reps/requests", {"meeting_id": klass.meeting.pk,
                                           "date": klass.day.isoformat(), "action": "cancel"},
                    content_type="application/json")
    assert r.status_code == 201 and r.json()["stage"] == "teacher_approval"
    client.force_login(klass.teacher)
    listed = client.get("/api/reps/requests").json()
    assert listed[0]["can_decide"] is True
    r = client.post(f"/api/reps/requests/{listed[0]['id']}/decide", {"approve": False},
                    content_type="application/json")
    assert r.json()["stage"] == "declined"
    r = client.put("/api/reps/settings", {"without_approval": True},
                   content_type="application/json")
    assert r.json()["without_approval"] is True
