"""Authors edit their notices and attach files; files reach only the notice's audience."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.notices.models import Notice
from apps.notices.services import publish_notice

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"


@pytest.fixture(autouse=True)
def private_media(settings, tmp_path, monkeypatch):
    settings.MEDIA_ROOT = tmp_path
    monkeypatch.setattr("apps.core.realtime.publish", lambda channel, data: None)
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


def published(campus):
    return publish_notice(
        author=campus.teacher, notice=Notice(title="Quiz 3", body="Lists only."),
        targets=[("section", campus.s3b.pk)], notify=False,
    )


def test_author_edits_a_published_notice(client, campus):
    notice = published(campus)
    url = f"/api/notices/{notice.pk}"
    body = {"title": "Quiz 3 moved", "body": "Lists and stacks. Thursday.", "priority": "important"}

    client.force_login(campus.ayesha)
    assert client.patch(url, body, content_type="application/json").status_code == 403

    client.force_login(campus.teacher)
    res = client.patch(url, body, content_type="application/json")
    assert res.status_code == 200
    assert res.json()["title"] == "Quiz 3 moved" and res.json()["edited_at"]
    blank = client.patch(url, {**body, "title": " "}, content_type="application/json")
    assert blank.status_code == 422

    client.force_login(campus.ayesha)
    [seen] = client.get("/api/notices").json()
    assert seen["title"] == "Quiz 3 moved" and seen["priority"] == "important"


def test_files_reach_only_the_audience(client, campus):
    notice = published(campus)
    client.force_login(campus.teacher)
    pdf = SimpleUploadedFile("slides.pdf", PDF, content_type="application/pdf")
    res = client.post(f"/api/notices/{notice.pk}/attachments", {"file": pdf})
    assert res.status_code == 201
    file_id = res.json()["id"]

    client.force_login(campus.ayesha)  # in 3B: sees it
    assert client.get("/api/notices").json()[0]["attachments"][0]["name"] == "slides.pdf"
    assert client.get(f"/api/notices/files/{file_id}").status_code == 200
    client.force_login(campus.hamza)  # in 3C: doesn't
    assert client.get(f"/api/notices/files/{file_id}").status_code == 404

    client.force_login(campus.teacher)
    assert client.delete(f"/api/notices/{notice.pk}/attachments/{file_id}").status_code == 204
    client.force_login(campus.ayesha)
    assert client.get(f"/api/notices/files/{file_id}").status_code == 404
