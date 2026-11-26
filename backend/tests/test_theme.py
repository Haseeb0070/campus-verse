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


def test_people_name_the_guide_only_when_allowed(client, campus):
    client.force_login(campus.ayesha)
    me = client.get("/api/me").json()
    assert me["guide_rename"] is False and me["guide_name_default"] == "Verse"
    # By default the guide has the one name the admin gave it.
    assert put(client, "/api/me/guide-name", {"guide_name": "Pip"}).status_code == 403

    client.force_login(campus.admin)
    assert put(client, "/api/manage/theme", {**GOOD, "guide_rename": True}).status_code == 200

    client.force_login(campus.ayesha)
    assert put(client, "/api/me/guide-name", {"guide_name": "<b>"}).status_code == 422
    assert put(client, "/api/me/guide-name", {"guide_name": "  Pip  "}).status_code == 204
    assert client.get("/api/me").json()["guide_name"] == "Pip"
    assert client.get("/api/theme").json()["guide_name"] == "Pip"

    client.force_login(campus.hamza)  # everyone else still sees the admin's name
    assert client.get("/api/theme").json()["guide_name"] == "Noor"

    client.force_login(campus.admin)  # turning it off brings back the one name
    put(client, "/api/manage/theme", GOOD)
    client.force_login(campus.ayesha)
    assert client.get("/api/theme").json()["guide_name"] == "Noor"
    assert put(client, "/api/me/guide-name", {"guide_name": ""}).status_code == 403


LIGHT = {
    "bg": "#f6f1ea", "surface": "#ffffff", "fill": "#efe7dc", "ink": "#1f1a16",
    "accent": "#1d6f5f", "on_accent": "#ffffff", "accent_ink": "#145244", "active": "#1d6f5f",
    "field": "#163a33", "side": "#12302a",
}
DARK = {**LIGHT, "bg": "#121212", "surface": "#1c1c1c", "fill": "#262626", "ink": "#f2f2f2"}


def test_a_custom_theme_needs_every_colour_for_light_and_dark(client, campus):
    with pytest.raises(Exception, match="light colours"):
        clean_theme({**GOOD, "preset": "custom", "custom": {}})
    with pytest.raises(Exception, match="dark accent colour"):
        clean_theme({**GOOD, "preset": "custom",
                     "custom": {"light": LIGHT, "dark": {**DARK, "accent": "green"}}})
    out = clean_theme({**GOOD, "preset": "custom", "helper_enabled": False,
                       "custom": {"light": LIGHT, "dark": DARK}})
    assert out["custom"]["dark"]["bg"] == "#121212" and out["helper_enabled"] is False

    client.force_login(campus.admin)
    body = {**GOOD, "preset": "custom", "custom": {"light": LIGHT, "dark": DARK}}
    assert put(client, "/api/manage/theme", body).status_code == 200
    client.logout()
    public = client.get("/api/theme").json()
    assert public["preset"] == "custom" and public["custom"]["light"]["accent"] == "#1d6f5f"


def test_card_look_defaults_and_checks():
    from django.core.exceptions import ValidationError

    from apps.academic.theme import clean_theme

    out = clean_theme({"preset": "campus", "guide_name": "Verse"})
    assert out["card_borders"] is True and out["card_shadows"] is True and out["corners"] == "round"
    out = clean_theme({"preset": "campus", "guide_name": "Verse", "card_borders": False,
                       "card_shadows": False, "corners": "sharp"})
    assert (out["card_borders"], out["card_shadows"], out["corners"]) == (False, False, "sharp")
    import pytest

    out = clean_theme({"preset": "campus", "guide_name": "Verse", "card_borders": True, "card_borders_dark": False})
    assert (out["card_borders"], out["card_borders_dark"]) == (True, False)
    # An older save with one switch: dark follows it.
    assert clean_theme({"preset": "campus", "guide_name": "Verse", "card_borders": False})["card_borders_dark"] is False

    with pytest.raises(ValidationError, match="corners"):
        clean_theme({"preset": "campus", "guide_name": "Verse", "corners": "wavy"})
