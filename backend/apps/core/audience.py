"""The one place that decides who can see academic content.

A user's *context set* is the scopes they belong to, derived from active enrollments and
teacher assignments, e.g. {("institution", 1), ("department", 4), ("section", 310)}.
Content is visible when any of its AudienceTargets is in that set. Pages, downloads, search
and notifications must all go through this module.
"""

from collections import defaultdict

from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db.models import Q

from apps.core.models import AudienceScope, AudienceTarget

CONTEXT_TTL = 60 * 10


def _cache_key(user_id: int) -> str:
    return f"audience:context:{user_id}"


def invalidate_context(user_id: int) -> None:
    cache.delete(_cache_key(user_id))


def context_keys(user) -> frozenset[tuple[str, int]]:
    if not user.is_authenticated or user.institution_id is None:
        return frozenset()
    key = _cache_key(user.pk)
    cached = cache.get(key)
    if cached is not None:
        return cached

    from apps.academic.models import Section
    from apps.enrollment.models import SectionEnrollment, TeacherAssignment

    section_ids = set(
        SectionEnrollment.objects.filter(
            student=user, status=SectionEnrollment.Status.ACTIVE
        ).values_list("section_id", flat=True)
    )
    section_ids |= set(
        TeacherAssignment.objects.filter(teacher=user).values_list("section_id", flat=True)
    )

    keys = {(AudienceScope.INSTITUTION.value, user.institution_id)}
    sections = Section.objects.filter(
        pk__in=section_ids, institution_id=user.institution_id, status=Section.Status.ACTIVE
    ).select_related("offering__course__department")
    for section in sections:
        department = section.offering.course.department
        keys.add((AudienceScope.SECTION.value, section.pk))
        keys.add((AudienceScope.OFFERING.value, section.offering_id))
        keys.add((AudienceScope.DEPARTMENT.value, department.pk))
        if department.campus_id:
            keys.add((AudienceScope.CAMPUS.value, department.campus_id))
        if section.program_id:
            keys.add((AudienceScope.PROGRAM.value, section.program_id))

    result = frozenset(keys)
    cache.set(key, result, CONTEXT_TTL)
    return result


def visible_q(user, model) -> Q:
    """Filter for `model` rows the user may see. Use as `Model.objects.filter(visible_q(...))`."""
    keys = context_keys(user)
    if not keys:
        return Q(pk__in=[])
    by_scope: dict[str, set[int]] = defaultdict(set)
    for scope, pk in keys:
        by_scope[scope].add(pk)
    match = Q()
    for scope, ids in by_scope.items():
        match |= Q(scope_type=scope, scope_id__in=ids)
    targeted = AudienceTarget.objects.filter(
        match,
        content_type=ContentType.objects.get_for_model(model),
        institution_id=user.institution_id,
    ).values("object_id")
    return Q(pk__in=targeted, institution_id=user.institution_id)


def can_view(user, obj) -> bool:
    return type(obj).objects.filter(visible_q(user, type(obj)), pk=obj.pk).exists()


def _scope_owner(scope_type: str, scope_id: int) -> tuple[int, int | None] | None:
    """(institution_id, department_id) for a scope, or None if it doesn't exist."""
    from apps.academic.models import (
        Campus,
        CourseOffering,
        Department,
        Institution,
        Program,
        Section,
    )

    if scope_type == AudienceScope.INSTITUTION:
        return (scope_id, None) if Institution.objects.filter(pk=scope_id).exists() else None
    lookups = {
        AudienceScope.CAMPUS: (Campus, "institution_id", None),
        AudienceScope.DEPARTMENT: (Department, "institution_id", "id"),
        AudienceScope.PROGRAM: (Program, "institution_id", "department_id"),
        AudienceScope.OFFERING: (CourseOffering, "institution_id", "course__department_id"),
        AudienceScope.SECTION: (Section, "institution_id", "offering__course__department_id"),
    }
    if scope_type not in lookups:
        return None
    model, inst_field, dept_field = lookups[scope_type]
    fields = [inst_field] + ([dept_field] if dept_field else [])
    row = model.objects.filter(pk=scope_id).values_list(*fields).first()
    if row is None:
        return None
    return (row[0], row[1] if dept_field else None)


def can_target(user, scope_type: str, scope_id: int) -> bool:
    """Whether `user` may publish content to this audience.

    Admins: anything in their institution. Coordinators: scopes inside their departments.
    Teachers: only sections they teach.
    """
    from apps.enrollment.models import TeacherAssignment
    from apps.identity.roles import coordinated_department_ids, is_institution_admin

    owner = _scope_owner(scope_type, scope_id)
    if owner is None or not user.is_authenticated or owner[0] != user.institution_id:
        return False
    if is_institution_admin(user):
        return True
    department_id = owner[1]
    if department_id is not None and department_id in coordinated_department_ids(user):
        return True
    if scope_type == AudienceScope.SECTION:
        return TeacherAssignment.objects.filter(teacher=user, section_id=scope_id).exists()
    return False
