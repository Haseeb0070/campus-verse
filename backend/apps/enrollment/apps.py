from django.apps import AppConfig


class EnrollmentConfig(AppConfig):
    name = "apps.enrollment"
    label = "enrollment"

    def ready(self):
        from . import signals  # noqa: F401
