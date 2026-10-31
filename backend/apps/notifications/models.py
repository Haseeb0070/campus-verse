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
