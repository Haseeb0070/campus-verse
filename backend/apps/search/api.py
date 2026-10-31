from datetime import datetime

from ninja import Query, Router, Schema

from apps.academic.models import Course
from apps.identity.roles import is_institution_admin
from apps.scheduling.services import member_section_ids

from . import services

router = Router(tags=["search"])


class SearchQuery(Schema):
    q: str = ""
    type: str = ""  # one of services.TYPES, or empty for all
    course: int | None = None
    days: int | None = None  # only things from the last N days


class HitOut(Schema):
    id: int
    title: str
    snippet: str
    link: str
    date: datetime | None
    course: str | None
    color: str | None = None
    status: str | None = None
    draft: bool | None = None


class SearchOut(Schema):
    query: str
    total: int
    results: dict[str, list[HitOut]]


class CourseOption(Schema):
    id: int
    code: str
    title: str


@router.get("", response=SearchOut)
def search(request, query: Query[SearchQuery]):
    types = (query.type,) if query.type in services.TYPES else services.TYPES
    return services.search(request.user, query.q, types=types, course_id=query.course,
                           days=query.days if query.days in (7, 30, 365) else None,
                           limit=20 if len(types) == 1 else services.PER_TYPE)


@router.get("/courses", response=list[CourseOption])
def courses(request):
    """The courses someone can filter by: theirs (or every course, for admins)."""
    qs = Course.objects.filter(institution_id=request.user.institution_id, is_active=True)
    if not is_institution_admin(request.user):
        qs = qs.filter(offerings__sections__in=member_section_ids(request.user)).distinct()
    return list(qs.order_by("code"))
