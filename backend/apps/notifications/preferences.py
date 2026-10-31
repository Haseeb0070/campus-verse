"""Who wants which notifications, in the app and by email (SRS 5.9: email is an extra channel
people choose; the in-app record is always kept)."""

from django.core.exceptions import ValidationError

from .models import Notification, NotificationPreference

Kind = Notification.Kind

# Defaults lean quiet by email: only things that change your day or need action.
GROUPS: list[dict] = [
    {"key": "important", "label": "Important notices", "in_app": True, "email": True,
     "detail": "Notices marked important by your teachers or campus."},
    {"key": "notices", "label": "Other notices", "in_app": True, "email": False,
     "detail": "Everything else posted to your courses, department or campus."},
    {"key": "classes", "label": "Class changes", "in_app": True, "email": True,
     "detail": "Cancelled, moved or room-changed classes."},
    {"key": "assignments", "label": "Assignments and grades", "in_app": True, "email": True,
     "detail": "New work, reminders a day before deadlines, and released grades."},
    {"key": "resources", "label": "Course resources", "in_app": True, "email": False,
     "detail": "New or updated slides, notes and readings."},
    {"key": "feed", "label": "Replies in the feed", "in_app": True, "email": False,
     "detail": "Comments on your posts and replies to your comments."},
    {"key": "messages", "label": "Direct messages", "in_app": True, "email": False,
     "detail": "Someone writes to you one to one."},
    {"key": "account", "label": "Your account", "in_app": True, "email": True, "locked": True,
     "detail": "Answers to correction requests and moderation decisions. Always shown in the app."},
]
DEFAULTS = {g["key"]: g for g in GROUPS}

KIND_GROUP = {
    Kind.NOTICE: "notices",
    Kind.CLASS_CHANGED: "classes",
    Kind.ASSIGNMENT_OPENED: "assignments",
    Kind.ASSIGNMENT_DUE_SOON: "assignments",
    Kind.GRADES_RELEASED: "assignments",
    Kind.RESOURCE: "resources",
    Kind.FEED_COMMENT: "feed",
    Kind.MODERATION: "account",
    Kind.CORRECTION: "account",
}


def group_for(kind: str) -> str:
    return KIND_GROUP.get(kind, "account")


def preferences_of(user) -> list[dict]:
    stored = getattr(getattr(user, "notification_preference", None), "choices", None) or {}
    out = []
    for g in GROUPS:
        mine = stored.get(g["key"], {})
        out.append({
            "key": g["key"], "label": g["label"], "detail": g["detail"],
            "locked": g.get("locked", False),
            "in_app": True if g.get("locked") else mine.get("in_app", g["in_app"]),
            "email": mine.get("email", g["email"]),
        })
    return out


def update_preferences(user, changes: dict[str, dict[str, bool]]) -> list[dict]:
    pref, _ = NotificationPreference.objects.get_or_create(user=user)
    choices = dict(pref.choices)
    for key, channels in changes.items():
        if key not in DEFAULTS:
            raise ValidationError(f"Unknown notification group: {key}.")
        entry = dict(choices.get(key, {}))
        for channel, on in channels.items():
            if channel not in ("in_app", "email") or not isinstance(on, bool):
                raise ValidationError("Each choice is in_app or email, on or off.")
            if channel == "in_app" and DEFAULTS[key].get("locked") and not on:
                raise ValidationError("Account notifications always show in the app.")
            if on == DEFAULTS[key][channel]:
                entry.pop(channel, None)  # back to the default: store nothing
            else:
                entry[channel] = on
        if entry:
            choices[key] = entry
        else:
            choices.pop(key, None)
    pref.choices = choices
    pref.save()
    user.notification_preference = pref
    return preferences_of(user)


def channels(user_ids: set[int], group: str) -> dict[int, tuple[bool, bool]]:
    """(in_app, email) for each person, in one query."""
    default = DEFAULTS[group]
    rows = NotificationPreference.objects.filter(user_id__in=user_ids)
    stored = dict(rows.values_list("user_id", "choices"))
    out = {}
    for uid in user_ids:
        mine = (stored.get(uid) or {}).get(group, {})
        in_app = True if default.get("locked") else mine.get("in_app", default["in_app"])
        out[uid] = (in_app, mine.get("email", default["email"]))
    return out
