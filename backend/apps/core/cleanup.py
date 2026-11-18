"""Removes uploaded files nothing uses any more, from storage (R2 or disk) and from the database.

A file is still in use while anything live points to it: a chat message or feed post that isn't
deleted, an assignment's attachments, a hand-in, a resource version (kept as history), or an
import's source file. Everything else (attachments of deleted messages and posts, uploads whose
message never got sent) goes once it is at least a day old. Runs from the cron job in batches."""

import logging
from datetime import timedelta

from django.utils import timezone

from .models import StoredFile

logger = logging.getLogger(__name__)


def live_file_ids() -> set[int]:
    from apps.administration.models import ImportRun
    from apps.assignments.models import Assignment, Submission
    from apps.chat.models import Message
    from apps.feed.models import Post
    from apps.resources.models import ResourceVersion

    ids: set[int] = set()
    ids.update(ImportRun.objects.values_list("source_file_id", flat=True))
    ids.update(ResourceVersion.objects.values_list("file_id", flat=True))
    ids.update(Assignment.attachments.through.objects.values_list("storedfile_id", flat=True))
    ids.update(Submission.files.through.objects.values_list("storedfile_id", flat=True))
    ids.update(
        Message.attachments.through.objects.filter(message__deleted_at__isnull=True).values_list(
            "storedfile_id", flat=True
        )
    )
    ids.update(
        Post.attachments.through.objects.filter(post__deleted_at__isnull=True).values_list(
            "storedfile_id", flat=True
        )
    )
    return ids


def purge_unused_files(limit: int = 200, min_age: timedelta = timedelta(days=1)) -> int:
    """Deletes up to `limit` unused files; returns how many went."""
    cutoff = timezone.now() - min_age
    unused = (
        StoredFile.objects.filter(created_at__lt=cutoff)
        .exclude(pk__in=live_file_ids())
        .order_by("pk")[:limit]
    )
    removed = 0
    for stored in unused:
        try:
            stored.file.delete(save=False)  # the bytes, in R2 or on disk
        except Exception:  # noqa: BLE001 - leave the row, so the next run tries again
            logger.warning("Couldn't delete stored file %s", stored.pk, exc_info=True)
            continue
        stored.delete()
        removed += 1
    return removed
