import pytest
from django.core import mail
from django.core.exceptions import ValidationError

from apps.notices.models import Notice
from apps.notices.services import publish_notice
from apps.notifications import emails, preferences
from apps.notifications.models import Notification
from apps.notifications.services import notify


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


def post_notice(campus, commits, *, important=False):
    with commits(execute=True):
        return publish_notice(
            author=campus.teacher, targets=[("section", campus.s3b.pk)],
            notice=Notice(title="Quiz on Thursday", body="Bring a pencil.",
                          priority="important" if important else "normal"),
        )


def test_important_notices_are_emailed_by_default_others_are_not(
    campus, django_capture_on_commit_callbacks
):
    post_notice(campus, django_capture_on_commit_callbacks)
    assert Notification.objects.filter(recipient=campus.ayesha, in_app=True).count() == 1
    assert mail.outbox == []

    post_notice(campus, django_capture_on_commit_callbacks, important=True)
    assert [m.to for m in mail.outbox] == [[campus.ayesha.email]]
    message = mail.outbox[0]
    assert message.subject == "Important: Quiz on Thursday"
    assert "Bring a pencil." in message.body and "/notices#notice-" in message.body
    assert "/profile#notifications" in message.body
    assert message.alternatives[0][1] == "text/html"
    assert Notification.objects.get(recipient=campus.ayesha, title__startswith="Important") \
        .emailed_at is not None


def test_people_choose_their_channels(campus, client, django_capture_on_commit_callbacks):
    preferences.update_preferences(campus.ayesha, {"notices": {"in_app": False, "email": True}})
    post_notice(campus, django_capture_on_commit_callbacks)
    record = Notification.objects.get(recipient=campus.ayesha)
    assert (record.in_app, record.email_wanted) == (False, True)  # kept on record, emailed
    assert len(mail.outbox) == 1

    client.force_login(campus.ayesha)
    listed = client.get("/api/notifications").json()
    assert listed == {"items": [], "unread": 0}  # not in the app, as asked


def test_defaults_are_not_stored_and_account_stays_in_app(campus):
    prefs = preferences.update_preferences(campus.ayesha, {"classes": {"email": True}})
    assert campus.ayesha.notification_preference.choices == {}  # same as the default
    assert {p["key"]: p["email"] for p in prefs}["classes"] is True
    with pytest.raises(ValidationError, match="always show"):
        preferences.update_preferences(campus.ayesha, {"account": {"in_app": False}})
    with pytest.raises(ValidationError, match="Unknown"):
        preferences.update_preferences(campus.ayesha, {"spam": {"email": True}})
    with pytest.raises(ValidationError):
        preferences.update_preferences(campus.ayesha, {"feed": {"sms": True}})


def test_each_notification_is_emailed_once_and_never_to_inactive_people(
    campus, django_capture_on_commit_callbacks
):
    campus.hamza.is_active = False
    campus.hamza.save()
    with django_capture_on_commit_callbacks(execute=True):
        notify([campus.ayesha.pk, campus.hamza.pk], kind=Notification.Kind.CLASS_CHANGED,
               institution_id=campus.inst.pk, title="Class moved", dedupe_key="change:1")
    assert [m.to for m in mail.outbox] == [[campus.ayesha.email]]
    assert emails.send_for("change:1", [campus.ayesha.pk, campus.hamza.pk]) == 0  # a retry
    with django_capture_on_commit_callbacks(execute=True):  # the same event again
        notify([campus.ayesha.pk], kind=Notification.Kind.CLASS_CHANGED,
               institution_id=campus.inst.pk, title="Class moved", dedupe_key="change:1")
    assert len(mail.outbox) == 1


def test_a_failed_send_is_released_for_retry_and_keeps_the_record(campus, monkeypatch):
    notify([campus.ayesha.pk], kind=Notification.Kind.CLASS_CHANGED,
           institution_id=campus.inst.pk, title="Class moved", dedupe_key="change:2")

    def boom(self, *a, **kw):
        raise ConnectionError("SMTP down")

    monkeypatch.setattr("django.core.mail.EmailMultiAlternatives.send", boom)
    with pytest.raises(ConnectionError):
        emails.send_for("change:2", [campus.ayesha.pk])
    record = Notification.objects.get(dedupe_key="change:2")
    assert record.emailed_at is None and record.in_app  # retry-able; nothing lost
    monkeypatch.undo()
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)
    assert emails.send_for("change:2", [campus.ayesha.pk]) == 1


def test_preferences_api(client, campus):
    client.force_login(campus.ayesha)
    prefs = client.get("/api/notifications/preferences").json()
    assert [p["key"] for p in prefs][:3] == ["important", "notices", "classes"]
    changed = client.patch("/api/notifications/preferences",
                           {"changes": {"feed": {"email": True}}}, content_type="application/json")
    assert {p["key"]: p["email"] for p in changed.json()}["feed"] is True
    bad = client.patch("/api/notifications/preferences",
                       {"changes": {"account": {"in_app": False}}},
                       content_type="application/json")
    assert bad.status_code == 422
