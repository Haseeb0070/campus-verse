from ninja import Router, Schema

from apps.academic.models import Section
from apps.scheduling.services import member_section_ids

router = Router(tags=["me"])


class InstitutionOut(Schema):
    id: int
    name: str
    timezone: str


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
    full_name: str
    kind: str
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
        "full_name": user.get_full_name() or user.email,
        "kind": user.kind,
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
