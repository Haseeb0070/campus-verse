"""The mobile app signs in through allauth's app client and calls the API with X-Session-Token."""

import json

import pytest
from django.test import Client

APP = "/_allauth/app/v1"


@pytest.fixture
def verified(campus):
    from allauth.account.models import EmailAddress

    EmailAddress.objects.create(user=campus.ayesha, email=campus.ayesha.email,
                                primary=True, verified=True)
    return campus


def app_sign_in(client, email, password="test-pass-123"):
    response = client.post(f"{APP}/auth/login", json.dumps({"email": email, "password": password}),
                           content_type="application/json")
    assert response.status_code == 200, response.json()
    return response.json()["meta"]["session_token"]


@pytest.mark.django_db
def test_token_reads_and_writes_without_csrf(verified):
    campus = verified
    client = Client(enforce_csrf_checks=True)
    token = app_sign_in(client, campus.ayesha.email)
    client.cookies.clear()  # nothing ambient: the token is the only credential

    me = client.get("/api/me", HTTP_X_SESSION_TOKEN=token)
    assert me.status_code == 200
    assert me.json()["email"] == campus.ayesha.email

    marked = client.post("/api/notifications/read", json.dumps({}),
                         content_type="application/json", HTTP_X_SESSION_TOKEN=token)
    assert marked.status_code == 200


@pytest.mark.django_db
def test_bad_or_missing_token_is_refused(client, campus):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", HTTP_X_SESSION_TOKEN="not-a-token").status_code == 401


@pytest.mark.django_db
def test_signing_out_ends_the_token(client, verified):
    campus = verified
    token = app_sign_in(client, campus.ayesha.email)
    client.cookies.clear()
    out = client.delete(f"{APP}/auth/session", HTTP_X_SESSION_TOKEN=token)
    assert out.status_code == 401  # allauth answers a sign-out with "no session"
    assert client.get("/api/me", HTTP_X_SESSION_TOKEN=token).status_code == 401


@pytest.mark.django_db
def test_theme_follows_the_token(client, verified):
    campus = verified
    campus.inst.theme = {"preset": "maroon"}
    campus.inst.save(update_fields=["theme"])
    token = app_sign_in(client, campus.ayesha.email)
    client.cookies.clear()
    assert client.get("/api/theme", HTTP_X_SESSION_TOKEN=token).json()["preset"] == "maroon"
