from datetime import time, timedelta

import pytest
from django.utils import timezone

from apps.assignments import services as assignments
from apps.assignments.models import Assignment
from apps.notices.models import Notice
from apps.notices.services import publish_draft, publish_notice, save_draft
from apps.notifications import services
from apps.notifications.models import Notification
from apps.scheduling.models import ClassMeeting, Room, ScheduleChange
from apps.scheduling.services import change_class

K = Notification.Kind


@pytest.fixture(autouse=True)
def pushed(monkeypatch):
    """Capture live pushes instead of calling Centrifugo."""
    calls = []
    monkeypatch.setattr(
        "apps.core.realtime.broadcast", lambda channels, data: calls.append((channels, data))
    )
    return calls


@pytest.fixture
def run_commits(django_capture_on_commit_callbacks):
    """Execute on-commit hooks (fan-out, live push) the way a real request would."""
    return lambda: django_capture_on_commit_callbacks(execute=True)


def inbox(user):
    return list(Notification.objects.filter(recipient=user).values_list("kind", "title"))


def test_notice_reaches_its_audience_once_and_never_its_author(campus, pushed, run_commits):
    with run_commits():
        notice = publish_notice(author=campus.teacher, notice=Notice(title="Quiz moved",
                                body="Now Thursday"), targets=[("section", campus.s3b.pk)])
    assert inbox(campus.ayesha) == [(K.NOTICE, "Quiz moved")]
    assert inbox(campus.teacher) == [] and inbox(campus.hamza) == []
    assert pushed == [([f"user:#{campus.ayesha.pk}"], pushed[0][1])]
    assert pushed[0][1]["link"] == f"/notices#notice-{notice.pk}"

    # Retries (e.g. a re-queued task) never notify twice.
    assert services.notice_published(notice.pk) == 0
    assert Notification.objects.count() == 1


def test_drafts_notify_only_when_published(campus, run_commits):
    with run_commits():
        draft = save_draft(author=campus.teacher, notice=Notice(title="Draft", body="x"),
                           targets=[("section", campus.s3b.pk)])
    assert inbox(campus.ayesha) == []
    with run_commits():
        publish_draft(author=campus.teacher, notice=draft)
    assert inbox(campus.ayesha) == [(K.NOTICE, "Draft")]


def test_important_notices_say_so(campus, run_commits):
    with run_commits():
        publish_notice(author=campus.admin, notice=Notice(title="Campus closed", body="Storm",
                       priority="important"), targets=[("institution", campus.inst.pk)])
    assert inbox(campus.hamza) == [(K.NOTICE, "Important: Campus closed")]
    assert inbox(campus.outsider) == []


@pytest.fixture
def thursday_class(campus):
    room = Room.objects.create(institution=campus.inst, code="B-204")
    Room.objects.create(institution=campus.inst, code="B-301")
    return ClassMeeting.objects.create(institution=campus.inst, section=campus.s3b, weekday=3,
                                       starts_at=time(10, 30), ends_at=time(11, 50), room=room)


def test_class_change_notifies_once_even_with_an_auto_notice(campus, thursday_class, run_commits):
    from datetime import date

    with run_commits():
        change_class(campus.teacher, meeting=thursday_class, day=date(2026, 11, 5),
                     status=ScheduleChange.Status.CANCELLED, notify=True)
    assert inbox(campus.ayesha) == [(K.CLASS_CHANGED, "Data Structures on Thu 05 Nov is cancelled")]
    assert Notice.objects.count() == 1  # the notice was still posted, just without its own alert
    assert inbox(campus.teacher) == []


def test_a_changed_change_is_news_again(campus, thursday_class, run_commits):
    from datetime import date

    room = Room.objects.get(code="B-301")
    day = date(2026, 11, 5)
    with run_commits():
        change_class(campus.teacher, meeting=thursday_class, day=day,
                     status=ScheduleChange.Status.CANCELLED)
    with run_commits():
        change_class(campus.teacher, meeting=thursday_class, day=day,
                     status=ScheduleChange.Status.ROOM_CHANGED, new_room=room)
    assert [k for k, _ in inbox(campus.ayesha)] == [K.CLASS_CHANGED, K.CLASS_CHANGED]


def make_assignment(campus, **kw):
    now = timezone.now()
    fields = {"title": "Lab 3", "available_from": now - timedelta(hours=1),
              "due_at": now + timedelta(days=3)} | kw
    return assignments.create_assignment(campus.teacher, section=campus.s3b, **fields)


def test_open_assignment_is_announced_to_students(campus, run_commits):
    with run_commits():
        make_assignment(campus)
    assert inbox(campus.ayesha) == [(K.ASSIGNMENT_OPENED, "New assignment: Lab 3")]
    assert inbox(campus.teacher) == []
    with run_commits():
        make_assignment(campus, title="Draft", status=Assignment.Status.DRAFT)
    assert len(inbox(campus.ayesha)) == 1


def test_future_assignment_is_announced_when_it_opens(campus, run_commits):
    with run_commits():
        a = make_assignment(campus, available_from=timezone.now() + timedelta(days=1),
                            due_at=timezone.now() + timedelta(days=4))
    assert inbox(campus.ayesha) == []
    assert services.send_scheduled() == {"opened": 0, "reminded": 0}

    Assignment.objects.filter(pk=a.pk).update(available_from=timezone.now() - timedelta(minutes=1))
    with run_commits():
        assert services.send_scheduled()["opened"] == 1
    assert services.send_scheduled()["opened"] == 0  # every 5 minutes, but only once
    assert inbox(campus.ayesha) == [(K.ASSIGNMENT_OPENED, "New assignment: Lab 3")]


def test_deadline_reminder_only_for_students_who_havent_submitted(campus, run_commits):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from apps.enrollment.models import SectionEnrollment

    SectionEnrollment.objects.create(institution=campus.inst, section=campus.s3b,
                                     student=campus.hamza)
    a = make_assignment(campus, due_at=timezone.now() + timedelta(hours=10))
    assignments.submit(campus.hamza, a, uploads=[SimpleUploadedFile("a.pdf", b"%PDF-1.4 x")])

    assert services.send_scheduled()["reminded"] == 1
    assert services.send_scheduled()["reminded"] == 0
    assert (K.ASSIGNMENT_DUE_SOON, "Lab 3 is due soon") in inbox(campus.ayesha)
    assert K.ASSIGNMENT_DUE_SOON not in [k for k, _ in inbox(campus.hamza)]


def test_released_grades_are_announced(campus, run_commits):
    a = make_assignment(campus)
    with run_commits():
        assignments.release_grades(campus.teacher, a)
    assert (K.GRADES_RELEASED, "Grades are out for Lab 3") in inbox(campus.ayesha)


def test_failed_live_delivery_keeps_the_notification(campus, monkeypatch, run_commits):
    def down(channels, data):
        raise ConnectionError("Centrifugo is down")

    monkeypatch.setattr("apps.core.realtime.broadcast", down)
    with run_commits():
        publish_notice(author=campus.teacher, notice=Notice(title="Still saved", body="x"),
                       targets=[("section", campus.s3b.pk)])
    assert inbox(campus.ayesha) == [(K.NOTICE, "Still saved")]


def test_api_lists_and_marks_only_your_own(client, campus, run_commits):
    with run_commits():
        for title in ("One", "Two"):
            publish_notice(author=campus.admin, notice=Notice(title=title, body="x"),
                           targets=[("institution", campus.inst.pk)])
    client.force_login(campus.ayesha)
    data = client.get("/api/notifications").json()
    assert (data["unread"], [n["title"] for n in data["items"]]) == (2, ["Two", "One"])
    hamzas = Notification.objects.filter(recipient=campus.hamza).values_list("pk", flat=True)

    first = data["items"][0]["id"]
    marked = client.post("/api/notifications/read", {"ids": [first, *hamzas]},
                         content_type="application/json").json()
    assert marked == {"updated": 1}  # Hamza's IDs were ignored
    assert client.get("/api/notifications").json()["unread"] == 1
    client.post("/api/notifications/read", {}, content_type="application/json")
    assert client.get("/api/notifications").json()["unread"] == 0

    client.force_login(campus.hamza)
    assert client.get("/api/notifications").json()["unread"] == 2
