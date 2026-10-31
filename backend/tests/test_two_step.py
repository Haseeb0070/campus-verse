"""Two-step sign-in through allauth's headless API: the exact flows the web app relies on."""

import json

import pytest
from allauth.mfa.totp.internal.auth import (
    format_hotp_value,
    hotp_value,
    yield_hotp_counters_from_time,
)

BASE = "/_allauth/browser/v1"
PASSWORD = "test-pass-123"


def code_for(secret: str) -> str:
    return format_hotp_value(hotp_value(secret, next(yield_hotp_counters_from_time())))


def call(client, method, path, data=None):
    """Like the web app: if allauth asks to confirm the password first, do it and retry."""
    send = getattr(client, method)
    args = {} if data is None else {"data": json.dumps(data), "content_type": "application/json"}
    response = send(f"{BASE}{path}", **args)
    flows = response.json().get("data", {}).get("flows", []) if response.status_code == 401 else []
    if any(f["id"] == "reauthenticate" for f in flows):
        again = client.post(f"{BASE}/auth/reauthenticate", json.dumps({"password": PASSWORD}),
                            content_type="application/json")
        assert again.status_code == 200, again.json()
        response = send(f"{BASE}{path}", **args)
    return response


def sign_in(client, campus):
    return call(client, "post", "/auth/login", {"email": campus.teacher.email,
                                                 "password": PASSWORD})


def turn_on(client) -> dict:
    secret = client.get(f"{BASE}/account/authenticators/totp").json()["meta"]["secret"]
    activated = call(client, "post", "/account/authenticators/totp", {"code": code_for(secret)})
    assert activated.status_code == 200, activated.json()
    return call(client, "get", "/account/authenticators/recovery-codes").json()["data"]


def kinds(client):
    return [a["type"] for a in client.get(f"{BASE}/account/authenticators").json()["data"]]


@pytest.fixture
def verified(campus):
    from allauth.account.models import EmailAddress

    EmailAddress.objects.create(user=campus.teacher, email=campus.teacher.email,
                                primary=True, verified=True)
    return campus


def test_setting_up_and_signing_in_with_a_code(client, verified):
    assert sign_in(client, verified).status_code == 200
    pending = client.get(f"{BASE}/account/authenticators/totp")
    assert pending.status_code == 404  # not set up: allauth offers a fresh secret instead
    assert pending.json()["meta"]["totp_url"].startswith("otpauth://totp/")
    wrong = call(client, "post", "/account/authenticators/totp", {"code": "000000"})
    assert wrong.status_code == 400

    codes = turn_on(client)
    assert set(kinds(client)) == {"totp", "recovery_codes"}
    assert client.get("/api/me").json()["two_step"] is True
    assert len(codes["unused_codes"]) >= 10

    client.delete(f"{BASE}/auth/session")
    step = sign_in(client, verified)
    assert step.status_code == 401
    flows = {f["id"]: f for f in step.json()["data"]["flows"]}
    assert flows["mfa_authenticate"]["is_pending"] is True
    assert client.get("/api/me").status_code == 401  # not in yet
    assert call(client, "post", "/auth/2fa/authenticate", {"code": "123456"}).status_code == 400
    done = call(client, "post", "/auth/2fa/authenticate", {"code": codes["unused_codes"][0]})
    assert done.status_code == 200  # a recovery code works when the phone is lost
    assert client.get("/api/me").status_code == 200


def test_turning_it_off(client, verified):
    sign_in(client, verified)
    turn_on(client)
    off = call(client, "delete", "/account/authenticators/totp")
    assert off.status_code == 200, off.json()
    assert "totp" not in kinds(client)
    client.delete(f"{BASE}/auth/session")
    assert sign_in(client, verified).status_code == 200  # back to password only
