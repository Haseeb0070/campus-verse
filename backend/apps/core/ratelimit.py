"""Simple per-person limits on things that could be used to flood others: messages, uploads, posts
and comments. Counted in the shared cache (Redis, or the database table on hosts without it), so
every server process sees the same count."""

from django.core.cache import cache
from django.core.exceptions import PermissionDenied


class TooMany(PermissionDenied):
    """Raised when someone does something too often; the API answers 429."""


def limit(user, action: str, *, per_minute: int) -> None:
    """Allow `per_minute` of `action` per person per minute; raise TooMany beyond that."""
    key = f"rl:{action}:{user.pk}"
    # add() only sets a missing key, so the first hit starts a one-minute window.
    if cache.add(key, 1, timeout=60):
        return
    try:
        count = cache.incr(key)
    except ValueError:  # the window ended between add() and incr()
        cache.set(key, 1, timeout=60)
        return
    if count > per_minute:
        raise TooMany("You're doing that too fast. Wait a minute and try again.")
