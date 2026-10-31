from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from simple_history.admin import SimpleHistoryAdmin

from .models import RoleAssignment, User


class UserCreateForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("email",)


class UserEditForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User
        fields = "__all__"


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    form = UserEditForm
    add_form = UserCreateForm
    ordering = ("email",)
    list_display = ("email", "first_name", "last_name", "kind", "institution", "is_active")
    list_filter = ("kind", "institution", "is_active", "is_staff")
    search_fields = ("email", "first_name", "last_name", "external_id")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("first_name", "last_name", "kind", "institution", "external_id")}),
        ("Access", {"fields": ("is_active", "is_staff", "is_superuser", "groups")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),
    )


@admin.register(RoleAssignment)
class RoleAssignmentAdmin(SimpleHistoryAdmin):
    list_display = ("user", "role", "department", "institution", "granted_by")
    list_filter = ("role", "institution")
    autocomplete_fields = ("user",)

    def save_model(self, request, obj, form, change):
        if not change:
            obj.granted_by = request.user
        super().save_model(request, obj, form, change)
