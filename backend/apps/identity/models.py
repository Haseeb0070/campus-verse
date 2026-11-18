from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.models import InstitutionScopedModel


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Users need an email address.")
        user = self.model(email=self.normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.update(is_staff=True, is_superuser=True)
        return self._create_user(email, password, **extra)


class User(AbstractUser):
    """Signs in with email. `kind` describes the person; permissions come from RoleAssignment,
    teacher assignments and enrollments, never from what someone picked at sign-up."""

    class Kind(models.TextChoices):
        STUDENT = "student"
        TEACHER = "teacher"
        STAFF = "staff"

    username = None
    email = models.EmailField(unique=True)
    institution = models.ForeignKey(
        "academic.Institution",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="members",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.STUDENT)
    external_id = models.CharField(
        max_length=64, blank=True, help_text="ID in the institution's own system"
    )
    # The one name people choose themselves (FR-AUTH-07); legal names come from the institution.
    preferred_name = models.CharField(
        max_length=60, blank=True, help_text="Shown instead of the first name"
    )

    class Appearance(models.TextChoices):
        LIGHT = "light"
        DARK = "dark"

    # Light or dark, chosen by the person (never taken from the device).
    appearance = models.CharField(
        max_length=8, choices=Appearance.choices, default=Appearance.LIGHT
    )

    # Their own name for the guide; only used when the institution lets people rename it.
    guide_name = models.CharField(max_length=24, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["institution", "external_id"],
                condition=~models.Q(external_id=""),
                name="uniq_user_external_id",
            )
        ]

    def __str__(self):
        return self.get_full_name() or self.email

    def get_full_name(self):
        return f"{self.preferred_name or self.first_name} {self.last_name}".strip()


class RoleAssignment(InstitutionScopedModel):
    """Elevated, scoped roles. Granted by staff only; every change is kept in history."""

    class Role(models.TextChoices):
        INSTITUTION_ADMIN = "institution_admin"
        DEPARTMENT_COORDINATOR = "department_coordinator"
        MODERATOR = "moderator"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="roles")
    role = models.CharField(max_length=32, choices=Role.choices)
    department = models.ForeignKey(
        "academic.Department", null=True, blank=True, on_delete=models.CASCADE
    )
    granted_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    history = HistoricalRecords()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "role", "department"],
                condition=models.Q(department__isnull=False),
                name="uniq_department_role",
            ),
            models.UniqueConstraint(
                fields=["user", "role", "institution"],
                condition=models.Q(department__isnull=True),
                name="uniq_institution_role",
            ),
        ]

    def __str__(self):
        return f"{self.user} · {self.get_role_display()}"


class CorrectionRequest(InstitutionScopedModel):
    """Someone asking for their official record to be fixed (SRS 9.4): a wrong name, email,
    enrollment or anything else they can't change themselves. Admins resolve it."""

    class Topic(models.TextChoices):
        NAME = "name", "My name"
        EMAIL = "email", "My email"
        ENROLLMENT = "enrollment", "My courses or sections"
        OTHER = "other", "Something else"

    class Status(models.TextChoices):
        OPEN = "open"
        RESOLVED = "resolved"
        DECLINED = "declined"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="corrections")
    topic = models.CharField(max_length=16, choices=Topic.choices)
    details = models.TextField(max_length=1000)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    response = models.CharField(max_length=500, blank=True)
    resolved_by = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["institution", "status"])]

    def __str__(self):
        return f"{self.user} · {self.get_topic_display()}"
