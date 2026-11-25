"""Class representatives (CR and GR): students a teacher or admin names to act for their class.

A CR or GR represents one section (academic.Cohort, e.g. "BS CS · 2024–2028 · Morning · A") for
one term, and can cancel or shift its lectures and take its attendance, in every subject it has
that term. Admins and the department's coordinators choose them; a section has one of each. Each
subject's teachers decide whether those changes need their approval first.
"""

from django.conf import settings
from django.db import models

from apps.core.models import InstitutionScopedModel


class ClassRep(InstitutionScopedModel):
    class Role(models.TextChoices):
        CR = "cr", "CR"
        GR = "gr", "GR"

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rep_roles"
    )
    role = models.CharField(max_length=2, choices=Role.choices)
    term = models.ForeignKey("academic.AcademicTerm", on_delete=models.CASCADE, related_name="+")
    cohort = models.ForeignKey("academic.Cohort", on_delete=models.CASCADE, related_name="reps")
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["student", "term", "cohort"],
                                    name="one_rep_role_per_section"),
            # One CR and one GR per section and term: naming another replaces them.
            models.UniqueConstraint(fields=["term", "cohort", "role"],
                                    name="one_holder_per_section_role"),
        ]

    def __str__(self):
        return f"{self.get_role_display()} {self.student} ({self.cohort})"


class TeacherRepSetting(models.Model):
    """A teacher's choice: CR/GR changes to their lectures go through at once, or wait for them."""

    teacher = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rep_setting"
    )
    without_approval = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.teacher}: {'no approval' if self.without_approval else 'approval'}"


class RepBlock(InstitutionScopedModel):
    """A teacher took a CR/GR's power over their lectures back (they said "I didn't know")."""

    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+"
    )
    rep = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["teacher", "rep"], name="one_block_per_pair"),
        ]


class RepRequest(InstitutionScopedModel):
    """A CR/GR's cancel, shift or attendance for one lecture, and where it stands."""

    class Action(models.TextChoices):
        CANCEL = "cancel"
        SHIFT = "shift"
        ATTENDANCE = "attendance"

    class Stage(models.TextChoices):
        CR_APPROVAL = "cr_approval"  # a GR's cancellation waits for a CR
        TEACHER_APPROVAL = "teacher_approval"
        APPLIED = "applied"
        DECLINED = "declined"
        EXPIRED = "expired"  # not approved 15 minutes before the lecture
        UNDONE = "undone"  # the teacher said they didn't know

    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="rep_requests"
    )
    role = models.CharField(max_length=2, choices=ClassRep.Role.choices)
    meeting = models.ForeignKey("scheduling.ClassMeeting", null=True, blank=True,
                                on_delete=models.CASCADE, related_name="+")
    section = models.ForeignKey("academic.Section", on_delete=models.CASCADE, related_name="+")
    date = models.DateField(help_text="The lecture's date")
    action = models.CharField(max_length=16, choices=Action.choices)
    new_date = models.DateField(null=True, blank=True)
    new_starts_at = models.TimeField(null=True, blank=True)
    new_ends_at = models.TimeField(null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)
    attendance_session = models.ForeignKey(
        "attendance.AttendanceSession", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+",
    )
    change = models.ForeignKey("scheduling.ScheduleChange", null=True, blank=True,
                               on_delete=models.SET_NULL, related_name="+")
    stage = models.CharField(max_length=20, choices=Stage.choices)
    approved_by_cr = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                       on_delete=models.SET_NULL, related_name="+")
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="+")
    decided_at = models.DateTimeField(null=True, blank=True)
    teacher_reply = models.CharField(max_length=8, blank=True,
                                     help_text="known / unknown, after an automatic change")

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["section", "stage"])]
