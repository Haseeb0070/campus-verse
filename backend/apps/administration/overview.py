from datetime import timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

from apps.academic.models import Department, Section
from apps.identity.models import User
from apps.scheduling.models import ClassMeeting
from apps.scheduling.services import expand, load_meetings

from .models import ImportRun


def room_clashes(institution, days: int = 7, limit: int = 10) -> list[dict]:
    """Rooms double-booked in the coming week, after one-off changes are applied."""
    tz = ZoneInfo(institution.timezone)
    start = timezone.now().astimezone(tz).date()
    occs = [
        o
        for o in expand(
            load_meetings(ClassMeeting.objects.filter(institution=institution)),
            start, start + timedelta(days=days - 1), tz,
        )
        if o.is_happening and o.room and o.mode == "in_person"
    ]
    clashes = []
    for i, a in enumerate(occs):
        for b in occs[i + 1:]:
            if a.room == b.room and a.date == b.date and a.starts_at < b.ends_at \
                    and b.starts_at < a.ends_at:
                clashes.append({
                    "room": a.room,
                    "date": a.date,
                    "time": f"{max(a.starts_at, b.starts_at):%H:%M}",
                    "classes": [f"{a.course_code} · {a.section_code}",
                                f"{b.course_code} · {b.section_code}"],
                })
    return clashes[:limit]


def overview(admin) -> dict:
    inst = admin.institution
    people = User.objects.filter(institution=inst, is_active=True)
    week_ago = timezone.now() - timedelta(days=7)
    return {
        "students": people.filter(kind=User.Kind.STUDENT).count(),
        "teachers": people.filter(kind=User.Kind.TEACHER).count(),
        "staff": people.filter(kind=User.Kind.STAFF).count(),
        "invited": people.filter(password__startswith="!").count(),  # haven't set a password
        "signed_in_week": people.filter(last_login__gte=week_ago).count(),
        "active_people": people.count(),
        "sections": Section.objects.filter(institution=inst, status=Section.Status.ACTIVE).count(),
        "departments": Department.objects.filter(institution=inst).count(),
        "pending_imports": ImportRun.objects.filter(
            institution=inst, status=ImportRun.Status.PREVIEW
        ).count(),
        "room_clashes": room_clashes(inst),
    }
