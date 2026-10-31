from datetime import timedelta

import pytest
from django.core.exceptions import PermissionDenied
from django.utils import timezone

from apps.administration import reports
from apps.assignments.models import Assignment, Submission
from apps.feed.services import create_post
from apps.notices.models import Notice
from apps.notices.services import publish_notice
from apps.notifications.models import Notification
from apps.resources.models import Resource, ResourceDownload


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


def test_only_admins_see_reports(campus):
    with pytest.raises(PermissionDenied):
        reports.build(campus.teacher)


def test_report_counts_and_rates(campus, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        notice = publish_notice(author=campus.teacher, targets=[("section", campus.s3b.pk)],
                                notice=Notice(title="Quiz Thursday", body="Bring a pencil."))
    Notification.objects.filter(recipient=campus.ayesha).update(read_at=timezone.now())
    now = timezone.now()
    work = Assignment.objects.create(
        institution=campus.inst, section=campus.s3b, title="Lab 1", created_by=campus.teacher,
        available_from=now - timedelta(days=5), due_at=now - timedelta(days=1),
    )
    Submission.objects.create(institution=campus.inst, assignment=work, student=campus.ayesha,
                              attempt=1, text="done")
    create_post(campus.ayesha, body="Anyone up for revision?", targets=[("section", campus.s3b.pk)])
    resource = Resource.objects.create(institution=campus.inst, offering=campus.offering,
                                       title="Week 1 slides", url="https://example.com",
                                       created_by=campus.teacher)
    for user in (campus.ayesha, campus.ayesha, campus.teacher):
        ResourceDownload.objects.create(institution=campus.inst, resource=resource, user=user)

    r = reports.build(campus.admin, 30)
    assert r["people"]["students"] == 2 and r["people"]["teachers"] == 1
    (row,) = r["notices"]
    assert (row["title"], row["reached"], row["read"], row["read_rate"]) == (
        "Quiz Thursday", 1, 1, 100) and row["id"] == notice.pk
    (lab,) = r["assignments"]["rows"]
    assert (lab["students"], lab["submitted"], lab["submission_rate"]) == (1, 1, 100)
    assert r["assignments"]["submission_rate"] == 100
    assert r["resources"]["downloads"] == 3 and r["resources"]["people"] == 2
    assert r["resources"]["top"][0] == {"title": "Week 1 slides", "course": "CS-301",
                                        "downloads": 3, "people": 2}
    assert r["feed"]["posts"] == 1
    assert r["attendance"] is None  # not switched on
    week = r["activity"][2]["points"]
    assert sum(p["value"] for p in week) == 1  # the one submission lands in a bucket


def test_periods_shape_the_buckets(campus):
    assert len(reports.build(campus.admin, 7)["activity"][0]["points"]) == 7
    assert 12 <= len(reports.build(campus.admin, 90)["activity"][0]["points"]) <= 15
    assert reports.build(campus.admin, 13)["days"] == 30  # unknown periods fall back


def test_reports_api(client, campus):
    client.force_login(campus.admin)
    assert client.get("/api/manage/reports", {"days": 7}).json()["days"] == 7
    client.force_login(campus.teacher)
    assert client.get("/api/manage/reports").status_code == 403
