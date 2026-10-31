"""Reports for institution admins (SRS 12.1). Everything is scoped to one period, so the numbers
on the page agree with each other. Reports show counts and rates, never lists of who did what,
and nothing here ranks or scores individual students or teachers."""

from collections import Counter
from datetime import datetime, time, timedelta
from statistics import median
from zoneinfo import ZoneInfo

from django.db.models import Count, Q
from django.utils import timezone

from apps.academic.models import Section
from apps.assignments.models import Assignment, Submission
from apps.attendance.models import AttendanceRecord
from apps.chat.models import Message
from apps.enrollment.models import SectionEnrollment
from apps.feed.models import Comment, Post, Report
from apps.identity.models import User
from apps.notices.models import Notice
from apps.notifications.models import Notification
from apps.resources.models import ResourceDownload

from .models import ImportRun, SyncSource
from .people import require_admin

PERIODS = {7, 30, 90}


def _buckets(since, now, tz, days: int) -> list[tuple]:
    """Days for a week's view, weeks (from Monday) beyond that: (label, start, end)."""
    local_now = now.astimezone(tz)
    if days <= 7:
        out, day = [], (local_now - timedelta(days=days - 1)).date()
        for _ in range(days):
            start = datetime.combine(day, time.min, tzinfo=tz)
            out.append((day.isoformat(), start, start + timedelta(days=1)))
            day += timedelta(days=1)
        return out
    first = (local_now - timedelta(days=days - 1)).date()
    first -= timedelta(days=first.weekday())
    out, day = [], first
    while day <= local_now.date():
        start = datetime.combine(day, time.min, tzinfo=tz)
        out.append((day.isoformat(), start, start + timedelta(days=7)))
        day += timedelta(days=7)
    return out


def _series(qs, field: str, buckets) -> list[dict]:
    stamps = list(qs.values_list(field, flat=True))
    return [{"label": label, "value": sum(1 for s in stamps if start <= s < end)}
            for label, start, end in buckets]


def build(admin, days: int = 30) -> dict:
    require_admin(admin)
    if days not in PERIODS:
        days = 30
    inst = admin.institution
    tz = ZoneInfo(inst.timezone)
    now = timezone.now()
    since = now - timedelta(days=days)
    buckets = _buckets(since, now, tz, days)
    scope = {"institution_id": inst.pk}

    # People -------------------------------------------------------------------------------
    people = User.objects.filter(institution_id=inst.pk, is_active=True)
    by_kind = Counter(people.values_list("kind", flat=True))
    active = Counter(people.filter(last_login__gte=since).values_list("kind", flat=True))
    # Invited and not yet signed in: the account still has no usable password.
    invited = people.filter(password__startswith="!").count()

    # Activity -----------------------------------------------------------------------------
    activity = [
        {"key": "messages", "label": "Chat messages",
         "points": _series(Message.objects.filter(**scope, created_at__gte=buckets[0][1]),
                           "created_at", buckets)},
        {"key": "feed", "label": "Feed posts and comments",
         "points": [
             {"label": a["label"], "value": a["value"] + b["value"]}
             for a, b in zip(
                 _series(Post.objects.filter(**scope, created_at__gte=buckets[0][1]),
                         "created_at", buckets),
                 _series(Comment.objects.filter(**scope, created_at__gte=buckets[0][1]),
                         "created_at", buckets), strict=True)
         ]},
        {"key": "submissions", "label": "Assignment submissions",
         "points": _series(Submission.objects.filter(**scope, submitted_at__gte=buckets[0][1]),
                           "submitted_at", buckets)},
    ]

    # Notices: reach and read rate from the notifications that delivered them ---------------
    notices = list(Notice.objects.filter(**scope, status=Notice.Status.PUBLISHED,
                                         published_at__gte=since).order_by("-published_at")[:12])
    delivered = Notification.objects.filter(
        dedupe_key__in=[f"notice:{n.pk}" for n in notices], in_app=True
    ).values("dedupe_key").annotate(
        sent=Count("id"), read=Count("id", filter=Q(read_at__isnull=False))
    )
    reach = {d["dedupe_key"]: d for d in delivered}
    notice_rows = []
    for n in notices:
        d = reach.get(f"notice:{n.pk}", {"sent": 0, "read": 0})
        notice_rows.append({"id": n.pk, "title": n.title, "published_at": n.published_at,
                            "important": n.priority == "important", "reached": d["sent"],
                            "read": d["read"],
                            "read_rate": round(100 * d["read"] / d["sent"]) if d["sent"] else None})

    # Assignments due in the period: submitted and graded shares ----------------------------
    work = list(Assignment.objects.filter(
        **scope, status=Assignment.Status.PUBLISHED, due_at__gte=since, due_at__lte=now
    ).select_related("section__offering__course").order_by("-due_at")[:12])
    class_sizes = dict(SectionEnrollment.objects.filter(
        section__in=[a.section_id for a in work], status=SectionEnrollment.Status.ACTIVE
    ).values("section").annotate(n=Count("id")).values_list("section", "n"))
    assignment_rows, total_expected, total_in = [], 0, 0
    for a in work:
        submitted = Submission.objects.filter(assignment=a).values("student").distinct().count()
        late = Submission.objects.filter(assignment=a, is_late=True).values("student") \
            .distinct().count()
        graded = a.grades.count()
        size = class_sizes.get(a.section_id, 0)
        total_expected += size
        total_in += min(submitted, size)
        assignment_rows.append({
            "id": a.pk, "title": a.title,
            "section": f"{a.section.offering.course.code} · {a.section.code}",
            "students": size, "submitted": submitted, "late": late, "graded": graded,
            "released": a.grades_released_at is not None,
            "submission_rate": round(100 * submitted / size) if size else None,
        })

    # Attendance by section, when it's on ----------------------------------------------------
    attendance = None
    if inst.attendance_enabled:
        records = AttendanceRecord.objects.filter(**scope, session__date__gte=since.date())
        per = records.values("session__section").annotate(
            total=Count("id", filter=~Q(status="excused")),
            attended=Count("id", filter=Q(status__in=["present", "late"])),
        )
        names = {s.pk: f"{s.offering.course.code} · {s.code}" for s in Section.objects.filter(
            pk__in=[p["session__section"] for p in per]).select_related("offering__course")}
        rows = [{"section": names.get(p["session__section"], "?"),
                 "rate": round(100 * p["attended"] / p["total"]) if p["total"] else None,
                 "records": p["total"]} for p in per]
        total = sum(p["total"] for p in per)
        attended = sum(p["attended"] for p in per)
        attendance = {"rate": round(100 * attended / total) if total else None,
                      "sections": sorted(rows, key=lambda r: r["section"])}

    # Resources: downloads and distinct people per resource ----------------------------------
    downloads = ResourceDownload.objects.filter(**scope, created_at__gte=since)
    top = downloads.values("resource", "resource__title", "resource__offering__course__code") \
        .annotate(n=Count("id"), people=Count("user", distinct=True)).order_by("-n")[:10]
    resources = {
        "downloads": downloads.count(), "people": downloads.values("user").distinct().count(),
        "top": [{"title": t["resource__title"], "course": t["resource__offering__course__code"],
                 "downloads": t["n"], "people": t["people"]} for t in top],
    }

    # Feed and moderation --------------------------------------------------------------------
    posts = Post.objects.filter(**scope, created_at__gte=since, deleted_at__isnull=True)
    reports = Report.objects.filter(**scope)
    resolved = list(reports.filter(resolved_at__gte=since).values_list("created_at", "resolved_at"))
    hours = [(done - opened).total_seconds() / 3600 for opened, done in resolved if done]
    moderation = {
        "open": reports.filter(status=Report.Status.OPEN).count(),
        "reported": reports.filter(created_at__gte=since).count(),
        "resolved": len(resolved),
        "median_hours": round(median(hours), 1) if hours else None,
        "actioned": reports.filter(resolved_at__gte=since, status=Report.Status.ACTIONED).count(),
    }
    feed = {
        "posts": posts.count(),
        "comments": Comment.objects.filter(**scope, created_at__gte=since,
                                           deleted_at__isnull=True).count(),
        "people": posts.values("author").distinct().count(),
    }

    # Sync ---------------------------------------------------------------------------------
    runs = Counter(ImportRun.objects.filter(**scope, created_at__gte=since)
                   .values_list("status", flat=True))
    sync = {
        "applied": runs.get(ImportRun.Status.APPLIED, 0),
        "waiting": runs.get(ImportRun.Status.PREVIEW, 0),
        "discarded": runs.get(ImportRun.Status.DISCARDED, 0),
        "sources": SyncSource.objects.filter(**scope, is_active=True).count(),
        "failing": SyncSource.objects.filter(**scope, is_active=True)
        .exclude(last_error="").count(),
    }

    return {
        "days": days,
        "people": {
            "students": by_kind.get("student", 0), "teachers": by_kind.get("teacher", 0),
            "staff": by_kind.get("staff", 0), "invited": invited,
            "active": {"students": active.get("student", 0), "teachers": active.get("teacher", 0),
                       "staff": active.get("staff", 0)},
        },
        "activity": activity,
        "notices": notice_rows,
        "assignments": {
            "rows": assignment_rows,
            "submission_rate": round(100 * total_in / total_expected) if total_expected else None,
        },
        "attendance": attendance,
        "resources": resources,
        "feed": feed,
        "moderation": moderation,
        "sync": sync,
    }
