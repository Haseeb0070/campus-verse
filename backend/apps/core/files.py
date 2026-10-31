"""Upload checks (SRS 9.3): an allow-list of types, verified by reading the file's own bytes,
never trusting its name or the browser's MIME type; size limits; random storage names."""

import hashlib
import os
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile

from .models import StoredFile

ZIP = [b"PK\x03\x04"]
TEXT = None  # checked by decoding instead of a signature

ALLOWED: dict[str, tuple[str, list[bytes] | None]] = {
    ".pdf": ("application/pdf", [b"%PDF-"]),
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ZIP),
    ".pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", ZIP),
    ".xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ZIP),
    ".zip": ("application/zip", ZIP),
    ".png": ("image/png", [b"\x89PNG\r\n\x1a\n"]),
    ".jpg": ("image/jpeg", [b"\xff\xd8\xff"]),
    ".jpeg": ("image/jpeg", [b"\xff\xd8\xff"]),
    ".txt": ("text/plain", TEXT),
    ".md": ("text/markdown", TEXT),
    ".csv": ("text/csv", TEXT),
    ".py": ("text/x-python", TEXT),
    ".java": ("text/x-java", TEXT),
    ".c": ("text/x-c", TEXT),
    ".cpp": ("text/x-c++", TEXT),
    ".h": ("text/x-c", TEXT),
    ".js": ("text/javascript", TEXT),
    ".ts": ("text/plain", TEXT),
    ".sql": ("text/plain", TEXT),
    ".ipynb": ("application/json", TEXT),
}

ACCEPT = ",".join(sorted(ALLOWED))


def max_bytes() -> int:
    return settings.CAMPUSVERSE_MAX_UPLOAD_MB * 1024 * 1024


def _looks_like_text(head: bytes) -> bool:
    if b"\x00" in head:
        return False
    # The sample may end mid-character; trim up to 3 bytes before giving up.
    for cut in range(4):
        try:
            head[: len(head) - cut].decode("utf-8")
            return True
        except UnicodeDecodeError:
            continue
    return False


def check_upload(upload: UploadedFile) -> tuple[str, str]:
    """Return (extension, content_type) for an acceptable upload, or raise ValidationError."""
    name = os.path.basename(upload.name or "")
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED:
        raise ValidationError(f"{name or 'This file'}: that file type isn't allowed.")
    if upload.size == 0:
        raise ValidationError(f"{name} is empty.")
    if upload.size > max_bytes():
        raise ValidationError(
            f"{name} is larger than {settings.CAMPUSVERSE_MAX_UPLOAD_MB} MB."
        )
    content_type, signatures = ALLOWED[ext]
    upload.seek(0)
    head = upload.read(8192)
    upload.seek(0)
    ok = _looks_like_text(head) if signatures is None else head.startswith(tuple(signatures))
    if not ok:
        raise ValidationError(f"{name} doesn't look like a real {ext} file.")
    return ext, content_type


def store_upload(user, upload: UploadedFile) -> StoredFile:
    ext, content_type = check_upload(upload)
    digest = hashlib.sha256()
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    original = os.path.basename(upload.name)[:255]
    stored = StoredFile(
        institution_id=user.institution_id,
        uploaded_by=user,
        original_name=original,
        content_type=content_type,
        size=upload.size,
        sha256=digest.hexdigest(),
    )
    # Never reuse the client's filename on disk.
    stored.file.save(f"{user.institution_id}/{uuid.uuid4().hex}{ext}", upload, save=False)
    stored.save()
    return stored
