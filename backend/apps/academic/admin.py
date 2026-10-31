from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import (
    AcademicTerm,
    Campus,
    Course,
    CourseOffering,
    Department,
    Institution,
    Program,
    Section,
)


@admin.register(Institution)
class InstitutionAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "timezone", "is_active")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Campus, Department, Program, AcademicTerm)
class ScopedAdmin(admin.ModelAdmin):
    list_display = ("__str__", "institution")
    list_filter = ("institution",)


@admin.register(Course)
class CourseAdmin(SimpleHistoryAdmin):
    list_display = ("code", "title", "department", "is_active")
    list_filter = ("institution", "department", "is_active")
    search_fields = ("code", "title")


@admin.register(CourseOffering)
class CourseOfferingAdmin(admin.ModelAdmin):
    list_display = ("course", "term")
    list_filter = ("term",)


@admin.register(Section)
class SectionAdmin(SimpleHistoryAdmin):
    list_display = ("__str__", "offering", "program", "status")
    list_filter = ("status", "offering__term")
