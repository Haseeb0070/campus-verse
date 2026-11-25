from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.models import InstitutionScopedModel, TimeStampedModel


class Institution(TimeStampedModel):
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    timezone = models.CharField(max_length=64, default="Asia/Karachi")
    is_active = models.BooleanField(default=True)
    # Attendance only exists once the institution approves it (SRS 5.12), and students only
    # see their own records if its policy allows.
    attendance_enabled = models.BooleanField(default=False)
    attendance_visible_to_students = models.BooleanField(default=False)
    # The site's look, chosen by its admins (see apps/academic/theme.py).
    theme = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.name


class Campus(InstitutionScopedModel):
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=32)

    class Meta:
        verbose_name_plural = "campuses"
        constraints = [
            models.UniqueConstraint(fields=["institution", "code"], name="uniq_campus_code")
        ]

    def __str__(self):
        return self.name


class Department(InstitutionScopedModel):
    campus = models.ForeignKey(Campus, null=True, blank=True, on_delete=models.PROTECT)
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=32)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["institution", "code"], name="uniq_department_code")
        ]

    def __str__(self):
        return self.name


class Program(InstitutionScopedModel):
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="programs")
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=32)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["institution", "code"], name="uniq_program_code")
        ]

    def __str__(self):
        return self.name


class AcademicTerm(InstitutionScopedModel):
    name = models.CharField(max_length=100)  # "Fall 2026"
    code = models.CharField(max_length=32)
    starts_on = models.DateField()
    ends_on = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["institution", "code"], name="uniq_term_code")
        ]

    def __str__(self):
        return self.name


class Course(InstitutionScopedModel):
    class Color(models.TextChoices):
        """Matches the course colours in the web theme; one per course, used everywhere."""

        LAGOON = "lagoon"
        TANGERINE = "tangerine"
        ORCHID = "orchid"
        ROSE = "rose"
        SKY = "sky"
        LIME = "lime"
        GOLD = "gold"
        SLATE = "slate"

    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="courses")
    code = models.CharField(max_length=32)  # "CS-301"
    title = models.CharField(max_length=200)
    color = models.CharField(max_length=16, choices=Color.choices, default=Color.SLATE)
    credit_hours = models.PositiveSmallIntegerField(default=3)
    is_active = models.BooleanField(default=True)
    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["institution", "code"], name="uniq_course_code")
        ]

    def __str__(self):
        return f"{self.code} {self.title}"


class CourseOffering(InstitutionScopedModel):
    """A course taught in one term. Sections hang off the offering."""

    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="offerings")
    term = models.ForeignKey(AcademicTerm, on_delete=models.PROTECT, related_name="offerings")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["course", "term"], name="uniq_offering_per_term")
        ]

    def __str__(self):
        return f"{self.course.code} · {self.term.name}"


class Cohort(InstitutionScopedModel):
    """A group of students who study together through their degree: "BS Computer Science ·
    2024–2028 · Morning · A". Shown to people as a **Section**. Each term it has subjects (the
    Section model below, shown as **Subject**), and its students are enrolled in all of them; its
    CR and GR (apps.classreps) act for it in every subject."""

    class Shift(models.TextChoices):
        MORNING = "morning", "Morning"
        EVENING = "evening", "Evening"

    class Status(models.TextChoices):
        ACTIVE = "active"
        ARCHIVED = "archived"

    program = models.ForeignKey(Program, null=True, blank=True, on_delete=models.PROTECT,
                                related_name="cohorts")
    code = models.CharField(max_length=16, help_text='Short name used everywhere, e.g. "CS24-MA"')
    name = models.CharField(max_length=40, blank=True, help_text='e.g. "A"')
    shift = models.CharField(max_length=8, choices=Shift.choices, blank=True)
    start_year = models.PositiveSmallIntegerField(null=True, blank=True)
    end_year = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["institution", "code"], name="uniq_cohort_code")
        ]
        ordering = ["-start_year", "code"]

    @property
    def label(self) -> str:
        """ "BS Computer Science · 2024–2028 · Morning · A", leaving out what isn't set."""
        years = (f"{self.start_year}–{self.end_year}" if self.start_year and self.end_year
                 else str(self.start_year or self.end_year or ""))
        parts = [self.program.name if self.program_id else "", years,
                 self.get_shift_display() if self.shift else "", self.name]
        return " · ".join(p for p in parts if p) or self.code

    def __str__(self):
        return self.code


class CohortMember(InstitutionScopedModel):
    """A student's place in a section. Joining enrolls them in its subjects; leaving drops them."""

    class Status(models.TextChoices):
        ACTIVE = "active"
        LEFT = "left"

    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name="members")
    student = models.ForeignKey("identity.User", on_delete=models.CASCADE,
                                related_name="cohort_memberships")
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)
    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["cohort", "student"], name="uniq_cohort_member")
        ]

    def __str__(self):
        return f"{self.student} in {self.cohort}"


class Section(InstitutionScopedModel):
    """A subject: one course taught to one cohort (section) in one term. Students enroll in it,
    teachers are assigned to it. People see it as a **Subject**; the name Section stays in code."""

    class Status(models.TextChoices):
        ACTIVE = "active"
        ARCHIVED = "archived"

    offering = models.ForeignKey(CourseOffering, on_delete=models.PROTECT, related_name="sections")
    #: The section (cohort) this subject is taught to. Its code is the cohort's code.
    cohort = models.ForeignKey(Cohort, null=True, blank=True, on_delete=models.PROTECT,
                               related_name="subjects")
    code = models.CharField(max_length=16)  # "3B"
    program = models.ForeignKey(Program, null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["offering", "code"], name="uniq_section_code")
        ]

    def __str__(self):
        return f"{self.offering.course.code} · {self.code}"
