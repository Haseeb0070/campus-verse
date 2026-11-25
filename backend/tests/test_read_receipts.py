"""'Seen' in one-to-one chats: shown when both people share it, never on a pending request, never
in subject chats, and turning it off hides it both ways."""

import uuid

import pytest

from apps.chat import services


@pytest.fixture
def published(monkeypatch):
    events = []
    monkeypatch.setattr("apps.core.realtime.publish", lambda channel, data: events.append(data))
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)
    return events


def send(user, conv, body="hi"):
    return services.send_message(user, conv, body=body, client_id=uuid.uuid4())[0]


def read_events(events):
    return [e for e in events if e.get("type") == "message.read"]


def test_seen_after_the_request_is_accepted(campus, published, django_capture_on_commit_callbacks):
    conv = services.start_direct(campus.ayesha, campus.teacher)
    first = send(campus.ayesha, conv)
    # Looking at a request doesn't tell the sender anything.
    with django_capture_on_commit_callbacks(execute=True):
        services.mark_read(campus.teacher, conv, first.pk)
    assert services.seen_up_to(campus.ayesha, conv) is None
    assert read_events(published) == []

    services.answer_request(campus.teacher, conv, accept=True)
    conv.refresh_from_db()
    second = send(campus.ayesha, conv, "One more thing")
    assert services.seen_up_to(campus.ayesha, conv) == first.pk  # not the new one yet
    with django_capture_on_commit_callbacks(execute=True):
        services.mark_read(campus.teacher, conv, second.pk)
    assert services.seen_up_to(campus.ayesha, conv) == second.pk
    assert read_events(published)[-1] == {"type": "message.read", "user_id": campus.teacher.pk,
                                          "message_id": second.pk}


def test_turning_it_off_hides_it_both_ways(campus, published, client):
    conv = services.start_direct(campus.ayesha, campus.teacher)
    send(campus.ayesha, conv)
    services.answer_request(campus.teacher, conv, accept=True)
    conv.refresh_from_db()

    client.force_login(campus.teacher)
    assert client.put("/api/me/read-receipts", {"read_receipts": False},
                      content_type="application/json").status_code == 204
    campus.teacher.refresh_from_db()
    assert client.get("/api/me").json()["read_receipts"] is False
    assert services.seen_up_to(campus.ayesha, conv) is None  # she can't see his
    assert services.seen_up_to(campus.teacher, conv) is None  # nor he hers

    client.force_login(campus.ayesha)
    row = next(c for c in client.get("/api/chat/conversations").json() if c["id"] == conv.pk)
    assert row["seen_up_to"] is None


def test_subject_chats_have_no_seen(campus, published, client):
    client.force_login(campus.ayesha)
    rows = client.get("/api/chat/conversations").json()
    assert rows and all(r["seen_up_to"] is None for r in rows if r["kind"] == "section")
