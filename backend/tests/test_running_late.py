"""A teacher running late tells the class; CR/GR can't, and it's only for today's class."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from apps.notifications.models import Notification
from apps.scheduling.models import ClassMeeting, LateNotice
from apps.scheduling.services import mark_late, occurrences

TZ = ZoneInfo("Asia/Karachi")


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


@pytest.fixture
def lecture(campus, monkeypatch):
    """A Monday 10:00 lecture; the clock set to that Monday at 10:05."""
    from django.utils import timezone

    day = datetime(2026, 12, 7, 10, 5, tzinfo=TZ)
    monkeypatch.setattr(timezone, "now", lambda: day)
    import apps.scheduling.services as svc

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return day.astimezone(tz) if tz else day

    monkeypatch.setattr(svc, "datetime", FrozenDatetime)
    meeting = ClassMeeting.objects.create(institution=campus.inst, section=campus.s3b, weekday=0,
                                          starts_at=time(10, 0), ends_at=time(11, 0))
    return meeting, day.date()


def test_teacher_running_late_tells_students_and_shows(campus, lecture):
    meeting, day = lecture
    mark_late(campus.teacher, meeting=meeting, day=day, minutes=10, note="Stuck in traffic")
    note = Notification.objects.get(recipient=campus.ayesha)
    assert note.title == "Data Structures starts 10 min late"
    assert "10:10 instead of 10:00" in note.body and "Stuck in traffic" in note.body
    occ = [o for o in occurrences(campus.ayesha, day, 1) if o.meeting_id == meeting.pk][0]
    assert occ.late_minutes == 10
    mark_late(campus.teacher, meeting=meeting, day=day, minutes=0)
    assert not LateNotice.objects.exists()
    assert Notification.objects.filter(recipient=campus.ayesha,
                                       title="Data Structures starts on time").exists()


def test_only_teachers_and_only_on_the_day(campus, lecture):
    meeting, day = lecture
    with pytest.raises(PermissionDenied):
        mark_late(campus.ayesha, meeting=meeting, day=day, minutes=10)
    with pytest.raises(ValidationError):
        mark_late(campus.teacher, meeting=meeting, day=day + timedelta(days=7), minutes=10)
    with pytest.raises(ValidationError):
        mark_late(campus.teacher, meeting=meeting, day=day, minutes=7)
