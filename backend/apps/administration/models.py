from django.conf import settings
from django.db import models

from apps.core.models import InstitutionScopedModel, StoredFile


class ImportRun(InstitutionScopedModel):
    """One upload through the sync pipeline: validate → match → preview → (apply | discard).
    The preview is kept so admins can see exactly what was proposed and what was applied."""

    class Kind(models.TextChoices):
        TIMETABLE = "timetable"

    class Status(models.TextChoices):
        PREVIEW = "preview"
        APPLIED = "applied"
        DISCARDED = "discarded"

    kind = models.CharField(max_length=32, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PREVIEW)
    source_file = models.ForeignKey(StoredFile, on_delete=models.PROTECT, related_name="+")
    term = models.ForeignKey("academic.AcademicTerm", on_delete=models.PROTECT, related_name="+")
    plan = models.JSONField(default=dict, help_text="Rows, statuses and summary from the dry run")
    plan_signature = models.CharField(max_length=64)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    applied_at = models.DateTimeField(null=True, blank=True)
    applied_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
        related_name="+",
    )
    result = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_kind_display()} import {self.pk} ({self.status})"
