from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class InstitutionScopedQuerySet(models.QuerySet):
    def for_institution(self, institution):
        return self.filter(institution=institution)


class InstitutionScopedModel(TimeStampedModel):
    """Base for every record that belongs to one institution (the tenant boundary).

    Queries must be narrowed explicitly with `.for_institution()` or through the audience
    resolver; there is deliberately no implicit thread-local scoping.
    """

    institution = models.ForeignKey(
        "academic.Institution", on_delete=models.PROTECT, related_name="+"
    )

    objects = InstitutionScopedQuerySet.as_manager()

    class Meta:
        abstract = True


class AudienceScope(models.TextChoices):
    INSTITUTION = "institution"
    CAMPUS = "campus"
    DEPARTMENT = "department"
    PROGRAM = "program"
    OFFERING = "offering"  # every section of one course in one term
    SECTION = "section"


class AudienceTarget(InstitutionScopedModel):
    """Who may see a piece of content (notice, post, resource, event).

    Content is visible to a user when any of its targets is in that user's context set.
    """

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveBigIntegerField()
    content = GenericForeignKey("content_type", "object_id")
    scope_type = models.CharField(max_length=20, choices=AudienceScope.choices)
    scope_id = models.PositiveBigIntegerField()

    class Meta:
        indexes = [
            models.Index(fields=["content_type", "object_id"]),
            models.Index(fields=["scope_type", "scope_id"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["content_type", "object_id", "scope_type", "scope_id"],
                name="uniq_audience_target",
            )
        ]

    def __str__(self):
        return f"{self.content_type.model}:{self.object_id} → {self.scope_type}:{self.scope_id}"
