from django.conf import settings
from django.db import models

from apps.core.models import InstitutionScopedModel


class Notification(InstitutionScopedModel):
    """One in-app notification for one person. The underlying record (notice, assignment,
    class) is the source of truth; this only points at it, so a failed delivery loses nothing."""

    class Kind(models.TextChoices):
        NOTICE = "notice.published"
        CLASS_CHANGED = "class.changed"
        ASSIGNMENT_OPENED = "assignment.opened"
        ASSIGNMENT_DUE_SOON = "assignment.due_soon"
        GRADES_RELEASED = "grades.released"
        FEED_COMMENT = "feed.comment"
        MODERATION = "moderation.action"
        RESOURCE = "resource.shared"
        CORRECTION = "account.correction"
        EVENT = "event.update"
        DIRECT_MESSAGE = "message.direct"
        SYNC = "sync.update"
        CLASS_REP = "class.rep"
        CLASS_REMINDER = "class.reminder"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    kind = models.CharField(max_length=32, choices=Kind.choices)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=300, blank=True)
    link = models.CharField(max_length=200, blank=True, help_text="Path in the web app")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    dedupe_key = models.CharField(
        max_length=120, help_text="Same event, same person: never notified twice"
    )
    read_at = models.DateTimeField(null=True, blank=True)
    # The row is always kept as the record (and for de-duplication); these say how it reaches
    # the person, from their preferences at the time it was created.
    in_app = models.BooleanField(default=True)
    email_wanted = models.BooleanField(default=False)
    emailed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["recipient", "read_at", "created_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "dedupe_key"], name="uniq_notification_per_event"
            )
        ]

    def __str__(self):
        return f"{self.kind} → {self.recipient_id}"


class NotificationPreference(models.Model):
    """Per-person channel choices by notification group. Only changes from the defaults in
    preferences.GROUPS are stored, so new groups get sensible defaults automatically."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preference"
    )
    choices = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Notification preferences for {self.user_id}"


class PushDevice(models.Model):
    """A phone that gets push notifications: the Expo push token the app registered for the
    person signed in on it. A token moves to whoever signs in on that phone next, and is dropped
    when Expo says the app is gone from the phone."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_devices"
    )
    token = models.CharField(max_length=200, unique=True)
    platform = models.CharField(max_length=16, blank=True)  # "android" or "ios"
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.platform or 'phone'} for {self.user_id}"
