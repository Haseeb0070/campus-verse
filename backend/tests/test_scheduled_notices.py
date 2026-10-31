from datetime import timedelta

import pytest
from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone

from apps.governance.models import AuditLog
from apps.notices import services
from apps.notices.models import Notice
from apps.notifications.models import Notification


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


def later(**kw):
    return timezone.now() + timedelta(**kw)


def schedule(campus, when, **kw):
    return services.schedule_notice(
        author=campus.teacher, notice=Notice(title="Lab moved", body="Lab 4 is in CS Lab 2.", **kw),
        targets=[("section", campus.s3b.pk)], publish_at=when,
    )


def live_for(user):
    return list(Notice.objects.live().visible_to(user))


def test_scheduled_notices_go_out_on_time_and_notify_once(
    campus, django_capture_on_commit_callbacks
):
    when = later(hours=2)
    notice = schedule(campus, when)
    assert notice.status == "scheduled" and live_for(campus.ayesha) == []
    assert services.publish_due() == 0
    assert not Notification.objects.exists()  # nobody hears about it early

    with django_capture_on_commit_callbacks(execute=True):
        assert services.publish_due(now=when + timedelta(seconds=1)) == 1
    notice.refresh_from_db()
    assert (notice.status, notice.published_at) == ("published", when)
    assert live_for(campus.ayesha) == [notice]
    assert Notification.objects.filter(recipient=campus.ayesha).count() == 1
    assert services.publish_due(now=when + timedelta(minutes=5)) == 0  # never twice
    assert AuditLog.objects.filter(action="notice.published", changes__scheduled=True).exists()


@pytest.mark.parametrize(
    ("when", "kw", "error"),
    [
        (timedelta(minutes=-5), {}, "in the future"),
        (timedelta(days=400), {}, "up to a year"),
        (timedelta(hours=2), {"expires_at": later(hours=1)}, "take-down"),
    ],
)
def test_bad_times_are_refused(campus, when, kw, error):
    with pytest.raises(ValidationError, match=error):
        schedule(campus, timezone.now() + when, **kw)
    assert not Notice.objects.exists()


def test_expired_notices_drop_off_but_stay_with_the_author(campus, client):
    notice = services.publish_notice(
        author=campus.teacher, targets=[("section", campus.s3b.pk)], notify=False,
        notice=Notice(title="Room change today", body="B-210 instead of B-204.",
                      expires_at=later(hours=1)),
    )
    assert live_for(campus.ayesha) == [notice]
    Notice.objects.filter(pk=notice.pk).update(expires_at=later(minutes=-1))
    assert live_for(campus.ayesha) == []
    client.force_login(campus.ayesha)
    assert client.get("/api/notices").json() == []
    client.force_login(campus.teacher)
    mine = client.get("/api/notices/mine").json()
    assert [(n["status"], n["expired"]) for n in mine] == [("published", True)]


def test_unscheduling_and_rescheduling(campus):
    notice = schedule(campus, later(hours=3))
    with pytest.raises(PermissionDenied):
        services.unschedule(author=campus.admin, notice=notice)
    services.unschedule(author=campus.teacher, notice=notice)
    assert (notice.status, notice.publish_at) == ("draft", None)
    services.reschedule(author=campus.teacher, notice=notice, publish_at=later(days=1))
    assert notice.status == "scheduled"
    services.publish_draft(author=campus.teacher, notice=notice)  # "publish now" still works
    assert notice.status == "published" and notice.publish_at is None


def test_scheduling_through_the_api_and_lazy_publishing(client, campus):
    client.force_login(campus.teacher)
    to_3b = [f"section:{campus.s3b.pk}"]
    made = client.post("/api/notices", {
        "title": "Quiz moved", "body": "Quiz 4 is next Tuesday.", "targets": to_3b,
        "publish_at": later(hours=1).isoformat(), "expires_at": later(days=7).isoformat(),
    }, content_type="application/json")
    assert made.status_code == 201
    assert made.json()["status"] == "scheduled" and made.json()["publish_at"]

    client.force_login(campus.ayesha)
    assert client.get("/api/notices").json() == []
    # Time passes; no worker runs. The next page load publishes it.
    Notice.objects.update(publish_at=later(minutes=-1))
    assert [n["title"] for n in client.get("/api/notices").json()] == ["Quiz moved"]

    client.force_login(campus.teacher)
    past = client.post("/api/notices", {"title": "x", "body": "y", "targets": to_3b,
                                        "publish_at": later(hours=-1).isoformat()},
                       content_type="application/json")
    assert past.status_code == 422
