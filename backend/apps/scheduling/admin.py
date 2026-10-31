from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import ClassMeeting, Room, ScheduleChange


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("code", "building", "capacity", "institution")
    list_filter = ("institution",)
    search_fields = ("code", "building")


@admin.register(ClassMeeting)
class ClassMeetingAdmin(SimpleHistoryAdmin):
    list_display = ("section", "weekday", "starts_at", "ends_at", "kind", "mode", "room")
    list_filter = ("weekday", "mode", "kind", "section__offering__term")


@admin.register(ScheduleChange)
class ScheduleChangeAdmin(SimpleHistoryAdmin):
    list_display = ("meeting", "date", "status", "new_date", "new_room", "created_by")
    list_filter = ("status",)

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)
