from datetime import datetime, timedelta
from typing import Literal

from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone
from ninja import Query, Router, Schema, Status
from ninja.errors import HttpError

from apps.chat.serializers import initials
from apps.core.audience import audience_options, parse_target

from . import services
from .models import Event, EventRegistration

router = Router(tags=["events"])

CategoryLiteral = Literal["exam", "holiday", "seminar", "workshop", "event", "deadline"]
ModeLiteral = Literal["in_person", "online", "hybrid"]


class EventOut(Schema):
    id: int
    title: str
    description: str
    category: str
    category_label: str
    starts_at: datetime
    ends_at: datetime
    all_day: bool
    mode: str
    location: str
    online_url: str
    registration: bool
    capacity: int | None
    registration_closes_at: datetime | None
    registration_open: bool
    going: int
    waiting: int
    status: str
    cancel_reason: str
    organizer: str
    audiences: list[str]
    can_manage: bool
    my_status: str | None
    my_waitlist_position: int | None


class EventIn(Schema):
    title: str
    description: str = ""
    category: CategoryLiteral = "event"
    starts_at: datetime
    ends_at: datetime
    all_day: bool = False
    mode: ModeLiteral = "in_person"
    location: str = ""
    online_url: str = ""
    registration: bool = False
    capacity: int | None = None
    registration_closes_at: datetime | None = None


class CreateIn(EventIn):
    targets: list[str]


class RangeQuery(Schema):
    start: datetime | None = None
    end: datetime | None = None


class CancelIn(Schema):
    reason: str = ""


class AttendeeOut(Schema):
    id: int
    name: str
    email: str
    initials: str
    status: str
    signed_up_at: datetime


class ErrorOut(Schema):
    detail: str


def _out(event: Event, user) -> dict:
    my_status = services.my_registration(user, event) if event.registration else None
    now = timezone.now()
    return {
        "id": event.pk, "title": event.title, "description": event.description,
        "category": event.category, "category_label": event.get_category_display(),
        "starts_at": event.starts_at, "ends_at": event.ends_at, "all_day": event.all_day,
        "mode": event.mode, "location": event.location, "online_url": event.online_url,
        "registration": event.registration, "capacity": event.capacity,
        "registration_closes_at": event.registration_closes_at,
        "registration_open": event.registration and event.status == Event.Status.SCHEDULED
        and (event.registration_closes_at or event.starts_at) > now,
        "going": getattr(event, "going", 0), "waiting": getattr(event, "waiting", 0),
        "status": event.status, "cancel_reason": event.cancel_reason,
        "organizer": event.organizer.get_full_name() or event.organizer.email,
        "audiences": services.audience_labels(event),
        "can_manage": services.can_manage(user, event),
        "my_status": my_status,
        "my_waitlist_position": services.waitlist_position(user, event)
        if my_status == EventRegistration.Status.WAITLISTED else None,
    }


def _get(request, event_id: int) -> Event:
    try:
        return services.get_event_for(request.user, event_id)
    except Event.DoesNotExist:
        raise HttpError(404, "Event not found") from None


def _call(fn):
    try:
        return fn()
    except PermissionDenied as err:
        return Status(403, {"detail": str(err)})
    except ValidationError as err:
        return Status(422, {"detail": err.messages[0]})


@router.get("", response=list[EventOut])
def list_events(request, query: Query[RangeQuery]):
    start = query.start or timezone.now() - timedelta(days=1)
    end = query.end or start + timedelta(days=60)
    if end - start > timedelta(days=400):
        raise HttpError(422, "Ask for up to about a year at a time.")
    return [_out(e, request.user) for e in services.events_between(request.user, start, end)]


@router.get("/audiences", response=list[dict])
def audiences(request):
    """Where you can add events; empty means you can't add any."""
    return audience_options(request.user)


@router.post("", response={201: EventOut, 403: ErrorOut, 422: ErrorOut})
def create(request, payload: CreateIn):
    try:
        targets = [parse_target(t) for t in payload.targets]
    except ValueError:
        return Status(422, {"detail": "Choose who the event is for."})

    def go():
        event = services.create_event(request.user, targets=targets,
                                      **payload.dict(exclude={"targets"}))
        return Status(201, _out(_get(request, event.pk), request.user))

    return _call(go)


@router.get("/{event_id}", response=EventOut)
def detail(request, event_id: int):
    return _out(_get(request, event_id), request.user)


@router.put("/{event_id}", response={200: EventOut, 403: ErrorOut, 422: ErrorOut})
def update(request, event_id: int, payload: EventIn):
    event = _get(request, event_id)
    return _call(lambda: (services.update_event(request.user, event, **payload.dict()),
                          Status(200, _out(_get(request, event_id), request.user)))[1])


@router.post("/{event_id}/cancel", response={200: EventOut, 403: ErrorOut, 422: ErrorOut})
def cancel(request, event_id: int, payload: CancelIn):
    event = _get(request, event_id)
    return _call(lambda: (services.cancel_event(request.user, event, reason=payload.reason),
                          Status(200, _out(_get(request, event_id), request.user)))[1])


@router.post("/{event_id}/registration", response={200: EventOut, 403: ErrorOut, 422: ErrorOut})
def register(request, event_id: int):
    event = _get(request, event_id)
    return _call(lambda: (services.register(request.user, event),
                          Status(200, _out(_get(request, event_id), request.user)))[1])


@router.delete("/{event_id}/registration", response={200: EventOut})
def unregister(request, event_id: int):
    event = _get(request, event_id)
    services.unregister(request.user, event)
    return Status(200, _out(_get(request, event_id), request.user))


@router.get("/{event_id}/attendees", response={200: list[AttendeeOut], 403: ErrorOut})
def attendees(request, event_id: int):
    event = _get(request, event_id)
    if not services.can_manage(request.user, event):
        return Status(403, {"detail": "Only the organiser can see who's coming."})
    regs = event.registrations.exclude(status=EventRegistration.Status.CANCELLED) \
        .select_related("user").order_by("status", "updated_at")
    return Status(200, [
        {"id": r.user.pk, "name": r.user.get_full_name() or r.user.email, "email": r.user.email,
         "initials": initials(r.user), "status": r.status, "signed_up_at": r.updated_at}
        for r in regs
    ])
