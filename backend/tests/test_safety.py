"""Rate limits on what could flood others, and removing files nothing uses any more."""

import uuid
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.chat import services as chat
from apps.chat.models import Conversation
from apps.core.cleanup import purge_unused_files
from apps.core.models import StoredFile
from apps.core.ratelimit import TooMany, limit

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"


@pytest.fixture(autouse=True)
def quiet(monkeypatch, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    monkeypatch.setattr("apps.core.realtime.publish", lambda channel, data: None)
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)
    cache.clear()


def test_limits_count_per_person_and_action(campus):
    for _ in range(3):
        limit(campus.ayesha, "demo", per_minute=3)
    with pytest.raises(TooMany, match="too fast"):
        limit(campus.ayesha, "demo", per_minute=3)
    limit(campus.hamza, "demo", per_minute=3)  # someone else has their own count
    limit(campus.ayesha, "other", per_minute=3)  # and so does each action


def test_chat_messages_are_limited(campus):
    chat.ensure_section_conversations(campus.ayesha)
    conv = Conversation.objects.get(section=campus.s3b)
    for i in range(30):
        chat.send_message(campus.ayesha, conv, body=f"hi {i}", client_id=uuid.uuid4())
    with pytest.raises(TooMany):
        chat.send_message(campus.ayesha, conv, body="one too many", client_id=uuid.uuid4())


def test_files_of_deleted_messages_are_removed_and_live_ones_kept(campus):
    chat.ensure_section_conversations(campus.ayesha)
    conv = Conversation.objects.get(section=campus.s3b)

    def send_file(name):
        upload = SimpleUploadedFile(name, PDF, content_type="application/pdf")
        sent = chat.send_message(
            campus.ayesha, conv, body="", client_id=uuid.uuid4(), uploads=[upload]
        )
        return sent[0]

    kept = send_file("kept.pdf")
    gone = send_file("gone.pdf")
    chat.delete_message(campus.ayesha, gone)
    gone_file = gone.attachments.get()
    path = gone_file.file.path

    # Too new: nothing goes yet.
    assert purge_unused_files() == 0
    StoredFile.objects.update(created_at=timezone.now() - timedelta(days=2))
    assert purge_unused_files() == 1
    assert not StoredFile.objects.filter(pk=gone_file.pk).exists()
    assert kept.attachments.exists()
    import os

    assert not os.path.exists(path)  # the bytes are gone too
