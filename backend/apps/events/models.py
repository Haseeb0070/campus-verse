from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.audience import visible_q
from apps.core.models import AudienceTarget, InstitutionScopedModel, InstitutionScopedQuerySet


class EventQuerySet(InstitutionScopedQuerySet):
    def visible_to(self, user):
        """Events for your audiences, plus the ones you organise."""
        return self.filter(visible_q(user, Event) | models.Q(organizer=user))


class Event(InstitutionScopedModel):
    """Exams, holidays, seminars, workshops and campus events (SRS 5.11). Who sees it is decided by
    its AudienceTargets, like notices. Registration is optional, with an optional capacity."""

    class Category(models.TextChoices):
        EXAM = "exam", "Exam"
        HOLIDAY = "holiday", "Holiday"
        SEMINAR = "seminar", "Seminar"
        WORKSHOP = "workshop", "Workshop"
        EVENT = "event", "Campus event"
        DEADLINE = "deadline", "Deadline"

    class Mode(models.TextChoices):
        IN_PERSON = "in_person", "In person"
        ONLINE = "online", "Online"
        HYBRID = "hybrid", "In person and online"

    class Status(models.TextChoices):
        SCHEDULED = "scheduled"
        CANCELLED = "cancelled"

    title = models.CharField(max_length=200)
    description = models.TextField(max_length=4000, blank=True)
    category = models.CharField(max_length=16, choices=Category.choices, default=Category.EVENT)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    all_day = models.BooleanField(default=False)
    mode = models.CharField(max_length=16, choices=Mode.choices, default=Mode.IN_PERSON)
    location = models.CharField(max_length=200, blank=True)
    online_url = models.URLField(max_length=500, blank=True)
    registration = models.BooleanField(default=False, help_text="People sign up to attend")
    capacity = models.PositiveIntegerField(null=True, blank=True, help_text="Blank: no limit")
    registration_closes_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SCHEDULED)
    cancel_reason = models.CharField(max_length=300, blank=True)
    organizer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="organized_events"
    )
    targets = GenericRelation(AudienceTarget)
    history = HistoricalRecords()

    objects = EventQuerySet.as_manager()

    class Meta:
        ordering = ["starts_at", "id"]
        indexes = [models.Index(fields=["institution", "starts_at"])]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__gte=models.F("starts_at")),
                name="event_ends_after_start",
            )
        ]

    def __str__(self):
        return self.title


class EventRegistration(InstitutionScopedModel):
    """One person's place at an event. When it's full, new sign-ups wait in line and move up in
    order as places free."""

    class Status(models.TextChoices):
        GOING = "going"
        WAITLISTED = "waitlisted"
        CANCELLED = "cancelled"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="registrations")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="event_registrations"
    )
    status = models.CharField(max_length=16, choices=Status.choices)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["event", "user"], name="uniq_event_registration")
        ]
        indexes = [models.Index(fields=["event", "status"])]

    def __str__(self):
        return f"{self.user} · {self.event} · {self.status}"
