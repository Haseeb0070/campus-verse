from django.conf import settings
from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.models import InstitutionScopedModel


class Room(InstitutionScopedModel):
    code = models.CharField(max_length=32)  # "B-204"
    building = models.CharField(max_length=100, blank=True)
    capacity = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["institution", "code"], name="uniq_room_code")
        ]

    def __str__(self):
        return self.code


class ClassMeeting(InstitutionScopedModel):
    """A weekly slot for a section, e.g. CS-301 · 3B every Thursday 10:30–11:50 in B-204.

    Times are local to the institution's timezone. A meeting runs for the section's term.
    """

    class Weekday(models.IntegerChoices):
        MONDAY = 0
        TUESDAY = 1
        WEDNESDAY = 2
        THURSDAY = 3
        FRIDAY = 4
        SATURDAY = 5
        SUNDAY = 6

    class Mode(models.TextChoices):
        IN_PERSON = "in_person"
        ONLINE = "online"

    class Kind(models.TextChoices):
        LECTURE = "lecture"
        LAB = "lab"
        TUTORIAL = "tutorial"

    section = models.ForeignKey(
        "academic.Section", on_delete=models.CASCADE, related_name="meetings"
    )
    weekday = models.PositiveSmallIntegerField(choices=Weekday.choices)
    starts_at = models.TimeField()
    ends_at = models.TimeField()
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.LECTURE)
    mode = models.CharField(max_length=16, choices=Mode.choices, default=Mode.IN_PERSON)
    room = models.ForeignKey(Room, null=True, blank=True, on_delete=models.SET_NULL)
    online_url = models.URLField(blank=True)
    history = HistoricalRecords()

    class Meta:
        indexes = [models.Index(fields=["section", "weekday"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__gt=models.F("starts_at")),
                name="meeting_ends_after_start",
            )
        ]

    def __str__(self):
        return f"{self.section} · {self.get_weekday_display()} {self.starts_at:%H:%M}"


class ScheduleChange(InstitutionScopedModel):
    """A one-off change to one occurrence of a meeting: cancelled, moved, or a new room."""

    class Status(models.TextChoices):
        CANCELLED = "cancelled"
        MOVED = "moved"
        ROOM_CHANGED = "room_changed"

    meeting = models.ForeignKey(ClassMeeting, on_delete=models.CASCADE, related_name="changes")
    date = models.DateField(help_text="Date of the occurrence being changed")
    status = models.CharField(max_length=16, choices=Status.choices)
    new_date = models.DateField(null=True, blank=True)
    new_starts_at = models.TimeField(null=True, blank=True)
    new_ends_at = models.TimeField(null=True, blank=True)
    new_room = models.ForeignKey(
        Room, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.CharField(max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["meeting", "date"], name="uniq_change_per_occurrence")
        ]

    def __str__(self):
        return f"{self.meeting} on {self.date}: {self.get_status_display()}"
