from django.contrib import admin

from .models import Post, Report


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("id", "author", "visibility", "created_at", "deleted_at")
    list_filter = ("visibility", "institution")
    search_fields = ("body", "author__email")
    readonly_fields = ("author", "created_at")


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ("id", "reason", "status", "reporter", "resolution", "created_at")
    list_filter = ("status", "reason")
