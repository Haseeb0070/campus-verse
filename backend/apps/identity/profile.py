"""Your own profile (FR-AUTH-07): the few fields people may change themselves, and a way to ask
for corrections to the official record they can't change (SRS 9.4)."""

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from apps.governance import audit
from apps.identity.roles import is_institution_admin
from apps.notifications.models import Notification
from apps.notifications.services import notify

from .models import CorrectionRequest

MAX_PREFERRED = 60
MAX_DETAILS = 1000
MAX_RESPONSE = 500
MAX_OPEN = 5


def update_profile(user, *, preferred_name: str) -> None:
    preferred_name = " ".join((preferred_name or "").split())
    if len(preferred_name) > MAX_PREFERRED:
        raise ValidationError(f"Keep it to {MAX_PREFERRED} characters.")
    if preferred_name != user.preferred_name:
        before = user.preferred_name
        user.preferred_name = preferred_name
        user.save(update_fields=["preferred_name"])
        audit.record(actor=user, action="profile.updated", target=user,
                     changes={"preferred_name": [before, preferred_name]})


def request_correction(user, *, topic: str, details: str) -> CorrectionRequest:
    if user.institution_id is None:
        raise ValidationError("Your account isn't linked to an institution yet.")
    if topic not in CorrectionRequest.Topic.values:
        raise ValidationError("Choose what needs fixing.")
    details = (details or "").strip()
    if not details:
        raise ValidationError("Say what's wrong and what it should be.")
    if len(details) > MAX_DETAILS:
        raise ValidationError(f"Keep it to {MAX_DETAILS} characters.")
    open_count = CorrectionRequest.objects.filter(
        user=user, status=CorrectionRequest.Status.OPEN
    ).count()
    if open_count >= MAX_OPEN:
        raise ValidationError("You already have several open requests. Wait for a reply first.")
    return CorrectionRequest.objects.create(
        institution_id=user.institution_id, user=user, topic=topic, details=details
    )


@transaction.atomic
def resolve_correction(admin, request: CorrectionRequest, *, status: str,
                       response: str = "") -> CorrectionRequest:
    if not is_institution_admin(admin) or request.institution_id != admin.institution_id:
        raise PermissionDenied("Only institution admins can resolve requests.")
    if status not in (CorrectionRequest.Status.RESOLVED, CorrectionRequest.Status.DECLINED):
        raise ValidationError("Mark it resolved or declined.")
    if request.status != CorrectionRequest.Status.OPEN:
        raise ValidationError("This request has already been answered.")
    response = (response or "").strip()
    if len(response) > MAX_RESPONSE:
        raise ValidationError(f"Keep the reply to {MAX_RESPONSE} characters.")
    if status == CorrectionRequest.Status.DECLINED and not response:
        raise ValidationError("Say why, so they know what to do next.")
    request.status = status
    request.response = response
    request.resolved_by = admin
    request.resolved_at = timezone.now()
    request.save(update_fields=["status", "response", "resolved_by", "resolved_at", "updated_at"])
    audit.record(actor=admin, action=f"correction.{status}", target=request,
                 changes={"user": request.user_id, "topic": request.topic})
    notify(
        [request.user_id],
        kind=Notification.Kind.CORRECTION,
        institution_id=request.institution_id,
        title=("Your correction was made" if status == CorrectionRequest.Status.RESOLVED
               else "Your correction request was declined"),
        body=response or request.get_topic_display(),
        link="/profile",
        actor_id=admin.pk,
        dedupe_key=f"correction:{request.pk}",
    )
    return request
