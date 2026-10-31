from django.contrib import admin
from django.contrib.contenttypes.admin import GenericTabularInline
from simple_history.admin import SimpleHistoryAdmin

from apps.core.models import AudienceTarget

from .models import Notice


class AudienceTargetInline(GenericTabularInline):
    model = AudienceTarget
    extra = 0
    fields = ("scope_type", "scope_id")
    readonly_fields = ("scope_type", "scope_id")
    can_delete = False


@admin.register(Notice)
class NoticeAdmin(SimpleHistoryAdmin):
    list_display = ("title", "status", "priority", "author", "published_at", "institution")
    list_filter = ("status", "priority", "institution")
    search_fields = ("title",)
    inlines = [AudienceTargetInline]
