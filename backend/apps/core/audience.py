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


def parse_target(key: str) -> tuple[str, int]:
    """"section:12" -> ("section", 12). Raises ValueError for anything else."""
    scope, _, raw_id = key.partition(":")
    if scope not in AudienceScope.values or not raw_id.isdigit():
        raise ValueError(f"Not an audience: {key!r}")
    return scope, int(raw_id)


def _sections_in_scope(scope_type: str, scope_id: int, institution_id: int):
    from apps.academic.models import Section

    sections = Section.objects.filter(
        institution_id=institution_id, status=Section.Status.ACTIVE
    )
    filters = {
        AudienceScope.INSTITUTION: {},
        AudienceScope.CAMPUS: {"offering__course__department__campus_id": scope_id},
        AudienceScope.DEPARTMENT: {"offering__course__department_id": scope_id},
        AudienceScope.PROGRAM: {"program_id": scope_id},
        AudienceScope.OFFERING: {"offering_id": scope_id},
        AudienceScope.SECTION: {"pk": scope_id},
    }
    return sections.filter(**filters[scope_type]).values("pk")


def audience_user_ids(targets: list[tuple[str, int]], institution_id: int) -> set[int]:
    """Exactly who an audience covers: active students and teachers of the sections in scope,
    or every active member for an institution-wide audience. Used for reach counts and for
    notification fan-out, so the two always agree."""
    from apps.enrollment.models import SectionEnrollment, TeacherAssignment
    from apps.identity.models import User

    if not targets:
        return set()
    if any(scope == AudienceScope.INSTITUTION for scope, _ in targets):
        return set(
            User.objects.filter(institution_id=institution_id, is_active=True).values_list(
                "pk", flat=True
            )
        )
    people: set[int] = set()
    for scope, pk in targets:
        sections = _sections_in_scope(scope, pk, institution_id)
        people |= set(
            SectionEnrollment.objects.filter(
                section__in=sections, status=SectionEnrollment.Status.ACTIVE
            ).values_list("student_id", flat=True)
        )
        people |= set(
            TeacherAssignment.objects.filter(section__in=sections).values_list(
                "teacher_id", flat=True
            )
        )
    return people


def reach(targets: list[tuple[str, int]], institution_id: int) -> int:
    """How many distinct people an audience covers."""
    return len(audience_user_ids(targets, institution_id))


def scope_label(scope_type: str, scope_id: int) -> str:
    from apps.academic.models import (
        Campus,
        CourseOffering,
        Department,
        Institution,
        Program,
        Section,
    )

    if scope_type == AudienceScope.SECTION:
        s = Section.objects.select_related("offering__course").filter(pk=scope_id).first()
        return f"{s.offering.course.code} · {s.code}" if s else "Removed section"
    if scope_type == AudienceScope.OFFERING:
        o = CourseOffering.objects.select_related("course").filter(pk=scope_id).first()
        return f"All {o.course.code} sections" if o else "Removed course"
    model = {
        AudienceScope.INSTITUTION: Institution,
        AudienceScope.CAMPUS: Campus,
        AudienceScope.DEPARTMENT: Department,
        AudienceScope.PROGRAM: Program,
    }[scope_type]
    obj = model.objects.filter(pk=scope_id).first()
    return str(obj) if obj else "Removed audience"


def audience_options(user) -> list[dict]:
    """Every audience this user may post to, grouped for a picker, with how many people each
    reaches. Mirrors can_target: admins get the institution, departments and all sections;
    coordinators their departments and sections in them; teachers the sections they teach."""
    from django.db.models import Count
    from django.db.models import Q as DQ

    from apps.academic.models import Department, Section
    from apps.enrollment.models import TeacherAssignment
    from apps.identity.roles import coordinated_department_ids, is_institution_admin

    if not user.is_authenticated or user.institution_id is None:
        return []
    inst = user.institution_id
    admin = is_institution_admin(user)
    dept_ids = (
        set(Department.objects.filter(institution_id=inst).values_list("pk", flat=True))
        if admin
        else coordinated_department_ids(user)
    )
    options = []
    if admin:
        options.append({
            "key": f"institution:{inst}", "scope_type": "institution", "scope_id": inst,
            "label": f"Everyone at {user.institution.name}", "group": "Institution",
            "reach": reach([("institution", inst)], inst),
        })
    for dept in Department.objects.filter(pk__in=dept_ids).order_by("name"):
        options.append({
            "key": f"department:{dept.pk}", "scope_type": "department", "scope_id": dept.pk,
            "label": dept.name, "group": "Departments",
            "reach": reach([("department", dept.pk)], inst),
        })
    taught = set(
        TeacherAssignment.objects.filter(teacher=user).values_list("section_id", flat=True)
    )
    section_filter = DQ(pk__in=taught)
    if dept_ids:
        section_filter |= DQ(offering__course__department_id__in=dept_ids)
    sections = (
        Section.objects.filter(section_filter, institution_id=inst, status=Section.Status.ACTIVE)
        .select_related("offering__course")
        .annotate(
            students=Count(
                "enrollments", filter=DQ(enrollments__status="active"), distinct=True
            ),
            teachers=Count("teacher_assignments", distinct=True),
        )
        .order_by("offering__course__code", "code")
    )
    for s in sections:
        options.append({
            "key": f"section:{s.pk}", "scope_type": "section", "scope_id": s.pk,
            "label": f"{s.offering.course.code} · {s.code}", "group": "Sections",
            "detail": s.offering.course.title,
            "reach": s.students + s.teachers,
        })
    return options


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
