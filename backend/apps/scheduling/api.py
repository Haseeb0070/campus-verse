from datetime import date, datetime, time
from typing import Literal

from django.core.exceptions import PermissionDenied, ValidationError
from ninja import Query, Router, Schema, Status
from ninja.errors import HttpError

from .models import ClassMeeting, Room, ScheduleChange
from .services import (
    ScheduleConflict,
    change_class,
    institution_today,
    next_occurrence,
    occurrences,
    undo_change,
)

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
    change_id: int | None
    can_manage: bool
    rep_role: str | None = None
    late_minutes: int = 0
    source: str | None = None
    synced_at: datetime | None = None


class TimetableQuery(Schema):
    start: date | None = None
    days: int = 1


class RoomOut(Schema):
    id: int
    code: str
    building: str


class ChangeIn(Schema):
    meeting_id: int
    date: date
    status: Literal["cancelled", "moved", "room_changed"]
    new_date: date | None = None
    new_starts_at: time | None = None
    new_ends_at: time | None = None
    new_room_id: int | None = None
    note: str = ""
    notify: bool = False


class ChangeOut(Schema):
    id: int
    status: str
    date: date


class ErrorOut(Schema):
    detail: str
    conflicts: list[str] = []


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


@router.get("/rooms", response=list[RoomOut])
def rooms(request):
    return Room.objects.filter(institution_id=request.user.institution_id).order_by("code")


@router.post("/changes", response={201: ChangeOut, 403: ErrorOut, 409: ErrorOut, 422: ErrorOut})
def create_change(request, payload: ChangeIn):
    user = request.user
    meeting = (
        ClassMeeting.objects.select_related("section__offering__term__institution", "room")
        .filter(pk=payload.meeting_id, institution_id=user.institution_id)
        .first()
    )
    if meeting is None:
        raise HttpError(404, "Class not found")
    room = None
    if payload.new_room_id is not None:
        room = Room.objects.filter(
            pk=payload.new_room_id, institution_id=user.institution_id
        ).first()
        if room is None:
            return Status(422, {"detail": "That room doesn't exist."})
    try:
        change = change_class(
            user,
            meeting=meeting,
            day=payload.date,
            status=payload.status,
            new_date=payload.new_date,
            new_starts_at=payload.new_starts_at,
            new_ends_at=payload.new_ends_at,
            new_room=room,
            note=payload.note,
            notify=payload.notify,
        )
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ScheduleConflict as err:
        return Status(409, {"detail": "That slot clashes with another class.",
                            "conflicts": err.messages})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    return Status(201, change)


class LateIn(Schema):
    meeting_id: int
    date: date
    minutes: int  # 0: on time after all
    note: str = ""


@router.post("/late", response={204: None, 403: ErrorOut, 404: ErrorOut, 422: ErrorOut})
def running_late(request, payload: LateIn):
    """A teacher tells the class they'll start late (or, with 0, on time after all)."""
    from .services import mark_late

    meeting = ClassMeeting.objects.filter(
        pk=payload.meeting_id, institution_id=request.user.institution_id
    ).select_related("section__offering__course", "institution").first()
    if meeting is None:
        return Status(404, {"detail": "Class not found"})
    try:
        mark_late(request.user, meeting=meeting, day=payload.date, minutes=payload.minutes,
                  note=payload.note)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})
    return Status(204, None)


@router.delete("/changes/{change_id}", response={204: None, 403: ErrorOut})
def delete_change(request, change_id: int):
    change = (
        ScheduleChange.objects.select_related("meeting")
        .filter(pk=change_id, institution_id=request.user.institution_id)
        .first()
    )
    if change is None:
        raise HttpError(404, "Change not found")
    try:
        undo_change(request.user, change)
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    return Status(204, None)
