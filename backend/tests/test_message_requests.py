"""A private chat starts as a message request: one opening message, then nothing more from either
side until the person it was sent to accepts."""

import uuid

import pytest
from django.core.exceptions import PermissionDenied

from apps.chat import services
from apps.chat.models import Conversation
from apps.notifications.models import Notification


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("apps.core.realtime.publish", lambda channel, data: None)
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


def send(user, conv, body="hi"):
    return services.send_message(user, conv, body=body, client_id=uuid.uuid4())[0]


def titles(user):
    return list(Notification.objects.filter(recipient=user, kind="message.direct")
                .order_by("pk").values_list("title", flat=True))


def test_a_new_private_chat_is_a_request_with_one_opening_message(campus):
    conv = services.start_direct(campus.ayesha, campus.teacher)
    assert conv.request_status == Conversation.Request.PENDING
    assert conv.requested_by == campus.ayesha

    send(campus.ayesha, conv, "Salam sir, can I ask about the assignment?")
    assert titles(campus.teacher) == ["Message request from ayesha@test.edu"]
    with pytest.raises(PermissionDenied, match="once they accept"):
        send(campus.ayesha, conv, "Hello?")
    with pytest.raises(PermissionDenied, match="Accept the message request"):
        send(campus.teacher, conv, "Yes")


def test_accepting_opens_the_chat_for_both(campus):
    conv = services.start_direct(campus.ayesha, campus.teacher)
    send(campus.ayesha, conv)
    with pytest.raises(PermissionDenied):
        services.answer_request(campus.ayesha, conv, accept=True)  # not yours to answer

    services.answer_request(campus.teacher, conv, accept=True)
    conv.refresh_from_db()
    assert conv.request_status == Conversation.Request.ACCEPTED
    assert titles(campus.ayesha) == ["imran@test.edu accepted your message request"]
    send(campus.teacher, conv, "Yes, go ahead")
    send(campus.ayesha, conv, "Thank you")
    send(campus.ayesha, conv, "One more question")
    with pytest.raises(PermissionDenied):
        services.answer_request(campus.teacher, conv, accept=False)  # nothing left to answer


def test_declining_closes_it_and_hides_it_from_the_decliner(campus):
    conv = services.start_direct(campus.ayesha, campus.teacher)
    send(campus.ayesha, conv)
    services.answer_request(campus.teacher, conv, accept=False)
    conv.refresh_from_db()
    assert conv.request_status == Conversation.Request.DECLINED

    with pytest.raises(PermissionDenied, match="declined"):
        send(campus.ayesha, conv, "Please?")
    assert conv.pk not in [s.conversation.pk for s in services.conversations_for(campus.teacher)]
    assert conv.pk in [s.conversation.pk for s in services.conversations_for(campus.ayesha)]
    # Asking again doesn't reopen it...
    assert services.start_direct(campus.ayesha, campus.teacher).request_status == "declined"
    # ...but the person who declined can change their mind by reaching out.
    assert services.start_direct(campus.teacher, campus.ayesha).request_status == "accepted"
    send(campus.ayesha, conv, "Thanks for getting back to me")


def test_teachers_and_staff_come_first_in_new_message(campus):
    kinds = [u.kind for u in services.contacts(campus.ayesha)]
    assert kinds[0] == "teacher"
    assert kinds == sorted(kinds, key=["teacher", "staff", "student"].index)


def test_people_search_matches_every_word(campus):
    teacher = campus.teacher
    teacher.first_name, teacher.last_name = "Imran", "Qureshi"
    teacher.save()
    assert services.contacts(campus.ayesha, "imran qureshi") == [teacher]
    assert services.contacts(campus.ayesha, "qureshi IMR") == [teacher]
    assert services.contacts(campus.ayesha, "imran nobody") == []
    assert campus.ayesha not in services.contacts(campus.ayesha, "ayesha")  # never yourself


def test_section_chats_are_never_requests(campus):
    services.ensure_section_conversations(campus.ayesha)
    section_chat = Conversation.objects.get(section=campus.s3b)
    send(campus.ayesha, section_chat, "one")
    send(campus.ayesha, section_chat, "two")


def test_requests_api(client, campus):
    client.force_login(campus.ayesha)
    conv = client.post("/api/chat/direct", {"user_id": campus.teacher.pk},
                       content_type="application/json").json()
    assert conv["request_status"] == "pending" and conv["requested_by_me"] is True
    url = f"/api/chat/conversations/{conv['id']}"
    body = {"client_id": str(uuid.uuid4()), "body": "Salam"}
    assert client.post(f"{url}/messages", body, content_type="application/json").status_code == 201
    body["client_id"] = str(uuid.uuid4())
    assert client.post(f"{url}/messages", body, content_type="application/json").status_code == 403
    assert client.post(f"{url}/request/accept").status_code == 403  # the asker can't accept

    client.force_login(campus.teacher)
    seen = client.get(url).json()
    assert seen["request_status"] == "pending" and seen["requested_by_me"] is False
    assert client.post(f"{url}/request/maybe").status_code == 404
    answered = client.post(f"{url}/request/accept").json()
    assert answered["request_status"] == "accepted"
    body["client_id"] = str(uuid.uuid4())
    assert client.post(f"{url}/messages", body, content_type="application/json").status_code == 201
