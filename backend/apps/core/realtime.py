"""Centrifugo integration. Django stays the source of truth: it checks membership, stores the
message, then publishes. Browsers only ever get short-lived tokens for channels they may join."""

import time

import httpx
import jwt
from django.conf import settings

TOKEN_TTL = 60 * 15


def connection_token(user) -> str:
    # `info` is attached by Centrifugo to anything this client publishes (e.g. typing
    # signals), so other people see a name the server vouched for, not one the client made up.
    claims = {
        "sub": str(user.pk),
        "exp": int(time.time()) + TOKEN_TTL,
        "info": {"name": user.get_full_name() or user.email},
    }
    return jwt.encode(claims, settings.CENTRIFUGO_TOKEN_SECRET, algorithm="HS256")


def subscription_token(user, channel: str) -> str:
    """Call only after checking the user may read `channel`."""
    claims = {"sub": str(user.pk), "channel": channel, "exp": int(time.time()) + TOKEN_TTL}
    return jwt.encode(claims, settings.CENTRIFUGO_TOKEN_SECRET, algorithm="HS256")


def user_channel(user_id: int) -> str:
    """Centrifugo user-limited channel: only a connection whose token `sub` is this user's ID
    may subscribe, so no subscription token is needed."""
    return f"user:#{user_id}"


def broadcast(channels: list[str], data: dict) -> None:
    if not channels:
        return
    response = httpx.post(
        f"{settings.CENTRIFUGO_API_URL}/broadcast",
        json={"channels": channels, "data": data},
        headers={"X-API-Key": settings.CENTRIFUGO_API_KEY},
        timeout=5,
    )
    response.raise_for_status()


def publish(channel: str, data: dict, *, idempotency_key: str | None = None) -> None:
    payload = {"channel": channel, "data": data}
    if idempotency_key:
        payload["idempotency_key"] = idempotency_key
    response = httpx.post(
        f"{settings.CENTRIFUGO_API_URL}/publish",
        json=payload,
        headers={"X-API-Key": settings.CENTRIFUGO_API_KEY},
        timeout=5,
    )
    response.raise_for_status()
