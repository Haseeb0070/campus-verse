import uuid

import pytest
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.chat import services
from apps.chat.models import Conversation
from apps.core.models import StoredFile
from apps.notifications.models import Notification

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"


@pytest.fixture(autouse=True)
def quiet(monkeypatch, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    monkeypatch.setattr("apps.core.realtime.publish", lambda channel, data: None)
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


def pdf(name="notes.pdf"):
    return SimpleUploadedFile(name, PDF, content_type="application/pdf")


def send(user, conv, body="hi", **kw):
    return services.send_message(user, conv, body=body, client_id=uuid.uuid4(), **kw)[0]


def dms(user):
    return list(Notification.objects.filter(recipient=user, kind="message.direct")
                .values_list("title", flat=True))


def test_who_can_message_whom(campus):
    assert services.can_message(campus.ayesha, campus.teacher)  # shares 3B
    assert services.can_message(campus.ayesha, campus.admin)  # staff
    assert not services.can_message(campus.ayesha, campus.hamza)  # 3C: no shared class
    assert not services.can_message(campus.ayesha, campus.outsider)
    assert not services.can_message(campus.ayesha, campus.ayesha)
    assert services.can_message(campus.admin, campus.hamza)  # staff reach everyone
    names = [u.email for u in services.contacts(campus.ayesha)]
    assert "imran@test.edu" in names and "nadia@test.edu" in names
    assert "hamza@test.edu" not in names
    assert [u.email for u in services.contacts(campus.ayesha, q="imr")] == ["imran@test.edu"]
    with pytest.raises(PermissionDenied):
        services.start_direct(campus.ayesha, campus.hamza)


def test_each_pair_has_one_private_chat(campus):
    conv = services.start_direct(campus.ayesha, campus.teacher)
    assert services.start_direct(campus.teacher, campus.ayesha) == conv
    assert conv.kind == Conversation.Kind.DIRECT and conv.members.count() == 2
    assert services.other_member(campus.ayesha, conv) == campus.teacher
    with pytest.raises(Conversation.DoesNotExist):
        services.get_conversation_for(campus.admin, conv.pk)  # admins don't read private chats
    kinds = [s.conversation.kind for s in services.conversations_for(campus.ayesha)]
    assert "direct" in kinds and "section" in kinds


def test_one_notification_per_unread_run_and_mute(campus):
    conv = services.start_direct(campus.ayesha, campus.teacher)
    first = send(campus.ayesha, conv, "Can I submit late?")
    send(campus.ayesha, conv, "I was ill on Monday.")
    assert dms(campus.teacher) == ["Message from ayesha@test.edu"]  # not two
    services.mark_read(campus.teacher, conv, first.pk + 1)
    send(campus.ayesha, conv, "Thanks!")
    assert len(dms(campus.teacher)) == 2
    services.set_muted(campus.teacher, conv, True)
    services.mark_read(campus.teacher, conv, first.pk + 2)
    send(campus.ayesha, conv, "One more thing")
    assert len(dms(campus.teacher)) == 2
    assert dms(campus.ayesha) == []  # never for your own messages


def test_attachments_are_checked_and_private(campus):
    conv = services.start_direct(campus.ayesha, campus.teacher)
    message = send(campus.ayesha, conv, "", uploads=[pdf()])  # a file alone is fine
    stored = message.attachments.get()
    assert services.downloadable_attachment(campus.teacher, stored.pk) == stored
    assert services.downloadable_attachment(campus.admin, stored.pk) is None
    assert services.downloadable_attachment(campus.outsider, stored.pk) is None

    with pytest.raises(ValidationError, match="isn't allowed"):
        send(campus.ayesha, conv, "virus", uploads=[SimpleUploadedFile("run.exe", b"MZ")])
    with pytest.raises(ValidationError, match="up to 4"):
        send(campus.ayesha, conv, "lots", uploads=[pdf(f"{i}.pdf") for i in range(5)])
    assert StoredFile.objects.count() == 1  # nothing written for refused messages

    services.delete_message(campus.ayesha, message)
    assert services.downloadable_attachment(campus.teacher, stored.pk) is None


def test_section_chats_take_attachments_too(campus):
    services.ensure_section_conversations(campus.ayesha)
    section_chat = Conversation.objects.get(section=campus.s3b)
    message = send(campus.ayesha, section_chat, "Lab notes", uploads=[pdf()])
    fid = message.attachments.get().pk
    assert services.downloadable_attachment(campus.teacher, fid) is not None
    assert services.downloadable_attachment(campus.hamza, fid) is None  # 3C


def test_direct_messages_api(client, campus):
    client.force_login(campus.ayesha)
    people = client.get("/api/chat/people", {"q": "imran"}).json()
    assert [p["name"] for p in people] == ["imran@test.edu"]
    conv = client.post("/api/chat/direct", {"user_id": campus.teacher.pk},
                       content_type="application/json").json()
    assert conv["kind"] == "direct" and conv["other"]["id"] == campus.teacher.pk
    assert client.post("/api/chat/direct", {"user_id": campus.hamza.pk},
                       content_type="application/json").status_code == 403

    form = {"client_id": str(uuid.uuid4()), "body": "Here's my draft", "files": [pdf()]}
    sent = client.post(f"/api/chat/conversations/{conv['id']}/attachments", form)
    assert sent.status_code == 201
    file_id = sent.json()["attachments"][0]["id"]
    assert client.get(f"/api/chat/files/{file_id}").status_code == 200
    assert client.post(f"/api/chat/conversations/{conv['id']}/mute", {"muted": True},
                       content_type="application/json").status_code == 204
    assert client.get(f"/api/chat/conversations/{conv['id']}").json()["muted"] is True

    client.force_login(campus.hamza)
    assert client.get(f"/api/chat/files/{file_id}").status_code == 404
    assert client.get(f"/api/chat/conversations/{conv['id']}").status_code == 404
