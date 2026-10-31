from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Event, EventRegistration


class RegistrationInline(admin.TabularInline):
    model = EventRegistration
    extra = 0
    readonly_fields = ("user", "status", "created_at")
    can_delete = False


@admin.register(Event)
class EventAdmin(SimpleHistoryAdmin):
    list_display = ("title", "category", "starts_at", "status", "organizer", "institution")
    list_filter = ("category", "status", "institution")
    search_fields = ("title", "description")
    inlines = [RegistrationInline]
