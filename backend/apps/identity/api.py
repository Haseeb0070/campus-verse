from datetime import datetime

from allauth.mfa.models import Authenticator
from django.core.exceptions import ValidationError
from ninja import Router, Schema, Status

from apps.academic.models import Section
from apps.scheduling.services import member_section_ids

from . import profile
from .models import CorrectionRequest

router = Router(tags=["me"])


class InstitutionOut(Schema):
    id: int
    name: str
    timezone: str
    attendance_enabled: bool
    attendance_visible_to_students: bool


class SectionOut(Schema):
    id: int
    code: str
    course_code: str
    course_title: str
    color: str
    term: str
    teaching: bool


class MeOut(Schema):
    id: int
    email: str
    first_name: str
    last_name: str
    preferred_name: str
    full_name: str
    kind: str
    two_step: bool
    appearance: str
    institution: InstitutionOut | None
    roles: list[str]
    sections: list[SectionOut]


@router.get("", response=MeOut)
def me(request):
    user = request.user
    taught = set(user.teaching.values_list("section_id", flat=True))
    sections = (
        Section.objects.filter(pk__in=member_section_ids(user))
        .select_related("offering__course", "offering__term")
        .order_by("offering__course__code", "code")
    )
    return {
        "id": user.pk,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "preferred_name": user.preferred_name,
        "full_name": user.get_full_name() or user.email,
        "kind": user.kind,
        "two_step": Authenticator.objects.filter(
            user=user, type=Authenticator.Type.TOTP
        ).exists(),
        "appearance": user.appearance,
        "institution": user.institution,
        "roles": sorted({r.role for r in user.roles.filter(institution_id=user.institution_id)}),
        "sections": [
            {
                "id": s.pk,
                "code": s.code,
                "course_code": s.offering.course.code,
                "course_title": s.offering.course.title,
                "color": s.offering.course.color,
                "term": s.offering.term.name,
                "teaching": s.pk in taught,
            }
            for s in sections
        ],
    }


class ProfileIn(Schema):
    preferred_name: str = ""


class CorrectionIn(Schema):
    topic: str
    details: str


class CorrectionOut(Schema):
    id: int
    topic: str
    topic_label: str
    details: str
    status: str
    response: str
    created_at: datetime
    resolved_at: datetime | None


class ErrorOut(Schema):
    detail: str


def correction_out(c: CorrectionRequest) -> dict:
    return {
        "id": c.pk, "topic": c.topic, "topic_label": c.get_topic_display(), "details": c.details,
        "status": c.status, "response": c.response, "created_at": c.created_at,
        "resolved_at": c.resolved_at,
    }


@router.patch("", response={200: MeOut, 422: ErrorOut})
def update(request, payload: ProfileIn):
    try:
        profile.update_profile(request.user, preferred_name=payload.preferred_name)
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    return Status(200, me(request))


class AppearanceIn(Schema):
    appearance: str


@router.put("/appearance", response={204: None, 422: ErrorOut})
def set_appearance(request, payload: AppearanceIn):
    """Light or dark, for this person on every device."""
    if payload.appearance not in request.user.Appearance.values:
        return Status(422, {"detail": "Choose light or dark."})
    request.user.appearance = payload.appearance
    request.user.save(update_fields=["appearance"])
    return Status(204, None)


@router.get("/corrections", response=list[CorrectionOut])
def my_corrections(request):
    return [correction_out(c) for c in request.user.corrections.all()[:20]]


@router.post("/corrections", response={201: CorrectionOut, 422: ErrorOut})
def ask_for_correction(request, payload: CorrectionIn):
    try:
        c = profile.request_correction(request.user, topic=payload.topic, details=payload.details)
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    return Status(201, correction_out(c))
