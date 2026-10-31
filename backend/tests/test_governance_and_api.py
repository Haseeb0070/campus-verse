import pytest
from django.core.exceptions import PermissionDenied

from apps.governance.models import AuditLog
from apps.notices.models import Notice
from apps.notices.services import publish_notice


def test_publishing_writes_an_audit_record_that_cannot_change(campus):
    notice = publish_notice(
        author=campus.teacher,
        notice=Notice(title="Lab 3 brief", body="Due Friday"),
        targets=[("section", campus.s3b.pk)],
    )
    log = AuditLog.objects.get(action="notice.published", target_id=str(notice.pk))
    assert log.actor == campus.teacher
    assert log.institution == campus.inst

    log.action = "tampered"
    with pytest.raises(PermissionDenied):
        log.save()
    with pytest.raises(PermissionDenied):
        log.delete()


def test_health_is_public(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_notices_api_needs_sign_in(client, db):
    assert client.get("/api/notices").status_code == 401


def test_notices_api_returns_only_visible_notices(client, campus):
    publish_notice(
        author=campus.teacher,
        notice=Notice(title="For 3B", body="..."),
        targets=[("section", campus.s3b.pk)],
    )
    client.force_login(campus.hamza)
    assert client.get("/api/notices").json() == []
    client.force_login(campus.ayesha)
    assert [n["title"] for n in client.get("/api/notices").json()] == ["For 3B"]
