"""Centrifugo integration. Django stays the source of truth: it checks membership, stores the
message, then publishes. Browsers only ever get short-lived tokens for channels they may join."""

import time

import httpx
import jwt
from django.conf import settings

TOKEN_TTL = 60 * 15


def connection_token(user) -> str:
    claims = {"sub": str(user.pk), "exp": int(time.time()) + TOKEN_TTL}
    return jwt.encode(claims, settings.CENTRIFUGO_TOKEN_SECRET, algorithm="HS256")


def subscription_token(user, channel: str) -> str:
    """Call only after checking the user may read `channel`."""
    claims = {"sub": str(user.pk), "channel": channel, "exp": int(time.time()) + TOKEN_TTL}
    return jwt.encode(claims, settings.CENTRIFUGO_TOKEN_SECRET, algorithm="HS256")


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
