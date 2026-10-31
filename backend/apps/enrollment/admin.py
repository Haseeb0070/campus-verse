from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import SectionEnrollment, TeacherAssignment


@admin.register(TeacherAssignment)
class TeacherAssignmentAdmin(SimpleHistoryAdmin):
    list_display = ("teacher", "section", "role")
    list_filter = ("role", "section__offering__term")
    autocomplete_fields = ("teacher",)


@admin.register(SectionEnrollment)
class SectionEnrollmentAdmin(SimpleHistoryAdmin):
    list_display = ("student", "section", "status")
    list_filter = ("status", "section__offering__term")
    autocomplete_fields = ("student",)
