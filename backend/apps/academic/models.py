from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.models import InstitutionScopedModel, TimeStampedModel


class Institution(TimeStampedModel):
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    timezone = models.CharField(max_length=64, default="Asia/Karachi")
    is_active = models.BooleanField(default=True)

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
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="courses")
    code = models.CharField(max_length=32)  # "CS-301"
    title = models.CharField(max_length=200)
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


class Section(InstitutionScopedModel):
    """The unit of membership: students enroll in sections, teachers are assigned to them."""

    class Status(models.TextChoices):
        ACTIVE = "active"
        ARCHIVED = "archived"

    offering = models.ForeignKey(CourseOffering, on_delete=models.PROTECT, related_name="sections")
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
