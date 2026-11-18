"""Admins fix people's details, hand out password-reset links and reset lost two-step sign-in."""

from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from django.core import mail

from apps.governance.models import AuditLog


def patch(client, url, body):
    return client.patch(url, body, content_type="application/json")


def test_admins_edit_details_and_email_moves_with_it(client, campus):
    url = f"/api/manage/people/{campus.ayesha.pk}"
    body = {"first_name": "Ayesha", "last_name": "Khan", "email": "Ayesha.Khan@test.edu",
            "kind": "student", "external_id": "126001"}

    client.force_login(campus.teacher)
    assert patch(client, url, body).status_code == 403

    client.force_login(campus.admin)
    saved = patch(client, url, body)
    assert saved.status_code == 200
    assert saved.json()["email"] == "ayesha.khan@test.edu"
    assert saved.json()["external_id"] == "126001"
    assert EmailAddress.objects.get(user=campus.ayesha).email == "ayesha.khan@test.edu"
    assert AuditLog.objects.filter(action="person.updated").exists()

    taken = {**body, "email": campus.hamza.email}
    assert patch(client, url, taken).json()["detail"] == "Someone else already has that email."
    assert patch(client, url, {**body, "kind": "wizard"}).status_code == 422


def test_reset_link_is_emailed_and_returned(client, campus):
    client.force_login(campus.admin)
    res = client.post(f"/api/manage/people/{campus.ayesha.pk}/password-reset")
    assert res.status_code == 200
    link = res.json()["link"]
    assert "/account/password/reset/" in link
    [message] = mail.outbox
    assert message.to == [campus.ayesha.email] and link in message.body


def test_two_step_can_be_reset_for_a_lost_phone(client, campus):
    Authenticator.objects.create(user=campus.ayesha, type=Authenticator.Type.TOTP, data={})
    client.force_login(campus.admin)
    person = next(p for p in client.get("/api/manage/people?q=ayesha").json())
    assert person["two_step"] is True
    assert client.post(f"/api/manage/people/{campus.ayesha.pk}/reset-two-step").status_code == 204
    assert not Authenticator.objects.filter(user=campus.ayesha).exists()
