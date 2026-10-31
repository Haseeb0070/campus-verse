from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.core.audience import invalidate_context

from .models import SectionEnrollment, TeacherAssignment


@receiver([post_save, post_delete], sender=SectionEnrollment)
def enrollment_changed(sender, instance, **kwargs):
    invalidate_context(instance.student_id)


@receiver([post_save, post_delete], sender=TeacherAssignment)
def assignment_changed(sender, instance, **kwargs):
    invalidate_context(instance.teacher_id)
