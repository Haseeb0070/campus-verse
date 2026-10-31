from django.conf import settings
from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.models import InstitutionScopedModel, StoredFile


class Assignment(InstitutionScopedModel):
    class Status(models.TextChoices):
        DRAFT = "draft"
        PUBLISHED = "published"

    class SubmissionType(models.TextChoices):
        TEXT = "text"
        FILE = "file"
        BOTH = "both"  # text, files, or both

    section = models.ForeignKey(
        "academic.Section", on_delete=models.CASCADE, related_name="assignments"
    )
    title = models.CharField(max_length=200)
    instructions = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PUBLISHED)
    available_from = models.DateTimeField()
    due_at = models.DateTimeField()
    submission_type = models.CharField(
        max_length=8, choices=SubmissionType.choices, default=SubmissionType.FILE
    )
    max_points = models.PositiveIntegerField(default=10)
    allow_late = models.BooleanField(default=False)
    late_until = models.DateTimeField(
        null=True, blank=True, help_text="Last moment late work is accepted (blank: any time)"
    )
    max_attempts = models.PositiveSmallIntegerField(default=1)
    attachments = models.ManyToManyField(StoredFile, blank=True, related_name="+")
    grades_released_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    history = HistoricalRecords()

    class Meta:
        indexes = [models.Index(fields=["section", "due_at"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(due_at__gt=models.F("available_from")),
                name="assignment_due_after_available",
            ),
            models.CheckConstraint(
                condition=models.Q(max_attempts__gte=1), name="assignment_min_one_attempt"
            ),
        ]

    def __str__(self):
        return self.title


class Submission(InstitutionScopedModel):
    """One attempt. Attempts are never overwritten; the latest one is the one that's graded."""

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="submissions"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="submissions"
    )
    attempt = models.PositiveSmallIntegerField()
    text = models.TextField(blank=True)
    files = models.ManyToManyField(StoredFile, blank=True, related_name="+")
    submitted_at = models.DateTimeField(auto_now_add=True)
    is_late = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "student", "attempt"], name="uniq_submission_attempt"
            )
        ]
        indexes = [models.Index(fields=["assignment", "student"])]

    def __str__(self):
        return f"{self.student} · {self.assignment} · attempt {self.attempt}"


class Grade(InstitutionScopedModel):
    """Marks and feedback. Students only see them after the teacher releases the assignment's
    grades (SRS FR-ASG-07). Every change is kept in history and the audit log."""

    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name="grades")
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="grades"
    )
    points = models.DecimalField(max_digits=6, decimal_places=2)
    feedback = models.TextField(blank=True)
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["assignment", "student"], name="uniq_grade")
        ]
