from django.contrib import admin

from .models import Resource, ResourceVersion


class VersionInline(admin.TabularInline):
    model = ResourceVersion
    extra = 0
    readonly_fields = ("number", "file", "note", "uploaded_by", "created_at")
    can_delete = False


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "offering", "status", "created_by", "updated_at")
    list_filter = ("status", "kind", "institution")
    search_fields = ("title", "description")
    inlines = [VersionInline]
