"""The look of an institution's CampusVerse: one built-in theme for the whole site, and the
landing page's guide (its name, its colours, whether it shows). The themes' colours live in the
web app (web/src/lib/theme.ts); here they are only names to choose from."""

import re

from django.conf import settings
from django.core.exceptions import ValidationError

#: Built-in themes, by key. Keep in step with THEMES in web/src/lib/theme.ts.
PRESETS = ("evergreen", "indus", "maroon", "olive", "teal", "slate", "custom")

#: The colours an admin sets for a custom theme, for light and for dark. Keep in step with
#: CUSTOM_KEYS in web/src/lib/theme.ts.
CUSTOM_KEYS = (
    "bg",  # page background
    "surface",  # cards and panels
    "fill",  # soft fills: inputs, chips, hovered rows
    "ink",  # text
    "accent",  # buttons
    "on_accent",  # text on buttons
    "accent_ink",  # links and highlighted text
    "active",  # the current page in the sidebar
    "field",  # the deep colour of hero cards and the landing page
    "side",  # the sidebar
)
MODES = ("light", "dark")

DEFAULT_THEME = {
    "preset": "evergreen",
    "guide_enabled": True,
    "guide_name": "Verse",
    # Empty: the guide takes its colours from the theme.
    "guide_body": "",
    "guide_cap": "",
    "guide_tassel": "",
    # The guide inside the app, which answers questions once someone has signed in.
    "helper_enabled": True,
    # Only read when preset is "custom": {"light": {key: "#hex"}, "dark": {...}}.
    "custom": {},
}

_HEX = re.compile(r"^#[0-9a-f]{6}$")
_NAME = re.compile(r"^[\w .'\-]+$", re.UNICODE)


def theme_of(institution) -> dict:
    """The institution's theme, with every key present."""
    saved = getattr(institution, "theme", None) or {}
    out = {**DEFAULT_THEME, **{k: v for k, v in saved.items() if k in DEFAULT_THEME}}
    if out["preset"] not in PRESETS:
        out["preset"] = DEFAULT_THEME["preset"]
    return out


def clean_theme(data: dict) -> dict:
    """Checks a theme an admin sends; raises ValidationError with a message they can act on."""
    out = dict(DEFAULT_THEME)
    preset = data.get("preset", out["preset"])
    if preset not in PRESETS:
        raise ValidationError("Choose one of the built-in themes.")
    out["preset"] = preset

    out["guide_enabled"] = bool(data.get("guide_enabled", True))
    out["helper_enabled"] = bool(data.get("helper_enabled", True))
    out["custom"] = _clean_custom(data.get("custom") or {}, required=preset == "custom")

    name = " ".join(str(data.get("guide_name", "")).split())
    if not name:
        raise ValidationError("Give the guide a name.")
    if len(name) > 24:
        raise ValidationError("Keep the guide's name to 24 characters or fewer.")
    if not _NAME.match(name):
        raise ValidationError(
            "Use letters, numbers, spaces, dots, dashes or apostrophes in the name."
        )
    out["guide_name"] = name

    for key, label in (("guide_body", "body"), ("guide_cap", "cap"), ("guide_tassel", "tassel")):
        value = str(data.get(key, "") or "").strip().lower()
        if value and not _HEX.match(value):
            raise ValidationError(f"The guide's {label} colour must look like #b4532a.")
        out[key] = value
    return out


def public_institution(user=None):
    """Whose theme the public pages show: the signed-in person's institution, else the one named
    by CAMPUSVERSE_PUBLIC_INSTITUTION, else the first active one."""
    from .models import Institution

    if user is not None and getattr(user, "is_authenticated", False) and user.institution_id:
        return user.institution
    slug = getattr(settings, "CAMPUSVERSE_PUBLIC_INSTITUTION", "")
    qs = Institution.objects.filter(is_active=True)
    if slug:
        found = qs.filter(slug=slug).first()
        if found:
            return found
    return qs.order_by("pk").first()


def _clean_custom(custom, *, required: bool) -> dict:
    """A custom theme's colours: every key for light and dark, each like #b4532a."""
    if not isinstance(custom, dict):
        raise ValidationError("Custom colours are missing.")
    if not custom and not required:
        return {}
    out = {}
    for mode in MODES:
        given = custom.get(mode)
        if not isinstance(given, dict):
            raise ValidationError(f"Set the {mode} colours of your theme.")
        out[mode] = {}
        for key in CUSTOM_KEYS:
            value = str(given.get(key, "") or "").strip().lower()
            if not _HEX.match(value):
                label = key.replace("_", " ")
                raise ValidationError(f"The {mode} {label} colour must look like #b4532a.")
            out[mode][key] = value
    return out
