from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey, GenericRelation
from django.contrib.contenttypes.models import ContentType
from django.db import models

from apps.core.audience import visible_q
from apps.core.models import (
    AudienceTarget,
    InstitutionScopedModel,
    InstitutionScopedQuerySet,
    StoredFile,
)


class Visibility(models.TextChoices):
    VISIBLE = "visible"
    HIDDEN = "hidden"  # by a moderator; reversible
    REMOVED = "removed"  # by a moderator after review; kept for the record, never shown


class PostQuerySet(InstitutionScopedQuerySet):
    def visible_to(self, user):
        return self.filter(visible_q(user, Post), deleted_at__isnull=True)


class Post(InstitutionScopedModel):
    """A feed post in an academic space (FR-FEED-01..03). Who sees it is decided by its
    AudienceTargets, exactly like notices."""

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="posts"
    )
    body = models.TextField(max_length=5000)
    attachments = models.ManyToManyField(StoredFile, blank=True, related_name="+")
    targets = GenericRelation(AudienceTarget)
    visibility = models.CharField(
        max_length=16, choices=Visibility.choices, default=Visibility.VISIBLE
    )
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = PostQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["institution", "visibility", "created_at"])]

    def __str__(self):
        return f"Post {self.pk} by {self.author_id}"


class Comment(InstitutionScopedModel):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="replies"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="comments"
    )
    body = models.TextField(max_length=2000)
    visibility = models.CharField(
        max_length=16, choices=Visibility.choices, default=Visibility.VISIBLE
    )
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["post", "created_at"])]


class Reaction(InstitutionScopedModel):
    """One like per person per post (FR-FEED-05): one quiet signal, not a set of near-synonyms."""

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="reactions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["post", "user"], name="one_reaction_per_person")
        ]


class Report(InstitutionScopedModel):
    """A report about a post or comment (FR-FEED-06, SRS 6.5)."""

    class Reason(models.TextChoices):
        SPAM = "spam"
        HARASSMENT = "harassment"
        INAPPROPRIATE = "inappropriate"
        OFF_TOPIC = "off_topic"
        OTHER = "other"

    class Status(models.TextChoices):
        OPEN = "open"
        DISMISSED = "dismissed"
        ACTIONED = "actioned"

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveBigIntegerField()
    target = GenericForeignKey("content_type", "object_id")
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    reason = models.CharField(max_length=20, choices=Reason.choices)
    details = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
        related_name="+",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution = models.CharField(max_length=20, blank=True)  # dismiss | hide | remove
    note = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["institution", "status"])]
        constraints = [
            models.UniqueConstraint(
                fields=["content_type", "object_id", "reporter"],
                condition=models.Q(status="open"),
                name="one_open_report_per_person",
            )
        ]
