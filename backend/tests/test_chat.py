import uuid

import jwt
import pytest
from django.core.exceptions import PermissionDenied, ValidationError

from apps.chat import services
from apps.chat.models import Conversation, Message
from apps.enrollment.models import SectionEnrollment
from apps.governance.models import AuditLog


@pytest.fixture(autouse=True)
def published(monkeypatch):
    """Capture realtime publishes instead of calling Centrifugo."""
    calls = []
    monkeypatch.setattr(
        "apps.core.realtime.publish", lambda channel, data: calls.append((channel, data))
    )
    return calls


def conversation_for(user, section):
    services.ensure_section_conversations(user)
    return Conversation.objects.get(section=section)


def send(user, conv, body="Hello", client_id=None):
    return services.send_message(user, conv, body=body, client_id=client_id or uuid.uuid4())


def test_section_chat_follows_enrollment(campus):
    titles = [s.conversation.title for s in services.conversations_for(campus.ayesha)]
    assert titles == ["CS-301 · 3B"]
    hamza = [s.conversation.title for s in services.conversations_for(campus.hamza)]
    assert hamza == ["CS-301 · 3C"]
    assert services.conversations_for(campus.outsider) == []

    conv_3b = conversation_for(campus.ayesha, campus.s3b)
    assert services.can_access(campus.teacher, conv_3b)
    assert not services.can_access(campus.hamza, conv_3b)
    assert not services.can_access(campus.outsider, conv_3b)


def test_dropping_the_section_removes_chat_access(campus):
    conv = conversation_for(campus.ayesha, campus.s3b)
    enrollment = SectionEnrollment.objects.get(student=campus.ayesha, section=campus.s3b)
    enrollment.status = SectionEnrollment.Status.DROPPED
    enrollment.save()
    assert not services.can_access(campus.ayesha, conv)
    with pytest.raises(PermissionDenied):
        send(campus.ayesha, conv)


def test_send_is_idempotent_and_published_after_commit(
    campus, published, django_capture_on_commit_callbacks
):
    conv = conversation_for(campus.ayesha, campus.s3b)
    client_id = uuid.uuid4()
    with django_capture_on_commit_callbacks(execute=True):
        first, created = send(campus.ayesha, conv, "  Is trees in the quiz?  ", client_id)
    assert created and first.body == "Is trees in the quiz?"
    retry, created_again = send(campus.ayesha, conv, "Is trees in the quiz?", client_id)
    assert (retry.pk, created_again) == (first.pk, False)
    assert Message.objects.count() == 1

    assert len(published) == 1
    channel, data = published[0]
    assert channel == f"chat:conv_{conv.pk}"
    assert data["type"] == "message.created"
    assert data["message"]["sender"]["name"] == "ayesha@test.edu"


def test_empty_and_overlong_messages_are_rejected(campus):
    conv = conversation_for(campus.ayesha, campus.s3b)
    with pytest.raises(ValidationError):
        send(campus.ayesha, conv, "   ")
    with pytest.raises(ValidationError):
        send(campus.ayesha, conv, "x" * 4001)


def test_unread_counts_and_marking_read(campus):
    conv = conversation_for(campus.ayesha, campus.s3b)
    first, _ = send(campus.teacher, conv, "Slides are up")
    send(campus.teacher, conv, "Quiz on Thursday")
    assert services.conversations_for(campus.ayesha)[0].unread == 2

    services.mark_read(campus.ayesha, conv, first.pk)
    assert services.conversations_for(campus.ayesha)[0].unread == 1

    # Replying means you've seen the conversation, and your own messages never count.
    send(campus.ayesha, conv, "Thanks")
    summary = services.conversations_for(campus.ayesha)[0]
    assert (summary.unread, summary.last_message.body) == (0, "Thanks")
    assert services.conversations_for(campus.teacher)[0].is_moderator


def test_pagination_returns_newest_first_page_in_order(campus):
    conv = conversation_for(campus.ayesha, campus.s3b)
    sent = [send(campus.ayesha, conv, f"m{i}")[0] for i in range(5)]
    page, has_more = services.list_messages(conv, limit=2)
    assert [m.body for m in page] == ["m3", "m4"] and has_more
    older, has_more = services.list_messages(conv, before_id=page[0].pk, limit=5)
    assert [m.body for m in older] == ["m0", "m1", "m2"] and not has_more
    assert sent[0].pk == older[0].pk


def test_students_delete_only_their_own_and_teachers_moderate(campus, published):
    conv = conversation_for(campus.ayesha, campus.s3b)
    teacher_msg, _ = send(campus.teacher, conv, "Office hours moved")
    student_msg, _ = send(campus.ayesha, conv, "Off-topic")

    with pytest.raises(PermissionDenied):
        services.delete_message(campus.ayesha, teacher_msg)

    services.delete_message(campus.teacher, student_msg)
    student_msg.refresh_from_db()
    assert student_msg.deleted_at is not None
    log = AuditLog.objects.get(action="chat.message_removed")
    assert log.actor == campus.teacher
    assert "Off-topic" not in str(log.changes)

    own, _ = send(campus.ayesha, conv, "typo")
    services.delete_message(campus.ayesha, own)
    assert AuditLog.objects.filter(action="chat.message_removed").count() == 1


def test_chat_api_round_trip(client, campus):
    client.force_login(campus.ayesha)
    [conv] = client.get("/api/chat/conversations").json()
    assert (conv["title"], conv["color"], conv["unread"]) == ("CS-301 · 3B", "slate", 0)

    url = f"/api/chat/conversations/{conv['id']}/messages"
    body = {"body": "Hello section", "client_id": str(uuid.uuid4())}
    first = client.post(url, body, content_type="application/json")
    again = client.post(url, body, content_type="application/json")
    assert (first.status_code, again.status_code) == (201, 200)
    assert first.json()["id"] == again.json()["id"]
    assert client.post(url, {"body": " ", "client_id": str(uuid.uuid4())},
                       content_type="application/json").status_code == 422

    page = client.get(url).json()
    assert [m["body"] for m in page["messages"]] == ["Hello section"]

    client.force_login(campus.hamza)
    assert client.get(url).status_code == 404
    assert client.get(f"/api/chat/conversations/{conv['id']}/realtime").status_code == 404


def test_realtime_tokens_are_scoped_to_the_channel(client, campus, settings):
    client.force_login(campus.ayesha)
    [conv] = client.get("/api/chat/conversations").json()
    connect = client.get("/api/chat/realtime").json()
    assert connect["enabled"]
    assert jwt.decode(connect["token"], settings.CENTRIFUGO_TOKEN_SECRET,
                      algorithms=["HS256"])["sub"] == str(campus.ayesha.pk)

    tokens = client.get(f"/api/chat/conversations/{conv['id']}/realtime").json()
    claims = jwt.decode(tokens["token"], settings.CENTRIFUGO_TOKEN_SECRET, algorithms=["HS256"])
    assert claims["channel"] == tokens["channel"] == f"chat:conv_{conv['id']}"
    assert tokens["typing_channel"] == f"typing:conv_{conv['id']}"
