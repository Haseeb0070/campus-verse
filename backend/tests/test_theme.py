"""The site's theme (chosen by admins) and each person's light or dark choice."""

import pytest

from apps.academic.theme import DEFAULT_THEME, clean_theme


def put(client, url, body):
    return client.put(url, body, content_type="application/json")


GOOD = {
    "preset": "maroon",
    "guide_enabled": True,
    "guide_name": "Noor",
    "guide_body": "#2A6F97",
    "guide_cap": "",
    "guide_tassel": "#e3a33b",
}


def test_clean_theme_checks_every_field():
    out = clean_theme(GOOD)
    assert out["preset"] == "maroon" and out["guide_name"] == "Noor"
    assert out["guide_body"] == "#2a6f97"  # colours are kept in lowercase
    for bad, message in (
        ({"preset": "neon"}, "built-in"),
        ({"guide_name": "  "}, "name"),
        ({"guide_name": "x" * 25}, "24"),
        ({"guide_name": "<script>"}, "letters"),
        ({"guide_cap": "red"}, "cap colour"),
    ):
        with pytest.raises(Exception, match=message):
            clean_theme({**GOOD, **bad})


def test_public_theme_and_admin_changes(client, campus):
    # Anyone, signed in or not, gets the site's look; at first the default.
    assert client.get("/api/theme").json() == DEFAULT_THEME

    client.force_login(campus.ayesha)
    assert client.get("/api/manage/theme").status_code == 403
    assert put(client, "/api/manage/theme", GOOD).status_code == 403

    client.force_login(campus.admin)
    saved = put(client, "/api/manage/theme", GOOD)
    assert saved.status_code == 200 and saved.json()["preset"] == "maroon"
    assert put(client, "/api/manage/theme", {**GOOD, "preset": "neon"}).status_code == 422
    assert client.get("/api/manage/theme").json()["guide_name"] == "Noor"

    client.logout()
    public = client.get("/api/theme").json()
    assert public["preset"] == "maroon" and public["guide_body"] == "#2a6f97"


def test_everyone_chooses_light_or_dark(client, campus):
    client.force_login(campus.ayesha)
    assert client.get("/api/me").json()["appearance"] == "light"  # never taken from the device
    assert put(client, "/api/me/appearance", {"appearance": "dark"}).status_code == 204
    assert client.get("/api/me").json()["appearance"] == "dark"
    assert put(client, "/api/me/appearance", {"appearance": "system"}).status_code == 422
