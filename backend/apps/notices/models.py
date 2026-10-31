from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from django.db.models import Q
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.audience import visible_q
from apps.core.models import AudienceTarget, InstitutionScopedModel, InstitutionScopedQuerySet


class NoticeQuerySet(InstitutionScopedQuerySet):
    def live(self, now=None):
        """Published and not past its expiry (FR-NOT-03)."""
        now = now or timezone.now()
        return self.published().filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))

    def published(self):
        return self.filter(status=Notice.Status.PUBLISHED)

    def visible_to(self, user):
        return self.filter(visible_q(user, Notice))


class Notice(InstitutionScopedModel):
    class Status(models.TextChoices):
        DRAFT = "draft"
        SCHEDULED = "scheduled"  # publishes itself at publish_at
        PUBLISHED = "published"
        ARCHIVED = "archived"

    class Priority(models.TextChoices):
        NORMAL = "normal"
        IMPORTANT = "important"

    title = models.CharField(max_length=200)
    body = models.TextField()
    priority = models.CharField(max_length=16, choices=Priority.choices, default=Priority.NORMAL)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="notices"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    publish_at = models.DateTimeField(
        null=True, blank=True, help_text="When a scheduled notice goes out"
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    targets = GenericRelation(AudienceTarget)
    history = HistoricalRecords()

    objects = NoticeQuerySet.as_manager()

    class Meta:
        indexes = [models.Index(fields=["institution", "status", "published_at"])]

    def __str__(self):
        return self.title
