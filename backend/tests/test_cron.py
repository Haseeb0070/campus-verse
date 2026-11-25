"""POST /api/cron: the scheduled jobs, for hosts with no Celery beat."""

from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from apps.notices import services
from apps.notices.models import Notice

SECRET = "a-long-random-cron-secret-for-tests"


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


def call(secret=None):
    headers = {"HTTP_AUTHORIZATION": f"Bearer {secret}"} if secret is not None else {}
    return Client().post("/api/cron", **headers)


@pytest.mark.django_db
def test_without_a_secret_configured_the_endpoint_does_not_exist(settings):
    settings.CAMPUSVERSE_CRON_SECRET = ""
    assert call("").status_code == 404
    assert call("anything").status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize("sent", [None, "", "wrong", SECRET + "x"])
def test_a_missing_or_wrong_secret_is_refused(settings, sent):
    settings.CAMPUSVERSE_CRON_SECRET = SECRET
    assert call(sent).status_code == 404


def test_the_right_secret_runs_every_job_and_publishes_due_notices(settings, campus, monkeypatch):
    settings.CAMPUSVERSE_CRON_SECRET = SECRET
    notice = services.schedule_notice(
        author=campus.teacher,
        notice=Notice(title="Lab moved", body="Lab 4 is in CS Lab 2."),
        targets=[("section", campus.s3b.pk)],
        publish_at=timezone.now() + timedelta(minutes=5),
    )
    Notice.objects.filter(pk=notice.pk).update(publish_at=timezone.now() - timedelta(minutes=1))

    response = call(SECRET)

    assert response.status_code == 200
    body = response.json()
    assert body["notices_published"] == 1
    assert set(body) == {
        "notices_published", "notifications", "sources_synced", "emails_sent", "files_removed",
        "reminders", "requests_lapsed",
    }
    notice.refresh_from_db()
    assert notice.status == "published"


def test_one_failing_job_does_not_stop_the_others(settings, campus, monkeypatch):
    settings.CAMPUSVERSE_CRON_SECRET = SECRET

    def boom():
        raise RuntimeError("sync source is down")

    monkeypatch.setattr("apps.administration.tasks.run_due_sources", boom)
    body = call(SECRET).json()
    assert body["sources_synced"] == "failed"
    assert body["notices_published"] == 0


def test_the_frequent_timer_runs_reminders_and_lapses(client, settings, campus):
    settings.CAMPUSVERSE_CRON_SECRET = SECRET
    assert client.post("/api/cron/frequent").status_code == 404
    r = client.post("/api/cron/frequent", HTTP_AUTHORIZATION=f"Bearer {SECRET}")
    assert r.status_code == 200 and set(r.json()) == {"reminders", "requests_lapsed"}
