"""Scheduled sync from institutional sources (SRS 11.2 "scheduled feed", 11.4 controls).

A source is an HTTPS URL that serves a CSV or Excel export. Each fetch becomes an ordinary
import preview, so the same validation, matching and review apply. A run is applied on its own
only when the source allows it and nothing looks suspicious; otherwise it waits, and the owner
is told. Failures are recorded and reported; existing data is never touched by a failed run.
"""

import ipaddress
import socket
from datetime import timedelta
from urllib.parse import urlparse

import httpx
from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.validators import URLValidator
from django.utils import timezone

from apps.governance import audit
from apps.identity.models import User
from apps.identity.roles import is_institution_admin
from apps.notifications.models import Notification
from apps.notifications.services import notify

from . import imports
from .models import ImportRun, SyncSource
from .people import require_admin

MAX_BYTES = 10 * 1024 * 1024
TIMEOUT = 30
EVERY = {
    SyncSource.Schedule.HOURLY: timedelta(hours=1),
    SyncSource.Schedule.DAILY: timedelta(days=1),
}


# Managing sources ----------------------------------------------------------------------------


def save_source(admin, source: SyncSource | None, *, name: str, kind: str, url: str,
                schedule: str, auto_apply: bool, purpose: str = "", auth_header: str | None = None,
                owner_id: int | None = None, is_active: bool = True) -> SyncSource:
    require_admin(admin)
    if source is not None and source.institution_id != admin.institution_id:
        raise PermissionDenied("That source isn't in your institution.")
    name = " ".join((name or "").split())
    if not name:
        raise ValidationError("Give the source a name.")
    imports.kind_of(kind)
    if schedule not in SyncSource.Schedule.values:
        raise ValidationError("Choose how often to sync.")
    try:
        URLValidator(schemes=["https"])(url.strip())
    except ValidationError:
        raise ValidationError("Use the full https:// address of the export.") from None
    owner = User.objects.filter(
        pk=owner_id or admin.pk, institution_id=admin.institution_id
    ).first()
    if owner is None or not is_institution_admin(owner):
        raise ValidationError("The owner has to be an institution admin.")
    source = source or SyncSource(institution_id=admin.institution_id)
    source.name, source.kind, source.url = name, kind, url.strip()
    source.schedule, source.auto_apply, source.is_active = schedule, auto_apply, is_active
    source.purpose, source.owner = (purpose or "").strip()[:300], owner
    if auth_header is not None:  # None keeps the stored secret; "" clears it
        source.auth_header = auth_header.strip()
    source.save()
    audit.record(actor=admin, action="sync_source.saved", target=source,
                 changes={"kind": kind, "schedule": schedule, "auto_apply": auto_apply,
                          "active": is_active})  # the URL's secret header is never logged
    return source


# Fetching --------------------------------------------------------------------------------------


def _check_host(url: str) -> None:
    """Refuse internal addresses (no reaching the server's own network through a source)."""
    if settings.CAMPUSVERSE_SYNC_ALLOW_PRIVATE:
        return
    host = urlparse(url).hostname or ""
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, 443)}
    except socket.gaierror:
        raise ValidationError(f"Couldn't find {host}.") from None
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise ValidationError(f"{host} is an internal address; sources must be public.")


def fetch(source: SyncSource) -> SimpleUploadedFile:
    _check_host(source.url)
    headers = {"Accept": "text/csv, application/vnd.openxmlformats-officedocument."
                         "spreadsheetml.sheet;q=0.9, */*;q=0.1"}
    if source.auth_header:
        headers["Authorization"] = source.auth_header
    chunks, size = [], 0
    with httpx.stream("GET", source.url, headers=headers, timeout=TIMEOUT,
                      follow_redirects=False) as response:
        if response.status_code != 200:
            raise ValidationError(f"The source answered {response.status_code}.")
        for chunk in response.iter_bytes():
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValidationError("The export is larger than 10 MB.")
            chunks.append(chunk)
        content_type = response.headers.get("content-type", "")
    path = urlparse(source.url).path.lower()
    xlsx = path.endswith(".xlsx") or "spreadsheetml" in content_type
    name = f"{source.kind}-sync.{'xlsx' if xlsx else 'csv'}"
    return SimpleUploadedFile(name, b"".join(chunks),
                              content_type="text/csv" if not xlsx else "application/zip")


def _suspicious(run: ImportRun) -> str:
    """Why a run shouldn't apply itself, or "" if it looks routine (SRS 11.4)."""
    s = run.plan["summary"]
    rows = max(s["rows"], 1)
    if s["error"]:
        return f"{s['error']} rows have problems."
    if s["new"] + s["update"] > max(25, rows // 2):
        return f"{s['new'] + s['update']} changes is more than usual."
    if s["not_in_file"] > max(5, rows // 5):
        return f"{s['not_in_file']} existing records are missing from the export."
    return ""


def run_source(source: SyncSource, *, by=None) -> ImportRun | None:
    """Fetch, preview, then apply or hold. Returns the run, or None if the fetch failed."""
    owner = source.owner
    source.last_attempt_at = timezone.now()
    try:
        upload = fetch(source)
        run = imports.preview(owner, upload, source.kind, source=source)
    except (ValidationError, httpx.HTTPError) as err:
        message = err.messages[0] if isinstance(err, ValidationError) else \
            f"Couldn't reach the source ({type(err).__name__})."
        source.last_error = message[:500]
        source.save(update_fields=["last_attempt_at", "last_error", "updated_at"])
        audit.record(actor=by or owner, action="sync_source.failed", target=source,
                     changes={"error": source.last_error})
        notify([owner.pk], kind=Notification.Kind.SYNC, institution_id=source.institution_id,
               title=f"Sync failed: {source.name}", body=source.last_error,
               link="/manage/import",
               dedupe_key=f"sync:{source.pk}:failed:{source.last_attempt_at:%Y%m%d%H}")
        return None

    source.last_error = ""
    source.last_success_at = source.last_attempt_at
    source.save(update_fields=["last_attempt_at", "last_success_at", "last_error", "updated_at"])
    reason = "Automatic apply is off." if not source.auto_apply else _suspicious(run)
    if not reason and is_institution_admin(owner):
        return imports.apply(owner, run)
    run.held_reason = reason or "The owner is no longer an admin."
    run.save(update_fields=["held_reason", "updated_at"])
    if source.auto_apply or by is None:  # someone pressing "Run now" is already looking
        notify([owner.pk], kind=Notification.Kind.SYNC, institution_id=source.institution_id,
               title=f"Sync needs review: {source.name}", body=run.held_reason,
               link="/manage/import", dedupe_key=f"sync:run:{run.pk}")
    return run


def run_now(admin, source: SyncSource) -> ImportRun | None:
    require_admin(admin)
    if source.institution_id != admin.institution_id:
        raise PermissionDenied("That source isn't in your institution.")
    return run_source(source, by=admin)


def due_sources(now=None) -> list[SyncSource]:
    now = now or timezone.now()
    due = []
    for source in SyncSource.objects.filter(is_active=True).exclude(
        schedule=SyncSource.Schedule.MANUAL
    ).select_related("owner"):
        every = EVERY[source.schedule]
        if source.last_attempt_at is None or now - source.last_attempt_at >= every - timedelta(
            minutes=5
        ):
            due.append(source)
    return due
