from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.audience import visible_q
from apps.core.models import (
    AudienceTarget,
    InstitutionScopedModel,
    InstitutionScopedQuerySet,
    StoredFile,
)


class ResourceQuerySet(InstitutionScopedQuerySet):
    def visible_to(self, user):
        return self.filter(visible_q(user, Resource))


class Resource(InstitutionScopedModel):
    """Course material (SRS 5.7): a file or a link, shared with sections of one course offering.
    Who sees it is decided by its AudienceTargets, like notices and posts. Replacing the file
    adds a version instead of overwriting, and outdated material is archived, never deleted."""

    class Kind(models.TextChoices):
        SLIDES = "slides", "Lecture slides"
        NOTES = "notes", "Notes"
        READING = "reading", "Reading"
        REFERENCE = "reference", "Reference"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        ACTIVE = "active"
        ARCHIVED = "archived"

    offering = models.ForeignKey(
        "academic.CourseOffering", on_delete=models.PROTECT, related_name="resources"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(max_length=2000, blank=True)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.NOTES)
    url = models.URLField(max_length=500, blank=True, help_text="Set for links; blank for files")
    targets = GenericRelation(AudienceTarget)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    history = HistoricalRecords()

    objects = ResourceQuerySet.as_manager()

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [models.Index(fields=["institution", "offering", "status"])]

    def __str__(self):
        return self.title


class ResourceVersion(InstitutionScopedModel):
    """One uploaded file of a resource. The highest number is the current one; earlier ones
    stay downloadable for the people who manage the resource."""

    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveSmallIntegerField()
    file = models.ForeignKey(StoredFile, on_delete=models.PROTECT, related_name="+")
    note = models.CharField(max_length=200, blank=True, help_text="What changed")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-number"]
        constraints = [
            models.UniqueConstraint(fields=["resource", "number"], name="uniq_resource_version")
        ]

    def __str__(self):
        return f"{self.resource} v{self.number}"


class ResourceDownload(InstitutionScopedModel):
    """One download of a resource file, for usage reports (SRS 12.1). Reports only ever show
    counts, never who downloaded what."""

    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name="downloads")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")

    class Meta:
        indexes = [models.Index(fields=["institution", "created_at"])]
