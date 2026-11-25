"""CR and GR: who may name them, and the path a cancel, shift or attendance takes."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from apps.attendance.models import AttendanceSession
from apps.classreps import services
from apps.classreps.models import ClassRep, RepBlock, RepRequest
from apps.enrollment.models import SectionEnrollment
from apps.identity.models import User
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
    """Section 3B with a Monday lecture, Ayesha as CR and Sana as GR."""
    sana = User.objects.create_user(email="sana@test.edu", password="x", kind=User.Kind.STUDENT,
                                    institution=campus.inst)
    SectionEnrollment.objects.create(institution=campus.inst, section=campus.s3b, student=sana)
    meeting = ClassMeeting.objects.create(institution=campus.inst, section=campus.s3b, weekday=0,
                                          starts_at=time(10, 0), ends_at=time(11, 0))
    services.set_rep(campus.teacher, campus.s3b, campus.ayesha, "cr")
    services.set_rep(campus.teacher, campus.s3b, sana, "gr")
    campus.sana, campus.meeting = sana, meeting
    # A Monday in the term, well ahead of now.
    day = date(2026, 12, 7)
    campus.day = day
    return campus


def titles(user):
    return list(Notification.objects.filter(recipient=user).values_list("title", flat=True))


def test_teachers_and_admins_name_reps_students_cannot(campus):
    with pytest.raises(PermissionDenied):
        services.set_rep(campus.ayesha, campus.s3b, campus.ayesha, "cr")
    services.set_rep(campus.admin, campus.s3b, campus.ayesha, "cr")
    assert services.rep_role(campus.ayesha, campus.s3b) == "cr"
    assert "You're the CR of 3B" in titles(campus.ayesha)
    with pytest.raises(ValidationError, match="isn't in this section"):
        services.set_rep(campus.teacher, campus.s3b, campus.hamza, "gr")  # Hamza is in 3C
    services.set_rep(campus.teacher, campus.s3b, campus.ayesha, None)
    assert services.rep_role(campus.ayesha, campus.s3b) is None


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
