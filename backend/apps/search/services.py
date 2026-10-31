"""Search across CampusVerse (SRS 5.14).

Every type is searched through the same visibility rules its own pages use, so a result is only
ever something the person could already open: restricted titles, snippets, attachments and even
their existence never show. Filters: content type, course, and how recent.
"""

import re
from datetime import timedelta

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.utils import timezone

from apps.academic.models import Course, CourseOffering, Section
from apps.assignments.models import Assignment
from apps.assignments.services import visible_assignments
from apps.core.models import AudienceTarget
from apps.events.models import Event
from apps.feed.models import Post, Visibility
from apps.identity.roles import is_institution_admin
from apps.notices.models import Notice
from apps.resources.services import visible_resources
from apps.scheduling.services import member_section_ids

TYPES = ("notices", "courses", "resources", "posts", "events", "assignments")
MIN_QUERY = 2
PER_TYPE = 6
SNIPPET = 160


def snippet(text: str, q: str) -> str:
    """Plain text around the first match (the web app highlights; nothing here is HTML)."""
    text = " ".join((text or "").split())
    at = text.lower().find(q.lower())
    if at < 0 or len(text) <= SNIPPET:
        return text[:SNIPPET] + ("…" if len(text) > SNIPPET else "")
    start = max(0, at - 50)
    end = min(len(text), start + SNIPPET)
    return ("…" if start else "") + text[start:end] + ("…" if end < len(text) else "")


def _course_targets(model, course_id: int):
    """Ids of `model` rows shared with this course (a section of it, or all of it)."""
    sections = Section.objects.filter(offering__course_id=course_id).values_list("pk", flat=True)
    offerings = CourseOffering.objects.filter(course_id=course_id).values_list("pk", flat=True)
    return AudienceTarget.objects.filter(
        Q(scope_type="section", scope_id__in=list(sections))
        | Q(scope_type="offering", scope_id__in=list(offerings)),
        content_type=ContentType.objects.get_for_model(model),
    ).values("object_id")


def search(user, q: str, *, types=TYPES, course_id: int | None = None, days: int | None = None,
           limit: int = PER_TYPE) -> dict:
    q = " ".join((q or "").split())[:100]
    if len(q) < MIN_QUERY or user.institution_id is None:
        return {"query": q, "results": {}, "total": 0}
    since = timezone.now() - timedelta(days=days) if days else None
    words = [w for w in re.split(r"\s+", q) if w]

    def matches(*fields):
        """Every word appears in at least one of the fields."""
        cond = Q()
        for w in words:
            any_field = Q()
            for f in fields:
                any_field |= Q(**{f"{f}__icontains": w})
            cond &= any_field
        return cond

    results: dict[str, list[dict]] = {}

    if "notices" in types:
        qs = Notice.objects.live().visible_to(user).filter(matches("title", "body"))
        if course_id:
            qs = qs.filter(pk__in=_course_targets(Notice, course_id))
        if since:
            qs = qs.filter(published_at__gte=since)
        results["notices"] = [
            {"id": n.pk, "title": n.title, "snippet": snippet(n.body, words[0]),
             "link": f"/notices#notice-{n.pk}", "date": n.published_at, "course": None}
            for n in qs.order_by("-published_at")[:limit]
        ]

    if "courses" in types:
        courses = Course.objects.filter(institution_id=user.institution_id, is_active=True)
        if not is_institution_admin(user):
            courses = courses.filter(offerings__sections__in=member_section_ids(user)).distinct()
        if course_id:
            courses = courses.filter(pk=course_id)
        results["courses"] = [
            {"id": c.pk, "title": f"{c.code} · {c.title}", "snippet": c.department.name,
             "link": "/timetable", "date": None, "course": c.code, "color": c.color}
            for c in courses.filter(matches("code", "title")).select_related("department")
            .order_by("code")[:limit]
        ]

    if "resources" in types:
        qs = visible_resources(user, status="all", offering_id=None).filter(
            matches("title", "description"))
        if course_id:
            qs = qs.filter(offering__course_id=course_id)
        if since:
            qs = qs.filter(updated_at__gte=since)
        results["resources"] = [
            {"id": r.pk, "title": r.title, "snippet": snippet(r.description, words[0])
             or r.get_kind_display(), "link": f"/resources/{r.pk}", "date": r.updated_at,
             "course": r.offering.course.code, "color": r.offering.course.color}
            for r in qs.order_by("-updated_at")[:limit]
        ]

    if "posts" in types:
        qs = Post.objects.visible_to(user).filter(
            Q(visibility=Visibility.VISIBLE) | Q(author=user)
        ).exclude(visibility=Visibility.REMOVED).filter(matches("body")).select_related("author")
        if course_id:
            qs = qs.filter(pk__in=_course_targets(Post, course_id))
        if since:
            qs = qs.filter(created_at__gte=since)
        results["posts"] = [
            {"id": p.pk, "title": f"{p.author.get_full_name() or p.author.email} posted",
             "snippet": snippet(p.body, words[0]), "link": f"/feed#post-{p.pk}",
             "date": p.created_at, "course": None}
            for p in qs.order_by("-created_at")[:limit]
        ]

    if "events" in types:
        qs = Event.objects.visible_to(user).filter(matches("title", "description", "location"))
        if course_id:
            qs = qs.filter(pk__in=_course_targets(Event, course_id))
        if since:
            qs = qs.filter(starts_at__gte=since)
        results["events"] = [
            {"id": e.pk, "title": e.title, "snippet": snippet(e.description, words[0])
             or e.get_category_display(), "link": f"/calendar/{e.pk}", "date": e.starts_at,
             "course": None, "status": e.status}
            for e in qs.distinct().order_by("-starts_at")[:limit]
        ]

    if "assignments" in types:
        qs = visible_assignments(user).filter(matches("title", "instructions"))
        if course_id:
            qs = qs.filter(section__offering__course_id=course_id)
        if since:
            qs = qs.filter(due_at__gte=since)
        results["assignments"] = [
            {"id": a.pk, "title": a.title, "snippet": snippet(a.instructions, words[0]),
             "link": f"/assignments/{a.pk}", "date": a.due_at,
             "course": a.section.offering.course.code, "color": a.section.offering.course.color,
             "draft": a.status == Assignment.Status.DRAFT}
            for a in qs.order_by("-due_at")[:limit]
        ]

    return {"query": q, "results": results,
            "total": sum(len(v) for v in results.values())}
