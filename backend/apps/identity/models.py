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
