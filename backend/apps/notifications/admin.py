from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "recipient", "title", "read_at")
    list_filter = ("kind", "institution")
    search_fields = ("title", "recipient__email")
    readonly_fields = [f.name for f in Notification._meta.fields]

    def has_add_permission(self, request):
        return False
