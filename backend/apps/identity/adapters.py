from allauth.account.adapter import DefaultAccountAdapter
from django.conf import settings


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        # Accounts come from admin invites or imports (SRS FR-AUTH-06).
        return settings.CAMPUSVERSE_OPEN_SIGNUP
