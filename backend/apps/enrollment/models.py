from django.conf import settings
from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.models import InstitutionScopedModel


class TeacherAssignment(InstitutionScopedModel):
    class Role(models.TextChoices):
        LEAD = "lead"
        ASSISTANT = "assistant"

    section = models.ForeignKey(
        "academic.Section", on_delete=models.CASCADE, related_name="teacher_assignments"
    )
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="teaching"
    )
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.LEAD)
    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["section", "teacher"], name="uniq_teacher_per_section")
        ]

    def __str__(self):
        return f"{self.teacher} teaches {self.section}"


class SectionEnrollment(InstitutionScopedModel):
    class Status(models.TextChoices):
        ACTIVE = "active"
        DROPPED = "dropped"
        COMPLETED = "completed"

    section = models.ForeignKey(
        "academic.Section", on_delete=models.CASCADE, related_name="enrollments"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="enrollments"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["section", "student"], name="uniq_student_per_section")
        ]
        indexes = [models.Index(fields=["student", "status"])]

    def __str__(self):
        return f"{self.student} in {self.section}"
