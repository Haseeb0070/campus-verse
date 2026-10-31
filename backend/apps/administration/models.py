from django.conf import settings
from django.db import models

from apps.core.models import InstitutionScopedModel, StoredFile


class SyncSource(InstitutionScopedModel):
    """An approved place CampusVerse fetches institutional data from on a schedule (SRS 11.2,
    "scheduled feed"): an HTTPS URL that serves a CSV or Excel export. Each source has an owner,
    a purpose and a scope (one import kind), and every fetch goes through the same preview as an
    upload. It applies itself only when allowed to and nothing looks suspicious (SRS 11.4)."""

    class Schedule(models.TextChoices):
        MANUAL = "manual", "Only when run by hand"
        DAILY = "daily", "Every day"
        HOURLY = "hourly", "Every hour"

    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=32)  # an ImportRun.Kind
    url = models.URLField(max_length=500)
    auth_header = models.CharField(
        max_length=500, blank=True, help_text="Sent as Authorization; never shown again in full"
    )
    purpose = models.CharField(max_length=300, blank=True)
    schedule = models.CharField(max_length=16, choices=Schedule.choices, default=Schedule.DAILY)
    auto_apply = models.BooleanField(
        default=False, help_text="Apply clean, unsurprising runs without waiting for review"
    )
    is_active = models.BooleanField(default=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+",
        help_text="Told about failures and runs that need review",
    )
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ImportRun(InstitutionScopedModel):
    """One file through the sync pipeline: validate → match → preview → (apply | discard).
    The preview is kept so admins can see exactly what was proposed and what was applied."""

    class Kind(models.TextChoices):
        TIMETABLE = "timetable"
        PEOPLE = "people"
        ENROLLMENT = "enrollment"

    class Status(models.TextChoices):
        PREVIEW = "preview"
        APPLIED = "applied"
        DISCARDED = "discarded"

    kind = models.CharField(max_length=32, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PREVIEW)
    source_file = models.ForeignKey(StoredFile, on_delete=models.PROTECT, related_name="+")
    source = models.ForeignKey(
        SyncSource, null=True, blank=True, on_delete=models.SET_NULL, related_name="runs"
    )
    held_reason = models.CharField(
        max_length=300, blank=True, help_text="Why a scheduled run waited for a person"
    )
    term = models.ForeignKey(
        "academic.AcademicTerm", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
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
