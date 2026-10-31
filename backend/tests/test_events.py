from datetime import timedelta

import pytest
from django.core.exceptions import PermissionDenied, ValidationError
from django.utils import timezone

from apps.enrollment.models import SectionEnrollment
from apps.events import services
from apps.events.models import Event
from apps.governance.models import AuditLog
from apps.notifications.models import Notification


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    monkeypatch.setattr("apps.core.realtime.broadcast", lambda channels, data: None)


@pytest.fixture
def classmate(campus):
    SectionEnrollment.objects.create(institution=campus.inst, section=campus.s3b,
                                     student=campus.hamza)
    return campus.hamza


def soon(**kw):
    return timezone.now() + timedelta(**kw)


def make(campus, user=None, targets=None, **kw):
    fields = {"title": "Graph theory seminar", "category": "seminar", "starts_at": soon(days=3),
              "ends_at": soon(days=3, hours=1), "location": "Hall B"} | kw
    return services.create_event(user or campus.teacher,
                                 targets=targets or [("section", campus.s3b.pk)], **fields)


def window(user):
    return list(services.events_between(user, soon(days=-1), soon(days=30)))


def titles(user):
    return list(Notification.objects.filter(recipient=user).values_list("title", flat=True))


def test_events_reach_their_audience_and_announce_themselves(campus):
    event = make(campus)
    assert window(campus.ayesha) == [event] and window(campus.teacher) == [event]
    assert window(campus.hamza) == []  # 3C
    assert titles(campus.ayesha) == ["Seminar: Graph theory seminar"]
    holiday = make(campus, user=campus.admin, targets=[("institution", campus.inst.pk)],
                   category="holiday", title="Spring break", all_day=True, location="")
    assert holiday in window(campus.hamza)
    assert AuditLog.objects.filter(action="event.created").count() == 2


def test_only_people_who_can_publish_there_add_events(campus):
    with pytest.raises(PermissionDenied):
        make(campus, targets=[("section", campus.s3c.pk)])
    with pytest.raises(PermissionDenied):
        make(campus, user=campus.ayesha)
    with pytest.raises(ValidationError, match="who the event is for"):
        services.create_event(campus.teacher, targets=[], title="x", starts_at=soon(),
                              ends_at=soon(hours=1), location="x")


@pytest.mark.parametrize(
    ("kw", "error"),
    [
        ({"ends_at": soon(days=2)}, "end after it starts"),
        ({"location": ""}, "where it happens"),
        ({"mode": "online", "location": ""}, "online link"),
        ({"mode": "online", "online_url": "zoom meeting"}, "online link"),
        ({"registration": True, "capacity": 0}, "at least 1"),
        ({"ends_at": soon(days=90)}, "60 days"),
    ],
)
def test_bad_events_are_refused(campus, kw, error):
    with pytest.raises(ValidationError, match=error):
        make(campus, **kw)
    assert not Event.objects.exists()


def test_waitlist_moves_up_in_order(campus, classmate):
    event = make(campus, registration=True, capacity=1)
    assert services.register(campus.ayesha, event).status == "going"
    assert services.register(classmate, event).status == "waitlisted"
    assert services.waitlist_position(classmate, event) == 1
    assert services.register(campus.ayesha, event).status == "going"  # asking twice is harmless

    services.unregister(campus.ayesha, event)
    assert services.my_registration(classmate, event) == "going"
    assert "You have a place: Graph theory seminar" in titles(classmate)

    # Coming back puts you at the back of the line.
    assert services.register(campus.ayesha, event).status == "waitlisted"
    with pytest.raises(PermissionDenied):
        services.register(campus.outsider, event)


def test_capacity_changes_and_closing_rules(campus, classmate):
    full = make(campus, title="Full", registration=True, capacity=2)
    services.register(campus.ayesha, full)
    services.register(classmate, full)
    with pytest.raises(ValidationError, match="already going"):
        services.update_event(campus.teacher, full, capacity=1)

    event = make(campus, registration=True, capacity=1)
    services.register(campus.ayesha, event)
    services.register(classmate, event)
    services.update_event(campus.teacher, event, capacity=2)
    assert services.my_registration(classmate, event) == "going"  # promoted by the bigger room

    no_signup = make(campus, title="Drop-in help")
    with pytest.raises(ValidationError, match="doesn't take sign-ups"):
        services.register(campus.ayesha, no_signup)
    closed = make(campus, title="Started", registration=True,
                  starts_at=soon(hours=-1), ends_at=soon(hours=1))
    with pytest.raises(ValidationError, match="closed"):
        services.register(campus.ayesha, closed)


def test_cancelling_tells_everyone_and_stops_sign_ups(campus, classmate):
    event = make(campus, registration=True)
    with pytest.raises(PermissionDenied):
        services.cancel_event(campus.ayesha, event)
    services.cancel_event(campus.teacher, event, reason="Speaker is ill")
    assert "Cancelled: Graph theory seminar" in titles(classmate)
    assert window(campus.ayesha)[0].status == "cancelled"  # still shown, marked cancelled
    with pytest.raises(ValidationError, match="cancelled"):
        services.register(campus.ayesha, event)
    with pytest.raises(ValidationError, match="cancelled"):
        services.update_event(campus.teacher, event, title="Back on")


def test_events_api(client, campus, classmate):
    client.force_login(campus.teacher)
    made = client.post("/api/events", {
        "title": "Lab practice exam", "category": "exam", "targets": [f"section:{campus.s3b.pk}"],
        "starts_at": soon(days=5).isoformat(), "ends_at": soon(days=5, hours=2).isoformat(),
        "location": "CS Lab 2", "registration": True, "capacity": 1,
    }, content_type="application/json")
    assert made.status_code == 201, made.json()
    eid = made.json()["id"]
    assert made.json()["category_label"] == "Exam" and made.json()["can_manage"]

    client.force_login(campus.ayesha)
    assert client.post(f"/api/events/{eid}/registration").json()["my_status"] == "going"
    assert client.get(f"/api/events/{eid}/attendees").status_code == 403
    client.force_login(classmate)
    mine = client.post(f"/api/events/{eid}/registration").json()
    assert (mine["my_status"], mine["my_waitlist_position"], mine["going"]) == ("waitlisted", 1, 1)

    client.force_login(campus.teacher)
    people = client.get(f"/api/events/{eid}/attendees").json()
    assert [(p["email"], p["status"]) for p in people] == [
        ("ayesha@test.edu", "going"), ("hamza@test.edu", "waitlisted")]
    start = soon(days=4).isoformat()
    listed = client.get("/api/events", {"start": start, "end": soon(days=6).isoformat()}).json()
    assert [e["title"] for e in listed] == ["Lab practice exam"]

    client.force_login(campus.hamza)
    assert client.delete(f"/api/events/{eid}/registration").json()["my_status"] is None
    client.force_login(campus.outsider)
    assert client.get(f"/api/events/{eid}").status_code == 404
