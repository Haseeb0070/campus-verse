"""Checks that uploads can be stored: writes a small file, reads it back and deletes it.

Run at every deploy (render-start.sh) so the log says plainly whether uploads work, and where
they go. Never fails the deploy; a problem is printed for whoever reads the log."""

import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Check that uploaded files can be written, read and deleted."

    def handle(self, *args, **options):
        where = (
            f"Cloudflare R2 bucket {settings.R2_BUCKET}"
            if settings.R2_BUCKET
            else f"the server's disk ({settings.MEDIA_ROOT})"
        )
        name = f"healthcheck/{uuid.uuid4().hex}.txt"
        try:
            saved = default_storage.save(name, ContentFile(b"campusverse upload check"))
            with default_storage.open(saved, "rb") as f:
                ok = f.read() == b"campusverse upload check"
            default_storage.delete(saved)
        except Exception as err:  # noqa: BLE001 - any failure is reported, never raised
            self.stdout.write(self.style.ERROR(f"Uploads: can't use {where}: {err}"))
            return
        if ok:
            note = "" if settings.R2_BUCKET else " (wiped on hosts with temporary disks)"
            self.stdout.write(self.style.SUCCESS(f"Uploads: stored in {where}{note}."))
        else:
            self.stdout.write(self.style.ERROR(f"Uploads: {where} returned a different file."))
