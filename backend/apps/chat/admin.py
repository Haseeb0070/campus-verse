from django.contrib import admin

from .models import Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("__str__", "kind", "section", "last_message_at", "institution")
    list_filter = ("kind", "institution")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    """Metadata only: private message text isn't shown casually to administrators (SRS 5.10)."""

    list_display = ("id", "conversation", "sender", "created_at", "deleted_at")
    list_filter = ("conversation__kind",)
    fields = ("conversation", "sender", "created_at", "deleted_at", "deleted_by")
    readonly_fields = fields

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
