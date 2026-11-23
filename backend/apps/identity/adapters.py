import ipaddress

from allauth.account.adapter import DefaultAccountAdapter
from django.conf import settings


def _valid_ip(value: str) -> str | None:
    value = value.strip()
    if value.startswith("[") and "]" in value:  # [ipv6]:port
        value = value[1 : value.index("]")]
    elif value.count(":") == 1:  # ipv4:port
        value = value.split(":")[0]
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        # Accounts come from admin invites or imports (SRS FR-AUTH-06).
        return settings.CAMPUSVERSE_OPEN_SIGNUP

    def get_client_ip(self, request):
        """The visitor's own address, for sign-in limits.

        Online, every request reaches Django through Render's proxy (and the web app's through
        Vercel too), so REMOTE_ADDR is the proxy's address and everyone would share one count:
        a few wrong passwords anywhere would lock the whole college out. The visitor's address
        is the first one in X-Forwarded-For. Someone could fake that header to dodge the
        per-address count, but each account still has its own limit (the "key" part).
        """
        for part in request.headers.get("x-forwarded-for", "").split(","):
            ip = _valid_ip(part)
            if ip:
                return ip
        return super().get_client_ip(request)
