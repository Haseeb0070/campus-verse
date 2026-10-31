from datetime import timedelta

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.validators import URLValidator
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.core.audience import audience_user_ids, can_target, scope_label
from apps.core.models import AudienceTarget
from apps.governance import audit
from apps.notifications.models import Notification
from apps.notifications.services import notify

from .models import Event, EventRegistration

MAX_LENGTH = timedelta(days=60)
Reg = EventRegistration.Status


def targets_of(event: Event) -> list[tuple[str, int]]:
    return [(t.scope_type, t.scope_id) for t in event.targets.all()]


def audience_labels(event: Event) -> list[str]:
    return [scope_label(t, i) for t, i in targets_of(event)]


def can_manage(user, event: Event) -> bool:
    """The organiser, or anyone who could publish to every audience it's shared with."""
    if not user.is_authenticated or event.institution_id != user.institution_id:
        return False
    if event.organizer_id == user.pk:
        return True
    targets = targets_of(event)
    return bool(targets) and all(can_target(user, t, i) for t, i in targets)


def _visible(user):
    if not user.is_authenticated or user.institution_id is None:
        return Event.objects.none()
    return (
        Event.objects.visible_to(user)
        .select_related("organizer")
        .prefetch_related("targets")
        .annotate(
            going=Count("registrations", filter=Q(registrations__status=Reg.GOING)),
            waiting=Count("registrations", filter=Q(registrations__status=Reg.WAITLISTED)),
        )
    )


def events_between(user, start, end):
    """Events overlapping [start, end), cancelled ones included so people see what changed."""
    return _visible(user).filter(starts_at__lt=end, ends_at__gte=start)


def get_event_for(user, event_id: int) -> Event:
    event = _visible(user).filter(pk=event_id).first()
    if event is None:
        raise Event.DoesNotExist
    return event


def _clean(event: Event) -> None:
    event.title = (event.title or "").strip()
    event.description = (event.description or "").strip()
    event.location = (event.location or "").strip()
    event.online_url = (event.online_url or "").strip()
    if not event.title:
        raise ValidationError("Give the event a title.")
    if len(event.title) > 200:
        raise ValidationError("Titles can be up to 200 characters.")
    if len(event.description) > 4000:
        raise ValidationError("Descriptions can be up to 4000 characters.")
    if event.category not in Event.Category.values or event.mode not in Event.Mode.values:
        raise ValidationError("Choose the kind of event and how people attend.")
    if event.ends_at < event.starts_at:
        raise ValidationError("It has to end after it starts.")
    if event.ends_at - event.starts_at > MAX_LENGTH:
        raise ValidationError("Events can last up to 60 days.")
    if event.mode != Event.Mode.ONLINE and not event.location and not event.all_day:
        raise ValidationError("Say where it happens.")
    if event.mode != Event.Mode.IN_PERSON:
        try:
            URLValidator(schemes=["https", "http"])(event.online_url)
        except ValidationError:
            raise ValidationError("Add the online link, starting with https://.") from None
    else:
        event.online_url = ""
    if not event.registration:
        event.capacity = None
        event.registration_closes_at = None
    if event.capacity is not None and event.capacity < 1:
        raise ValidationError("Capacity has to be at least 1, or leave it empty for no limit.")
    if event.registration_closes_at and event.registration_closes_at > event.ends_at:
        raise ValidationError("Sign-ups have to close before the event ends.")


@transaction.atomic
def create_event(user, *, targets: list[tuple[str, int]], **fields) -> Event:
    targets = list(dict.fromkeys(targets))
    if not targets:
        raise ValidationError("Choose who the event is for.")
    for scope, pk in targets:
        if not can_target(user, scope, pk):
            raise PermissionDenied("You can't add events for one of those audiences.")
    event = Event(institution_id=user.institution_id, organizer=user, **fields)
    _clean(event)
    event.save()
    ct = ContentType.objects.get_for_model(Event)
    AudienceTarget.objects.bulk_create(
        AudienceTarget(institution_id=event.institution_id, content_type=ct, object_id=event.pk,
                       scope_type=t, scope_id=i)
        for t, i in targets
    )
    audit.record(actor=user, action="event.created", target=event,
                 changes={"targets": [f"{t}:{i}" for t, i in targets]})
    when = timezone.localtime(event.starts_at).strftime("%a %d %b, %H:%M")
    notify(
        audience_user_ids(targets, event.institution_id),
        kind=Notification.Kind.EVENT, institution_id=event.institution_id,
        title=f"{event.get_category_display()}: {event.title}",
        body=("All day " + timezone.localtime(event.starts_at).strftime("%a %d %b")
              if event.all_day else when) + (f" · {event.location}" if event.location else ""),
        link=f"/calendar/{event.pk}", actor_id=user.pk, dedupe_key=f"event:{event.pk}",
    )
    return event


EDITABLE = ("title", "description", "category", "starts_at", "ends_at", "all_day", "mode",
            "location", "online_url", "registration", "capacity", "registration_closes_at")


@transaction.atomic
def update_event(user, event: Event, **fields) -> Event:
    if not can_manage(user, event):
        raise PermissionDenied("Only the organiser can change this event.")
    if event.status == Event.Status.CANCELLED:
        raise ValidationError("This event was cancelled.")
    before = {f: getattr(event, f) for f in EDITABLE}
    for name, value in fields.items():
        if name in EDITABLE:
            setattr(event, name, value)
    _clean(event)
    going = event.registrations.filter(status=Reg.GOING).count()
    if event.capacity is not None and event.capacity < going:
        raise ValidationError(f"{going} people are already going. Capacity can't be lower.")
    event.save()
    changed = {f: [str(before[f]), str(getattr(event, f))] for f in EDITABLE
               if before[f] != getattr(event, f)}
    if changed:
        audit.record(actor=user, action="event.updated", target=event, changes=changed)
    _promote(event)  # a bigger capacity may free places
    return event


@transaction.atomic
def cancel_event(user, event: Event, *, reason: str = "") -> Event:
    if not can_manage(user, event):
        raise PermissionDenied("Only the organiser can cancel this event.")
    if event.status == Event.Status.CANCELLED:
        return event
    event.status = Event.Status.CANCELLED
    event.cancel_reason = (reason or "").strip()[:300]
    event.save(update_fields=["status", "cancel_reason", "updated_at"])
    audit.record(actor=user, action="event.cancelled", target=event,
                 changes={"reason": event.cancel_reason})
    notify(
        audience_user_ids(targets_of(event), event.institution_id),
        kind=Notification.Kind.EVENT, institution_id=event.institution_id,
        title=f"Cancelled: {event.title}", body=event.cancel_reason,
        link=f"/calendar/{event.pk}", actor_id=user.pk, dedupe_key=f"event:{event.pk}:cancelled",
    )
    return event


# Registration ---------------------------------------------------------------------------------


def _locked(event: Event) -> Event:
    """Row-lock the event so two last-place sign-ups can't both get in."""
    return Event.objects.select_for_update().get(pk=event.pk)


@transaction.atomic
def register(user, event: Event) -> EventRegistration:
    event = _locked(event)
    if not Event.objects.visible_to(user).filter(pk=event.pk).exists():
        raise PermissionDenied("This event isn't open to you.")
    if not event.registration:
        raise ValidationError("This event doesn't take sign-ups; just come along.")
    if event.status == Event.Status.CANCELLED:
        raise ValidationError("This event was cancelled.")
    now = timezone.now()
    if (event.registration_closes_at or event.starts_at) <= now:
        raise ValidationError("Sign-ups have closed.")
    reg = EventRegistration.objects.filter(event=event, user=user).first()
    if reg and reg.status != Reg.CANCELLED:
        return reg
    going = event.registrations.filter(status=Reg.GOING).count()
    status = Reg.GOING if event.capacity is None or going < event.capacity else Reg.WAITLISTED
    if reg is None:
        reg = EventRegistration(institution_id=event.institution_id, event=event, user=user)
    reg.status = status
    reg.save()  # updated_at moves to now, so a re-joiner goes to the back of the line
    return reg


@transaction.atomic
def unregister(user, event: Event) -> None:
    event = _locked(event)
    reg = EventRegistration.objects.filter(event=event, user=user).first()
    if reg is None or reg.status == Reg.CANCELLED:
        return
    reg.status = Reg.CANCELLED
    reg.save()
    _promote(event)


def _promote(event: Event) -> None:
    """Move people up from the waitlist, oldest first, while there's room. Tell each of them."""
    if event.status == Event.Status.CANCELLED:
        return
    going = event.registrations.filter(status=Reg.GOING).count()
    room = None if event.capacity is None else event.capacity - going
    waiting = event.registrations.filter(status=Reg.WAITLISTED).order_by("updated_at", "id")
    for reg in waiting if room is None else waiting[: max(room, 0)]:
        reg.status = Reg.GOING
        reg.save()
        notify(
            [reg.user_id], kind=Notification.Kind.EVENT, institution_id=event.institution_id,
            title=f"You have a place: {event.title}",
            body="Someone dropped out, so you've moved up from the waitlist.",
            link=f"/calendar/{event.pk}",
            dedupe_key=f"event:{event.pk}:in:{reg.pk}:{int(reg.updated_at.timestamp())}",
        )


def my_registration(user, event: Event) -> str | None:
    reg = EventRegistration.objects.filter(event=event, user=user).first()
    return None if reg is None or reg.status == Reg.CANCELLED else reg.status


def waitlist_position(user, event: Event) -> int | None:
    waiting = list(event.registrations.filter(status=Reg.WAITLISTED)
                   .order_by("updated_at", "id").values_list("user_id", flat=True))
    return waiting.index(user.pk) + 1 if user.pk in waiting else None
