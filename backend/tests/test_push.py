"""Phone push notifications: the app registers a phone, notify() pushes to it through Expo, and a
phone that no longer has the app is forgotten."""

import json
from unittest import mock

import pytest
from django.test import Client

from apps.notifications.models import Notification, PushDevice
from apps.notifications.services import notify

TOKEN = "ExponentPushToken[abcdefghij0123456789]"
OTHER = "ExponentPushToken[zyxwvutsrq9876543210]"


def tickets(*statuses):
    """What Expo answers: one ticket per message."""
    data = []
    for s in statuses:
        if s == "ok":
            data.append({"status": "ok", "id": "x"})
        else:
            data.append({"status": "error", "message": "gone", "details": {"error": s}})
    response = mock.Mock()
    response.json.return_value = {"data": data}
    response.raise_for_status.return_value = None
    return response


@pytest.fixture
def ayesha_client(campus):
    client = Client()
    client.force_login(campus.ayesha)
    return client


@pytest.mark.django_db
def test_the_app_registers_and_removes_a_phone(ayesha_client, campus):
    body = json.dumps({"token": TOKEN, "platform": "android"})
    assert (
        ayesha_client.post(
            "/api/notifications/devices", body, content_type="application/json"
        ).status_code
        == 204
    )
    assert PushDevice.objects.get(token=TOKEN).user == campus.ayesha

    # Signed in again on the same phone: the token isn't duplicated.
    ayesha_client.post("/api/notifications/devices", body, content_type="application/json")
    assert PushDevice.objects.filter(token=TOKEN).count() == 1

    assert (
        ayesha_client.post(
            "/api/notifications/devices/remove", body, content_type="application/json"
        ).status_code
        == 204
    )
    assert not PushDevice.objects.exists()


@pytest.mark.django_db
def test_a_phone_moves_to_whoever_signs_in_on_it(campus):
    PushDevice.objects.create(user=campus.hamza, token=TOKEN)
    client = Client()
    client.force_login(campus.ayesha)
    client.post(
        "/api/notifications/devices", json.dumps({"token": TOKEN}), content_type="application/json"
    )
    assert PushDevice.objects.get(token=TOKEN).user == campus.ayesha


@pytest.mark.django_db
def test_rejects_something_that_isnt_a_push_token(ayesha_client):
    response = ayesha_client.post(
        "/api/notifications/devices",
        json.dumps({"token": "not-a-token"}),
        content_type="application/json",
    )
    assert response.status_code == 422
    assert not PushDevice.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_notify_pushes_to_the_recipients_phones(campus):
    PushDevice.objects.create(user=campus.ayesha, token=TOKEN)
    PushDevice.objects.create(user=campus.hamza, token=OTHER)
    with mock.patch("apps.notifications.push._post", return_value=tickets("ok")) as post:
        notify(
            [campus.ayesha.pk],
            kind=Notification.Kind.NOTICE,
            institution_id=campus.inst.pk,
            title="Room change",
            body="CS-301 is in R-127 today",
            link="/timetable",
            dedupe_key="push-test-1",
        )
    assert post.call_count == 1
    sent = post.call_args.args[0]
    assert [m["to"] for m in sent] == [TOKEN]  # only the recipient's phone
    assert sent[0]["title"] == "Room change"
    assert sent[0]["data"] == {"link": "/timetable", "kind": Notification.Kind.NOTICE}


@pytest.mark.django_db(transaction=True)
def test_a_phone_without_the_app_is_forgotten(campus):
    PushDevice.objects.create(user=campus.ayesha, token=TOKEN)
    with mock.patch("apps.notifications.push._post", return_value=tickets("DeviceNotRegistered")):
        notify(
            [campus.ayesha.pk],
            kind=Notification.Kind.NOTICE,
            institution_id=campus.inst.pk,
            title="Hello",
            dedupe_key="push-test-2",
        )
    assert not PushDevice.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_a_failed_push_never_breaks_the_notification(campus):
    PushDevice.objects.create(user=campus.ayesha, token=TOKEN)
    with mock.patch("apps.notifications.push._post", side_effect=OSError("no network")):
        count = notify(
            [campus.ayesha.pk],
            kind=Notification.Kind.NOTICE,
            institution_id=campus.inst.pk,
            title="Hello",
            dedupe_key="push-test-3",
        )
    assert count == 1
    assert Notification.objects.filter(recipient=campus.ayesha).exists()
    assert PushDevice.objects.exists()  # a network failure isn't a reason to forget the phone


@pytest.mark.django_db(transaction=True)
def test_no_push_when_the_app_channel_is_off(campus):
    """People who turned a kind of notification off in the app get no push for it either."""
    PushDevice.objects.create(user=campus.ayesha, token=TOKEN)
    with (
        mock.patch(
            "apps.notifications.preferences.channels",
            return_value={campus.ayesha.pk: (False, False)},
        ),
        mock.patch("apps.notifications.push._post") as post,
    ):
        notify(
            [campus.ayesha.pk],
            kind=Notification.Kind.NOTICE,
            institution_id=campus.inst.pk,
            title="Hello",
            dedupe_key="push-test-4",
        )
    post.assert_not_called()
