from datetime import date, datetime

from ninja import Query, Router, Schema, Status
from ninja.errors import HttpError

from .services import institution_today, next_occurrence, occurrences

router = Router(tags=["timetable"])


class OccurrenceOut(Schema):
    meeting_id: int
    section_id: int
    section_code: str
    course_code: str
    course_title: str
    color: str
    kind: str
    date: date
    starts_at: datetime
    ends_at: datetime
    room: str
    mode: str
    online_url: str
    teachers: list[str]
    status: str
    note: str
    moved_to: datetime | None
    moved_from: date | None


class TimetableQuery(Schema):
    start: date | None = None
    days: int = 1


@router.get("", response=list[OccurrenceOut])
def timetable(request, query: Query[TimetableQuery]):
    if not 1 <= query.days <= 31:
        raise HttpError(422, "days must be between 1 and 31")
    if request.user.institution_id is None:
        return []
    return occurrences(request.user, query.start or institution_today(request.user), query.days)


@router.get("/next", response={200: OccurrenceOut, 204: None})
def upcoming(request):
    occ = next_occurrence(request.user)
    return Status(200, occ) if occ else Status(204, None)
