from django.conf import settings
from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.models import InstitutionScopedModel


class AttendanceSession(InstitutionScopedModel):
    """One class, on one day, that attendance was taken for (SRS 5.12)."""

    section = models.ForeignKey(
        "academic.Section", on_delete=models.CASCADE, related_name="attendance_sessions"
    )
    date = models.DateField()
    meeting = models.ForeignKey(
        "scheduling.ClassMeeting", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+", help_text="The timetabled class, when there is one",
    )
    taken_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    history = HistoricalRecords()

    class Meta:
        ordering = ["-date", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["section", "date", "meeting"],
                                    name="uniq_attendance_session")
        ]

    def __str__(self):
        return f"{self.section} · {self.date}"


class AttendanceRecord(InstitutionScopedModel):
    class Status(models.TextChoices):
        PRESENT = "present"
        LATE = "late"
        ABSENT = "absent"
        EXCUSED = "excused"

    session = models.ForeignKey(
        AttendanceSession, on_delete=models.CASCADE, related_name="records"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attendance"
    )
    status = models.CharField(max_length=16, choices=Status.choices)
    note = models.CharField(max_length=200, blank=True)
    history = HistoricalRecords()  # corrections are kept, not overwritten (SRS 5.12)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["session", "student"], name="uniq_attendance_record")
        ]
