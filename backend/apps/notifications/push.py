"""Phone push notifications through Expo's push service (which hands them to Firebase on Android
and to Apple on iOS). Best effort: the notification is already stored and shown in the app, so a
failed push is logged, never raised. https://docs.expo.dev/push-notifications/sending-notifications/"""

import logging
import re

import httpx
from django.conf import settings

from .models import PushDevice

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
TOKEN = re.compile(r"^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$")
BATCH = 100  # Expo takes up to 100 messages a request


def valid_token(token: str) -> bool:
    return bool(TOKEN.match(token or ""))


def register(user, token: str, platform: str = "", sound: bool | None = None) -> PushDevice:
    """Remember this phone for this person. A token already known (someone else signed in on
    the phone before) moves to them. `sound` is the app's "Play a sound" switch; None keeps it."""
    defaults = {"user": user, "platform": platform[:16]}
    if sound is not None:
        defaults["sound"] = sound
    device, _ = PushDevice.objects.update_or_create(token=token, defaults=defaults)
    return device


def unregister(user, token: str) -> None:
    PushDevice.objects.filter(user=user, token=token).delete()


def _post(messages: list[dict], headers: dict):
    return httpx.post(EXPO_PUSH_URL, json=messages, headers=headers, timeout=10)


def send(user_ids: list[int], *, title: str, body: str, link: str, kind: str) -> int:
    """Push one notification to every phone of these people. Returns how many were accepted."""
    if not getattr(settings, "CAMPUSVERSE_PUSH_ENABLED", True):
        return 0
    devices = dict(PushDevice.objects.filter(user_id__in=user_ids).values_list("token", "sound"))
    tokens = list(devices)
    if not tokens:
        return 0
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    access = getattr(settings, "EXPO_ACCESS_TOKEN", "")
    if access:
        headers["Authorization"] = f"Bearer {access}"
    accepted = 0
    for start in range(0, len(tokens), BATCH):
        batch = tokens[start : start + BATCH]
        messages = [
            {
                "to": t,
                "title": title[:200],
                "body": body[:300],
                "data": {"link": link, "kind": kind},
                # A phone with sound turned off gets it silently (Android: the app's quiet channel).
                **(
                    {"sound": "default", "channelId": "default"}
                    if devices[t]
                    else {"channelId": "quiet"}
                ),
            }
            for t in batch
        ]
        try:
            response = _post(messages, headers)
            response.raise_for_status()
            tickets = response.json().get("data", [])
        except Exception:  # noqa: BLE001 - best effort; the app shows it anyway
            logger.warning("Push to %d phones failed", len(batch), exc_info=True)
            continue
        gone = []
        for token, ticket in zip(batch, tickets, strict=False):
            if ticket.get("status") == "ok":
                accepted += 1
            elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                gone.append(token)  # the app was removed from that phone
        if gone:
            PushDevice.objects.filter(token__in=gone).delete()
    return accepted
