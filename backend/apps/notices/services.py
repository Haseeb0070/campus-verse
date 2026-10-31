from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from apps.core.audience import can_target
from apps.core.models import AudienceTarget
from apps.governance import audit

from .models import Notice


@transaction.atomic
def publish_notice(*, author, notice: Notice, targets: list[tuple[str, int]]) -> Notice:
    if not targets:
        raise ValidationError("Choose who should see this notice.")
    for scope_type, scope_id in targets:
        if not can_target(author, scope_type, scope_id):
            raise PermissionDenied(f"You can't post to {scope_type} {scope_id}.")

    notice.author = author
    notice.institution_id = author.institution_id
    notice.status = Notice.Status.PUBLISHED
    notice.published_at = timezone.now()
    notice.save()

    content_type = ContentType.objects.get_for_model(Notice)
    AudienceTarget.objects.filter(content_type=content_type, object_id=notice.pk).delete()
    AudienceTarget.objects.bulk_create(
        AudienceTarget(
            institution_id=notice.institution_id,
            content_type=content_type,
            object_id=notice.pk,
            scope_type=scope_type,
            scope_id=scope_id,
        )
        for scope_type, scope_id in targets
    )
    audit.record(
        actor=author,
        action="notice.published",
        target=notice,
        changes={"targets": [f"{t}:{i}" for t, i in targets]},
    )
    return notice
