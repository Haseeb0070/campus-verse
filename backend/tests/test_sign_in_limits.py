"""Wrong passwords lock out the account being tried, never everyone behind the same proxy."""

import json

import pytest
from allauth.account.models import EmailAddress

BASE = "/_allauth/browser/v1"
PASSWORD = "test-pass-123"
PROXY = "10.0.0.1"  # what Render's proxy looks like to Django: the same for every visitor


@pytest.fixture
def people(campus):
    for user in (campus.ayesha, campus.hamza, campus.admin, campus.teacher):
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
    return campus


def login(client, email, password, visitor_ip):
    client.cookies.clear()
    return client.post(
        f"{BASE}/auth/login",
        json.dumps({"email": email, "password": password}),
        content_type="application/json",
        REMOTE_ADDR=PROXY,
        HTTP_X_FORWARDED_FOR=f"{visitor_ip}, 172.16.0.9",
    )


def held(response) -> bool:
    return any(e.get("code") == "too_many_login_attempts"
               for e in response.json().get("errors", []))


def test_one_persons_wrong_passwords_do_not_lock_out_others(client, people):
    for _ in range(6):
        login(client, people.ayesha.email, "wrong-password", "203.0.113.5")
    # Ayesha's own account is held for a few minutes...
    assert held(login(client, people.ayesha.email, PASSWORD, "203.0.113.5"))
    # ...but someone else, through the same proxy, still signs in.
    assert login(client, people.teacher.email, PASSWORD, "198.51.100.7").status_code == 200


def test_a_shared_campus_address_allows_many_mistakes_across_accounts(client, people):
    # Students on the college Wi-Fi share one address: a handful of typos between them
    # must not shut the door for the rest.
    for person in (people.ayesha, people.hamza, people.admin):
        for _ in range(3):
            login(client, person.email, "wrong-password", "203.0.113.50")
    assert login(client, people.teacher.email, PASSWORD, "203.0.113.50").status_code == 200
